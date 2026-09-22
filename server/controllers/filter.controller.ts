import type { Request, RequestHandler, Response } from 'express';

import AddBook from '../models/AddBook.model.js';
import type { CatalogueQuery, FeaturedQuery } from '../schemas/index.js';
import { errorMessage } from '../utils/error.js';
import { validatedQuery } from '../middleware/validate.js';
import { LIST_IMAGE_PROJECTION, withCoverUrls } from '../utils/projections.js';

const REGEX_SPECIAL_CHARS = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '/']);

/**
 * Escapes regex metacharacters.
 *
 * Two reasons, and both have bitten. A search for "C++" is a syntax error as a
 * pattern, not a search for "C++"; and a search for ".*" would otherwise match
 * every book in the database, which is a filter doing the opposite of
 * filtering.
 */
const escapeRegex = (value: string): string =>
  String(value)
    .split('')
    .map((char) => {
      if (char === String.fromCharCode(92)) return char + char;
      return REGEX_SPECIAL_CHARS.has(char) ? String.fromCharCode(92) + char : char;
    })
    .join('');

/**
 * A case-insensitive exact match.
 *
 * Categories and conditions were stored with whatever capitalisation the form
 * of the day used - 'Fiction' from the current one, 'fiction' from the seed -
 * and the browse page compensated by lower-casing both sides in the browser.
 * Filtering here has to match that, or half the catalogue disappears.
 *
 * It does mean these two cannot use an index. Normalising the stored values is
 * the real answer and is a data migration; this keeps the behaviour correct in
 * the meantime.
 */
const sameText = (value: string): RegExp => new RegExp(`^${escapeRegex(value)}$`, 'i');

const SORTS = {
  newest: { createdAt: -1 },
  // Score first, then how many people it rests on: one five-star review is not
  // a better recommendation than forty averaging 4.6.
  rated: { ratingAverage: -1, ratingCount: -1 },
  priceLowHigh: { price: 1 },
  priceHighLow: { price: -1 },
} as const satisfies Record<CatalogueQuery['sort'], Record<string, 1 | -1>>;

/** Builds the query from parameters the schema has already narrowed. */
const buildFilter = (q: CatalogueQuery): Record<string, unknown> => {
  const filter: Record<string, unknown> = {};

  if (q.search) {
    const pattern = new RegExp(escapeRegex(q.search), 'i');
    // Title or author, which is what somebody typing into one box means.
    filter.$or = [{ title: pattern }, { author: pattern }];
  }

  if (q.bookType) filter.bookType = q.bookType;
  if (q.condition) filter.condition = sameText(q.condition);
  if (q.category?.length) filter.category = { $in: q.category.map(sameText) };

  if (q.minPrice !== undefined || q.maxPrice !== undefined) {
    filter.price = {
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
 * One page of the catalogue.
 *
 * This used to return every listing in the database, and the browse page
 * filtered, sorted and paginated them in the browser. That worked because the
 * shop is small: it meant every visitor downloaded the whole catalogue to look
 * at twelve of it, and the cost grew with every book added. MongoDB can do all
 * three, against indexes, and send twelve.
 */
export const Booklist: RequestHandler = async (req, res) => {
  const q = validatedQuery<CatalogueQuery>(req);
  const filter = buildFilter(q);

  try {
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
 * ten sellers. Grouping is what the browser was doing with the whole catalogue
 * in hand; the `$group` does it against the collection instead.
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
