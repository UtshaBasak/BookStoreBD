import type { Request, RequestHandler, Response } from 'express';

import type { Types } from 'mongoose';

import type { Book, HomeSections, SellerHit, SuggestHit, SuggestResponse } from '@shared/api.js';

import AddBook, { type LeanBook } from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import Order from '../models/Order.model.js';
import User from '../models/user.model.js';
import Wishlist from '../models/Wishlist.model.js';
import { config } from '../config/env.js';
import type { ByIdsQuery, CatalogueQuery, FeaturedQuery, ForYouQuery, SuggestQuery } from '../schemas/index.js';
import { errorMessage } from '../utils/error.js';
import { validatedQuery } from '../middleware/validate.js';
import { contains, sameText } from '../utils/regex.js';
import { LIST_IMAGE_PROJECTION, toListBook, withCoverUrls } from '../utils/projections.js';
import { API_PREFIX } from '../config/apiPaths.js';
import { phoneticPattern } from '../utils/phonetic.js';
import { logSearch, popularSearches } from '../utils/searchLog.js';

/**
 * What a typed search matches: the title, author or ISBN as written, or - for
 * a query long enough to mean something - a title or author that sounds the
 * same in the other script (utils/phonetic.ts).
 */
export const searchClauses = (search: string): Record<string, unknown>[] => {
  const pattern = contains(String(search));
  const clauses: Record<string, unknown>[] = [{ title: pattern }, { author: pattern }, { isbn: pattern }];
  const sound = phoneticPattern(String(search));
  if (sound) clauses.push({ searchKey: sound });
  return clauses;
};

const SORTS = {
  // The default: Quick deals first, the biggest share off leading, and the
  // newest after them - which, with no deals running, is simply the newest.
  relevant: { discountPercent: -1, createdAt: -1 },
  newest: { createdAt: -1 },
  // Score first, then how many people it rests on: one five-star review is not
  // a better recommendation than forty averaging 4.6.
  rated: { ratingAverage: -1, ratingCount: -1 },
  // What the buyer pays, which is the sale price when there is one.
  priceLowHigh: { salePrice: 1 },
  priceHighLow: { salePrice: -1 },
  // The two ways of ranking deals: the share off, or the taka saved. Both
  // show discounted books only (see buildFilter); each matches an index.
  dealPercent: { discountPercent: -1, createdAt: -1 },
  dealAmount: { discountAmount: -1 },
} as const satisfies Record<CatalogueQuery['sort'], Record<string, 1 | -1>>;

/** Builds the query from parameters the schema has already narrowed. */
const buildFilter = (q: CatalogueQuery): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};

  if (q.search) {
    // Title, author or ISBN: the homepage's search box offers all three -
    // and the same in the other script, by sound.
    filter.$or = searchClauses(q.search);
  }

  if (q.bookType) filter.bookType = q.bookType;
  if (q.condition) filter.condition = sameText(q.condition);
  if (q.category?.length) filter.category = { $in: q.category.map(sameText) };

  // Ranking by the size of a deal means looking at deals.
  if (q.deals || q.sort === 'dealPercent' || q.sort === 'dealAmount') filter.discountPercent = { $gt: 0 };

  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.salePrice = {
      ...(q.minPrice !== undefined ? { $gte: q.minPrice } : {}),
      ...(q.maxPrice !== undefined ? { $lte: q.maxPrice } : {}),
    };
  }

  // A floor rather than an exact match, which is what somebody means when they
  // tick four stars.
  if (q.rating !== undefined) filter.ratingAverage = { $gte: q.rating };
  if (q.inStock) filter.stock = { $gt: 0 };

  return filter;
};

/**
 * One page of the catalogue, filtered, sorted and paged by MongoDB against
 * indexes, so a visitor downloads only the books on screen and the cost does
 * not grow with the catalogue.
 */
export const Booklist: RequestHandler = async (req, res) => {
  const q = validatedQuery<CatalogueQuery>(req);
  const filter = buildFilter(q);

  try {
    // A seller's shop: their books only. An unknown name finds nothing.
    if (q.seller) {
      // `String()` at the sink, as everywhere else: the schema already made it
      // text, and this says so where the query is built.
      const seller = await User.findOne({ username: String(q.seller) }, { email: 1 }).lean();
      filter.sellerEmail = seller?.email ?? '\u0000';
    }

    const [items, total] = await Promise.all([
      AddBook.find(filter, LIST_IMAGE_PROJECTION)
        // `_id` breaks ties, so a book cannot appear on two pages or none:
        // documents that compare equal on `price` have no inherent order.
        .sort({ ...SORTS[q.sort], _id: -1 })
        .skip((q.page - 1) * q.pageSize)
        .limit(q.pageSize)
        .lean(),
      AddBook.countDocuments(filter),
    ]);

    // What people search the whole catalogue for - not a shop's own box -
    // counted once per search, on its first page.
    if (q.search && !q.seller && q.page === 1) logSearch(q.search, total);

    res.status(200).json({
      items: items.map(withCoverUrls),
      total,
      page: q.page,
      pageSize: q.pageSize,
      pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

/**
 * The newest few listings, at most one per title.
 *
 * The homepage strip wants ten books, not ten copies of the same textbook from
 * ten sellers; the `$group` collapses them in the database.
 */
export const Featured = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { limit } = validatedQuery<FeaturedQuery>(req);

  try {
    const newest = await AddBook.aggregate<{ _id: unknown }>([
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $group: {
          _id: { title: '$title', bookType: '$bookType' },
          id: { $first: '$_id' },
          // Carried through the group so the order below is the real one, not
          // whatever order ObjectIds happen to fall in.
          createdAt: { $first: '$createdAt' },
        },
      },
      { $sort: { createdAt: -1, id: -1 } },
      { $limit: limit },
      { $project: { _id: '$id' } },
    ]);

    const ids = newest.map((row) => row._id);
    const books = await AddBook.find({ _id: { $in: ids } }, LIST_IMAGE_PROJECTION).lean();

    // `$in` does not answer in the order it was asked, and the strip is meant
    // to read newest-first.
    const byId = new Map(books.map((book) => [String(book._id), book]));
    const ordered = ids
      .map((id) => byId.get(String(id)))
      .filter((book): book is (typeof books)[number] => Boolean(book));

    res.status(200).json(ordered.map(withCoverUrls));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

// ------------------------------------------------------------------ homepage

/** The books with these ids, in this order, as list cards. */
const booksInOrder = async (ids: readonly unknown[]): Promise<LeanBook[]> => {
  if (!ids.length) return [];
  const books = await AddBook.find({ _id: { $in: ids } }, LIST_IMAGE_PROJECTION).lean<LeanBook[]>();
  const byId = new Map(books.map((book) => [String(book._id), book]));
  return ids
    .map((id) => byId.get(String(id)))
    .filter((book): book is LeanBook => Boolean(book))
    .map(withCoverUrls);
};

const inStock = { stock: { $gt: 0 } };
const SHELF = 12;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Book ids ranked by copies ordered, optionally since a date. */
const mostOrdered = async (since?: Date): Promise<Types.ObjectId[]> => {
  const rows = await Order.aggregate<{ _id: Types.ObjectId }>([
    { $match: { isReturned: { $ne: 1 }, status: { $ne: 'Cancelled' }, ...(since ? { createdAt: { $gte: since } } : {}) } },
    { $group: { _id: '$bookId', copies: { $sum: { $ifNull: ['$quantity', 1] } }, last: { $max: '$createdAt' } } },
    { $sort: { copies: -1, last: -1 } },
    { $limit: SHELF * 2 },
  ]);
  return rows.map((row) => row._id);
};

/** Book ids ranked by how many people have saved them, optionally since a date. */
const mostWished = async (since?: Date): Promise<Types.ObjectId[]> => {
  const rows = await Wishlist.aggregate<{ _id: Types.ObjectId }>([
    ...(since ? [{ $match: { createdAt: { $gte: since } } }] : []),
    { $group: { _id: '$book', saves: { $sum: 1 } } },
    { $sort: { saves: -1 } },
    { $limit: SHELF * 2 },
  ]);
  return rows.map((row) => row._id);
};

/** Ranked lists merged, each id scored by where it came in each list. */
const blend = (...lists: { ids: readonly Types.ObjectId[]; weight: number }[]): Types.ObjectId[] => {
  const scores = new Map<string, { id: Types.ObjectId; score: number }>();
  for (const { ids, weight } of lists) {
    ids.forEach((id, rank) => {
      const key = String(id);
      const entry = scores.get(key) ?? { id, score: 0 };
      entry.score += weight * (ids.length - rank);
      scores.set(key, entry);
    });
  }
  return [...scores.values()].sort((a, b) => b.score - a.score).map((entry) => entry.id);
};

/** A shelf of real books: ids that no longer exist or have sold out are dropped. */
const shelf = async (ids: readonly unknown[], { stockOnly = false } = {}): Promise<LeanBook[]> =>
  (await booksInOrder(ids)).filter((book) => !stockOnly || Number(book.stock) > 0).slice(0, SHELF);

/** The sections as the database hands them over: ObjectIds, serialised on the way out. */
type StoredSections = { [K in keyof HomeSections]: HomeSections[K] extends Book[] ? LeanBook[] : HomeSections[K] };

const buildSections = async (): Promise<StoredSections> => {
  const fortnightAgo = new Date(Date.now() - 14 * DAY_MS);

  const [deals, soldRecently, wishedRecently, soldEver, wishedEver, topRated, budget, discover, writers, categories] =
    await Promise.all([
      AddBook.find({ ...inStock, discountPercent: { $gt: 0 } }, LIST_IMAGE_PROJECTION)
        .sort({ discountPercent: -1, discountAmount: -1, _id: -1 })
        .limit(SHELF)
        .lean<LeanBook[]>(),
      mostOrdered(fortnightAgo),
      mostWished(fortnightAgo),
      mostOrdered(),
      mostWished(),
      AddBook.find({ ...inStock, ratingCount: { $gt: 0 } }, LIST_IMAGE_PROJECTION)
        .sort({ ratingAverage: -1, ratingCount: -1, _id: -1 })
        .limit(SHELF)
        .lean<LeanBook[]>(),
      AddBook.find({ ...inStock, salePrice: { $lte: BUDGET_PRICE } }, LIST_IMAGE_PROJECTION)
        .sort({ salePrice: 1, _id: -1 })
        .limit(SHELF)
        .lean<LeanBook[]>(),
      // Something different on every visit: the point of the shelf.
      AddBook.aggregate<{ _id: Types.ObjectId }>([{ $match: inStock }, { $sample: { size: SHELF } }, { $project: { _id: 1 } }]),
      AddBook.aggregate<{ _id: string; name: string; books: number }>([
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: { $toLower: { $trim: { input: '$author' } } },
            name: { $first: '$author' },
            books: { $sum: 1 },
          },
        },
        { $sort: { books: -1, name: 1 } },
        { $limit: 40 },
      ]),
      AddBook.aggregate<{ _id: string; name: string; books: number }>([
        { $unwind: '$category' },
        { $group: { _id: { $toLower: '$category' }, name: { $first: '$category' }, books: { $sum: 1 } } },
        { $sort: { books: -1, name: 1 } },
      ]),
    ]);

  // Writers ranked by copies sold, then by how many of their books are listed.
  const soldByAuthor = await Order.aggregate<{ _id: string; sold: number }>([
    { $match: { isReturned: { $ne: 1 }, status: { $ne: 'Cancelled' } } },
    { $group: { _id: { $toLower: { $trim: { input: { $ifNull: ['$author', ''] } } } }, sold: { $sum: { $ifNull: ['$quantity', 1] } } } },
  ]);
  const sold = new Map(soldByAuthor.map((row) => [row._id, row.sold]));

  return {
    deals: deals.map(withCoverUrls),
    // Recent sales count for more than recent saves: somebody paid.
    trending: await shelf(blend({ ids: soldRecently, weight: 3 }, { ids: wishedRecently, weight: 1 }), { stockOnly: true }),
    // Saved to wishlists, then reviewed: what people want and talk about.
    popular: await shelf(blend({ ids: wishedEver, weight: 2 }, { ids: soldEver, weight: 1 })),
    bestsellers: await shelf(soldEver),
    topRated: topRated.map(withCoverUrls),
    budget: budget.map(withCoverUrls),
    discover: await shelf(discover.map((row) => row._id)),
    writers: writers
      .filter((row) => row.name?.trim())
      .map((row) => ({
        name: row.name.trim(),
        books: row.books,
        sold: sold.get(row._id) ?? 0,
      }))
      .sort((a, b) => b.sold - a.sold || b.books - a.books)
      .slice(0, SHELF),
    categories: categories.map((row) => ({ name: row.name, books: row.books })),
  };
};

/** Books at or under this price make the Under ৳300 shelf. */
export const BUDGET_PRICE = 300;

/*
 * Every homepage shelf in one request, and kept for a minute: the homepage is
 * the busiest page, and a shelf a minute out of date is still a good shelf.
 * Not kept under test, where every case starts from an empty database.
 */
const SECTIONS_TTL_MS = config.env === 'test' ? 0 : 60_000;
let sectionsCache: { at: number; body: StoredSections } | null = null;

export const Sections: RequestHandler = async (_req, res) => {
  try {
    if (!sectionsCache || Date.now() - sectionsCache.at >= SECTIONS_TTL_MS) {
      sectionsCache = { at: Date.now(), body: await buildSections() };
    }
    res.status(200).json(sectionsCache.body);
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

/** Books by id, in the order asked: a visitor's Recently viewed. */
export const ByIds: RequestHandler = async (req, res) => {
  const { ids } = validatedQuery<ByIdsQuery>(req);
  try {
    res.status(200).json(await booksInOrder(ids));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

/**
 * Top picks for you: books sharing a category or a writer with what this
 * person has bought, saved, put in their cart or recently looked at - none of
 * which they are shown again, and none of their own listings. With nothing to
 * go on, the best-rated books in stock.
 */
export const ForYou: RequestHandler = async (req, res) => {
  const { seen = [] } = validatedQuery<ForYouQuery>(req);
  try {
    const email = req.user?.email;
    const account = email ? await User.findOne({ email }, { _id: 1 }).lean() : null;

    const [ordered, wished, carted] = await Promise.all([
      email ? Order.distinct('bookId', { buyerEmail: email }) : [],
      account ? Wishlist.distinct('book', { user: account._id }) : [],
      account ? Cart.distinct('book', { user: account._id }) : [],
    ]);
    const known = [...ordered, ...wished, ...carted, ...seen].map(String);

    const tastes = await AddBook.find({ _id: { $in: known } }, { category: 1, author: 1 }).lean();
    const categories = [...new Set(tastes.flatMap((book) => book.category ?? []))];
    const authors = [...new Set(tastes.map((book) => book.author).filter(Boolean))];

    const notThese = {
      _id: { $nin: known },
      ...(email ? { sellerEmail: { $ne: email } } : {}),
      ...inStock,
    };

    let picks: LeanBook[] = [];
    if (categories.length || authors.length) {
      picks = await AddBook.find(
        { ...notThese, $or: [{ category: { $in: categories } }, { author: { $in: authors } }] },
        LIST_IMAGE_PROJECTION
      )
        .sort({ ratingAverage: -1, discountPercent: -1, createdAt: -1, _id: -1 })
        .limit(SHELF)
        .lean<LeanBook[]>();
    }
    if (picks.length < SHELF) {
      const more = await AddBook.find(
        { ...notThese, _id: { $nin: [...known, ...picks.map((book) => String(book._id))] } },
        LIST_IMAGE_PROJECTION
      )
        .sort({ ratingAverage: -1, ratingCount: -1, createdAt: -1, _id: -1 })
        .limit(SHELF - picks.length)
        .lean<LeanBook[]>();
      picks = [...picks, ...more];
    }

    res.status(200).json({ items: picks.map(withCoverUrls), personal: Boolean(categories.length || authors.length) });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

/** A person's picture as an address: a stored URL, or the avatar endpoint for an inline one. */
const avatarUrl = (user: { email: string; profilePicture?: string | null; updatedAt?: Date | null }): string | null => {
  if (!user.profilePicture) return null;
  if (/^https?:\/\//.test(user.profilePicture)) return user.profilePicture;
  const version = user.updatedAt ? new Date(user.updatedAt).getTime() : 0;
  return `${API_PREFIX}/user/${encodeURIComponent(user.email)}/avatar?v=${version}`;
};

/**
 * Sellers whose username matches, with how many books each has listed. An
 * account with nothing listed has no shop to show, so it is left out.
 */
export const sellerHits = async (search: string, limit: number): Promise<SellerHit[]> => {
  if (limit <= 0) return [];
  const pattern = contains(String(search));
  const people = await User.find(
    { role: 'user', username: pattern },
    { username: 1, email: 1, profilePicture: 1, updatedAt: 1 }
  )
    .limit(limit * 4)
    .lean();
  if (!people.length) return [];
  const counts = await AddBook.aggregate<{ _id: string; books: number }>([
    { $match: { sellerEmail: { $in: people.map((person) => person.email) } } },
    { $group: { _id: '$sellerEmail', books: { $sum: 1 } } },
  ]);
  const byEmail = new Map(counts.map((row) => [row._id, row.books]));
  const lower = search.toLowerCase();
  return people
    .filter((person) => (byEmail.get(person.email) ?? 0) > 0)
    // A name starting with what was typed before one merely containing it.
    .sort((a, b) => Number(b.username.toLowerCase().startsWith(lower)) - Number(a.username.toLowerCase().startsWith(lower)))
    .slice(0, limit)
    .map((person) => ({ username: person.username, avatar: avatarUrl(person), books: byEmail.get(person.email) ?? 0 }));
};

/** Authors whose name matches, with how many books of theirs are listed. */
const authorHits = async (search: string, limit: number): Promise<SuggestHit[]> => {
  const rows = await AddBook.aggregate<{ _id: string; books: number }>([
    { $match: { author: contains(String(search)) } },
    { $group: { _id: '$author', books: { $sum: 1 } } },
    { $sort: { books: -1, _id: 1 } },
    { $limit: limit },
  ]);
  return rows.filter((row) => row._id).map((row) => ({ name: row._id, books: row.books }));
};

let categoryCache: { at: number; rows: SuggestHit[] } | null = null;
/** For tests: forget the cached category counts. */
export const forgetCategoryCache = (): void => {
  categoryCache = null;
};

/** Categories whose name matches, with how many books are in each. */
const categoryHits = async (search: string, limit: number): Promise<SuggestHit[]> => {
  if (!categoryCache || Date.now() - categoryCache.at > 5 * 60 * 1000) {
    const rows = await AddBook.aggregate<{ _id: string; books: number }>([
      { $unwind: '$category' },
      { $group: { _id: '$category', books: { $sum: 1 } } },
    ]);
    categoryCache = { at: Date.now(), rows: rows.filter((row) => row._id).map((row) => ({ name: row._id, books: row.books })) };
  }
  const lower = search.toLowerCase();
  return categoryCache.rows
    .filter((row) => row.name.toLowerCase().includes(lower))
    .sort((a, b) => Number(b.name.toLowerCase().startsWith(lower)) - Number(a.name.toLowerCase().startsWith(lower)) || b.books - a.books)
    .slice(0, limit);
};

/** What people search for most, for the search box before anything is typed. */
export const PopularSearches: RequestHandler = async (_req, res) => {
  try {
    res.set('Cache-Control', 'public, max-age=600').json({ terms: await popularSearches() });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

/**
 * What the search box offers while somebody types: a few books and sellers.
 *
 * Books are ranked so the obvious answer comes first - a title starting with
 * the query, then one containing it, then an author, then a sound-alike in
 * the other script - with books in stock ahead of sold-out ones.
 */
export const Suggest: RequestHandler = async (req, res) => {
  const { q, books: bookLimit, sellers: sellerLimit } = validatedQuery<SuggestQuery>(req);
  const text = String(q);
  try {
    const lower = text.toLowerCase();
    const [found, sellers, authors, categories] = await Promise.all([
      bookLimit > 0
        ? AddBook.find(
            { $or: searchClauses(text) },
            { title: 1, author: 1, images: { $slice: 1 }, price: 1, salePrice: 1, discountPercent: 1, stock: 1 }
          )
            .sort({ createdAt: -1 })
            .limit(60)
            .lean()
        : Promise.resolve([]),
      sellerHits(text, sellerLimit),
      authorHits(text, 2),
      categoryHits(text, 2),
    ]);

    const rank = (book: { title?: string | null; author?: string | null; stock?: number | null }): number => {
      const title = (book.title ?? '').toLowerCase();
      const author = (book.author ?? '').toLowerCase();
      const place = title.startsWith(lower) ? 0 : title.includes(lower) ? 1 : author.includes(lower) ? 2 : 3;
      return place * 2 + (Number(book.stock) > 0 ? 0 : 1);
    };

    const body: SuggestResponse = {
      books: found
        .map((book) => ({ book, score: rank(book) }))
        .sort((a, b) => a.score - b.score)
        .slice(0, bookLimit)
        .map(({ book }) => {
          const listed = withCoverUrls(toListBook(book));
          return {
            _id: String(listed._id),
            title: listed.title,
            author: listed.author,
            cover: listed.images?.[0] ?? null,
            price: Number(listed.price),
            salePrice: Number(listed.salePrice ?? listed.price),
            discountPercent: Number(listed.discountPercent) || 0,
            inStock: Number(listed.stock) > 0,
          };
        }),
      sellers,
      authors,
      categories,
    };
    res.json(body);
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};
