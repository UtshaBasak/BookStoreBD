import { z } from 'zod';

import type { AssistantHandover, AssistantLink, AssistantOrder, AssistantWantedOffer, Book } from '@shared/api.js';

import AddBook, { type LeanBook } from '../../models/AddBook.model.js';
import Order, { type LeanOrder } from '../../models/Order.model.js';
import ReturnRequest from '../../models/ReturnRequest.model.js';
import User from '../../models/user.model.js';
import { buildFilter, findCatalogue, homeSections, personalPicks, sellerHits } from '../../controllers/filter.controller.js';
import { STATUS_BN } from '../../controllers/order.controller.js';
import {
  CANCELLED,
  ORDER_STAGES,
  RETURN_WINDOW_DAYS,
  canCancelLines,
  orderChargesFor,
  orderStatusOf,
  returnDeadline,
} from '../../config/commerce.js';
import { SUPPORT_EMAIL } from '../../config/contact.js';
import type { CatalogueQuery } from '../../schemas/index.js';
import { bnDigits, type Language } from '../language.js';
import { stripContactDetails } from '../contactDetails.js';
import { withCoverUrls } from '../projections.js';
import type { GeminiFunctionDeclaration } from '../gemini.js';
import { helpAsData, searchKnowledge } from './retrieval.js';
import { SITE_PAGES } from './knowledge.js';
import { searchByMeaning } from './semantic.js';
import { bookSearchKey, phoneticPattern } from '../phonetic.js';

/**
 * What the shopping assistant can do, as tools the model may ask for.
 *
 * Every tool is read-only and runs the site's own code: the catalogue search
 * (`findCatalogue`), the homepage shelves, Top picks (`personalPicks`), and
 * the buyer's own orders by the same rule as My orders - the address from the
 * session, never from the model. A tool's arguments come from the model, so
 * each is checked with Zod before it is used, and anything unexpected is
 * dropped rather than trusted.
 *
 * What goes back to the model is public: books (title, author, price, stock),
 * help text, category names. A person's orders never do - they are shown to
 * the person as cards built here, and the model is only told that they are.
 */

export interface ToolContext {
  language: Language;
  /** From the session. Undefined for a visitor who is not signed in. */
  email?: string;
  /** Books the visitor viewed recently, sent by the browser only when they allow it. */
  seen: string[];
  /** The person's own words this turn. Help is looked up with them too, not only with the model's rewording. */
  question?: string;
}

/** What the tools found for the person, shown under the answer. */
export interface Collected {
  books: Book[];
  /** Books the model may refer to as B1, B2... in this turn. */
  refs: Map<string, LeanBook>;
  links: AssistantLink[];
  orders: AssistantOrder[];
  handover: AssistantHandover | null;
  wanted: AssistantWantedOffer | null;
  /** Whether recommendations were drawn from the person's own history. */
  personal: boolean | null;
}

export const emptyCollected = (): Collected => ({
  books: [],
  refs: new Map(),
  links: [],
  orders: [],
  handover: null,
  wanted: null,
  personal: null,
});

const MAX_BOOKS_SHOWN = 6;

const addLink = (collected: Collected, link: AssistantLink): void => {
  if (!link.href.startsWith('/') || link.href.startsWith('//')) return;
  if (!collected.links.some((existing) => existing.href === link.href)) collected.links.push(link);
};

const pageName = (path: string, language: Language): string => {
  const bare = path.split(/[?#]/)[0];
  const page = SITE_PAGES.find((entry) => entry.path === bare);
  return page ? page[language] : bare;
};

/** A book as the model reads it: public facts and a reference, nothing else. */
const bookAsData = (book: LeanBook, ref: string) => ({
  ref,
  title: book.title,
  author: book.author,
  price_tk: Number(book.salePrice ?? book.price),
  ...(Number(book.discountPercent) > 0 ? { discount_percent: Number(book.discountPercent), list_price_tk: Number(book.price) } : {}),
  in_stock: Number(book.stock) > 0,
  type: book.bookType === 'old' ? 'second-hand' : 'new',
  ...(book.condition ? { condition: book.condition } : {}),
  categories: (book.category ?? []).slice(0, 3),
  ...(Number(book.ratingCount) > 0 ? { rating: Number(book.ratingAverage), ratings: Number(book.ratingCount) } : {}),
});

/** Shows these books to the person and returns them as data for the model. */
const showBooks = (collected: Collected, books: LeanBook[]) => {
  const data = [];
  for (const book of books) {
    const id = String(book._id);
    let ref = [...collected.refs.entries()].find(([, known]) => String(known._id) === id)?.[0];
    if (!ref) {
      ref = `B${collected.refs.size + 1}`;
      collected.refs.set(ref, book);
      if (collected.books.length < MAX_BOOKS_SHOWN) collected.books.push(withCoverUrls(book) as unknown as Book);
    }
    data.push(bookAsData(book, ref));
  }
  return data;
};

// ------------------------------------------------------------- the tools

const text = (max: number) => z.string().trim().min(1).max(max);
const money = z.coerce.number().min(0).max(1_000_000);

const searchArgs = z.object({
  query: text(100).optional(),
  description: text(300).optional(),
  author: text(80).optional(),
  category: text(60).optional(),
  type: z.enum(['new', 'second-hand']).optional(),
  min_price: money.optional(),
  max_price: money.optional(),
  in_stock: z.coerce.boolean().optional(),
  deals: z.coerce.boolean().optional(),
  sort: z.enum(['relevant', 'newest', 'rated', 'cheapest', 'priciest', 'biggest_discount']).optional(),
});

const SORT_FOR: Record<NonNullable<z.infer<typeof searchArgs>['sort']>, CatalogueQuery['sort']> = {
  relevant: 'relevant',
  newest: 'newest',
  rated: 'rated',
  cheapest: 'priceLowHigh',
  priciest: 'priceHighLow',
  biggest_discount: 'dealPercent',
};

const catalogueQuery = (args: z.infer<typeof searchArgs>, search: string | undefined, pageSize: number): CatalogueQuery => ({
  ...(search ? { search } : {}),
  ...(args.type ? { bookType: args.type === 'new' ? 'new' : 'old' } : {}),
  ...(args.category ? { category: [args.category] } : {}),
  ...(args.min_price !== undefined ? { minPrice: args.min_price } : {}),
  ...(args.max_price !== undefined ? { maxPrice: args.max_price } : {}),
  ...(args.in_stock ? { inStock: true } : {}),
  ...(args.deals ? { deals: true } : {}),
  sort: SORT_FOR[args.sort ?? 'relevant'],
  page: 1,
  pageSize,
});

/**
 * A writer's name in one script often misses the other's spelling of the
 * surname ("Tagore" and ঠাকুর, "Gangopadhyay" and গঙ্গোপাধ্যায়): with few
 * books found, each longer word of the name is searched on its own as well.
 */
const widenByAuthorWords = async (
  args: z.infer<typeof searchArgs>,
  author: string,
  found: LeanBook[],
  limit: number
): Promise<LeanBook[]> => {
  if (found.length >= 3) return found;
  const books = [...found];
  const known = new Set(books.map((book) => String(book._id)));
  for (const word of author.split(/\s+/).filter((part) => part.length >= 4)) {
    const more = await findCatalogue(catalogueQuery(args, word, MAX_BOOKS_SHOWN));
    for (const book of more.items) {
      if (!known.has(String(book._id)) && books.length < limit) {
        known.add(String(book._id));
        books.push(book);
      }
    }
  }
  return books;
};

const searchBooks = async (raw: unknown, context: ToolContext, collected: Collected) => {
  const args = searchArgs.parse(raw);
  const words = (value: string) => value.toLowerCase().split(/\s+/).filter((word) => word.length > 1);

  let books: LeanBook[];
  let total: number;
  if (args.author && args.query) {
    // There is no author filter: search the author, then keep the titles that
    // match. A title may be in the other script ("Sei Somoy" and সেই সময়), so
    // it is matched by sound as well as by letters.
    const byAuthor = await findCatalogue(catalogueQuery(args, args.author, 50));
    const pool = await widenByAuthorWords(args, args.author, byAuthor.items, 50);
    const wanted = words(args.query);
    const sound = phoneticPattern(args.query);
    let titled = pool.filter(
      (book) => wanted.some((word) => book.title.toLowerCase().includes(word)) || Boolean(sound?.test(bookSearchKey({ title: book.title })))
    );
    // None of the author's books has that title: the title alone, whoever wrote it.
    if (!titled.length) titled = (await findCatalogue(catalogueQuery(args, args.query, MAX_BOOKS_SHOWN))).items;
    books = (titled.length ? titled : pool).slice(0, MAX_BOOKS_SHOWN);
    total = titled.length || Math.max(byAuthor.total, pool.length);
  } else {
    const found = await findCatalogue(catalogueQuery(args, args.author ?? args.query, MAX_BOOKS_SHOWN));
    books = found.items;
    total = found.total;
    if (args.author && !args.query) {
      books = await widenByAuthorWords(args, args.author, books, MAX_BOOKS_SHOWN);
      total = Math.max(total, books.length);
    }
  }

  // A description of what a book is about, or a search that found nothing:
  // look by meaning too, within the same filters.
  if (args.description || (!books.length && args.query)) {
    const filter = buildFilter({ ...catalogueQuery(args, undefined, MAX_BOOKS_SHOWN) });
    const byMeaning = await searchByMeaning(args.description ?? args.query ?? '', filter, MAX_BOOKS_SHOWN);
    // Described, not named: what matches the description, or - with nothing
    // embedded yet - the filtered catalogue as before.
    const named = Boolean(args.query || args.author);
    if (byMeaning.length || named) {
      const kept = named ? books : [];
      const known = new Set(kept.map((book) => String(book._id)));
      books = [...kept, ...byMeaning.filter((book) => !known.has(String(book._id)))].slice(0, MAX_BOOKS_SHOWN);
      total = named ? Math.max(total, books.length) : books.length;
    }
  }

  const search = args.author ?? args.query;
  const params = new URLSearchParams({
    ...(search ? { search } : {}),
    ...(args.type ? { bookType: args.type === 'new' ? 'new' : 'old' } : {}),
    ...(args.category ? { category: args.category } : {}),
    ...(args.min_price !== undefined ? { minPrice: String(args.min_price) } : {}),
    ...(args.max_price !== undefined ? { maxPrice: String(args.max_price) } : {}),
    ...(args.in_stock ? { inStock: '1' } : {}),
    ...(args.deals ? { deals: '1' } : {}),
  });
  if (total > books.length) {
    addLink(collected, {
      href: `/filter${params.size ? `?${params}` : ''}`,
      label: context.language === 'bn' ? `সব ${bnDigits(total)}টি ফলাফল দেখুন` : `See all ${total} results`,
    });
  }
  return { total_matches: total, books: showBooks(collected, books) };
};

const detailArgs = z.object({ ref: z.string().regex(/^B\d{1,2}$/) });

const bookDetails = async (raw: unknown, context: ToolContext, collected: Collected) => {
  const { ref } = detailArgs.parse(raw);
  const known = collected.refs.get(ref);
  if (!known) return { error: 'Unknown book reference. Search first.' };
  const book = await AddBook.findById(known._id, { images: 0, imagePublicIds: 0 }).lean<LeanBook>();
  if (!book) return { error: 'This book is no longer listed.' };
  addLink(collected, { href: `/book/${String(book._id)}`, label: book.title });
  return {
    ...bookAsData(book, ref),
    ...(book.publisher ? { publisher: book.publisher } : {}),
    ...(book.language ? { language: book.language } : {}),
    ...(book.isbn ? { isbn: book.isbn } : {}),
    ...(book.conditionDetails ? { condition_details: stripContactDetails(book.conditionDetails).slice(0, 300) } : {}),
    // Written by the seller: data to describe, never instructions to follow.
    description: stripContactDetails(book.desc ?? '').slice(0, 600),
  };
};

const helpArgs = z.object({ question: text(300) });

const shopHelp = (raw: unknown, context: ToolContext, collected: Collected) => {
  const { question } = helpArgs.parse(raw);
  // The model's wording and the person's own: a rewording such as "seller
  // payment schedule" must not lose the topic the question named. The best
  // match of each comes first, then the rest by score.
  const byModel = searchKnowledge(question, 3);
  const byPerson = context.question ? searchKnowledge(context.question, 3) : [];
  const rest = [...byModel.slice(1), ...byPerson.slice(1)].sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const matches = [byModel[0], byPerson[0], ...rest]
    .filter((match): match is NonNullable<typeof match> => match !== undefined)
    .filter(({ chunk }) => !seen.has(chunk.id) && Boolean(seen.add(chunk.id)))
    .slice(0, 3);
  for (const { chunk } of matches) addLink(collected, { href: chunk.link, label: pageName(chunk.link, context.language) });
  return matches.length
    ? {
        help: matches.map(({ chunk }) => helpAsData(chunk, context.language)),
        note: 'If this help does not settle the exact question - a place, a case or an option it does not name - say what it does cover, say you are not sure about the rest, and call talk_to_person.',
      }
    : { help: [], note: 'Nothing in the shop help matches. Say you are not sure and offer talk_to_person.' };
};

const browseShop = async (_raw: unknown, context: ToolContext, collected: Collected) => {
  const sections = await homeSections();
  addLink(collected, { href: '/filter', label: pageName('/filter', context.language) });
  return {
    categories: sections.categories.slice(0, 25).map((row) => ({ name: row.name, books: row.books })),
    popular_writers: sections.writers.map((row) => row.name),
    books_on_deal_now: sections.deals.length,
  };
};

const sellerArgs = z.object({ name: text(40) });

const findSeller = async (raw: unknown, context: ToolContext, collected: Collected) => {
  const { name } = sellerArgs.parse(raw);
  const hits = await sellerHits(name, 3);
  for (const hit of hits) addLink(collected, { href: `/shop/${encodeURIComponent(hit.username)}`, label: hit.username });
  return { sellers: hits.map((hit) => ({ username: hit.username, books_listed: hit.books })) };
};

const recommendBooks = async (_raw: unknown, context: ToolContext, collected: Collected) => {
  if (context.email || context.seen.length) {
    const { items, personal } = await personalPicks(context.email, context.seen);
    collected.personal = personal;
    return { based_on_this_persons_history: personal, books: showBooks(collected, items.slice(0, MAX_BOOKS_SHOWN)) };
  }
  const sections = await homeSections();
  const shelf = sections.trending.length ? sections.trending : sections.bestsellers.length ? sections.bestsellers : sections.topRated;
  collected.personal = false;
  return {
    based_on_this_persons_history: false,
    note: 'Popular with readers right now. Personal picks need sign-in or browsing history.',
    books: showBooks(collected, (shelf as unknown as LeanBook[]).slice(0, MAX_BOOKS_SHOWN)),
  };
};

// ------------------------------------------------------------------ orders

const STAGE_EXPLAINED: Record<string, { en: string; bn: string }> = {
  'Order Confirmed': {
    en: 'The seller has your order and will prepare it. You can still cancel it yourself at this stage.',
    bn: 'বিক্রেতা আপনার অর্ডার পেয়েছেন এবং প্রস্তুত করবেন। এই ধাপে আপনি নিজেই অর্ডার বাতিল করতে পারেন।',
  },
  Processing: {
    en: 'The seller is packing your books. To cancel now, message the seller or the shop.',
    bn: 'বিক্রেতা বই প্যাক করছেন। এখন বাতিল করতে চাইলে বিক্রেতা বা শপকে মেসেজ করুন।',
  },
  Shipped: {
    en: 'Your books are on their way to the courier.',
    bn: 'আপনার বই কুরিয়ারের পথে রওনা হয়েছে।',
  },
  'Out for Delivery': {
    en: 'The courier is bringing it to you. Keep the cash ready: you pay on delivery.',
    bn: 'কুরিয়ার বইটি আপনার কাছে নিয়ে আসছে। টাকা প্রস্তুত রাখুন: ডেলিভারির সময় পরিশোধ করবেন।',
  },
  Delivered: {
    en: `Delivered. If something is wrong, you can ask for a return within ${RETURN_WINDOW_DAYS} days of delivery.`,
    bn: `ডেলিভারি হয়েছে। কোনো সমস্যা থাকলে ডেলিভারির ${bnDigits(RETURN_WINDOW_DAYS)} দিনের মধ্যে রিটার্নের অনুরোধ করতে পারেন।`,
  },
  [CANCELLED]: {
    en: 'This order was cancelled. Nothing is owed.',
    bn: 'এই অর্ডারটি বাতিল হয়েছে। কোনো টাকা দিতে হবে না।',
  },
};

const RETURN_EXPLAINED: Record<string, { en: string; bn: string }> = {
  pending: { en: 'A return request is being reviewed.', bn: 'রিটার্নের অনুরোধ পর্যালোচনা চলছে।' },
  approved: { en: 'A return was approved; the refund follows by bKash.', bn: 'রিটার্ন অনুমোদিত হয়েছে; টাকা বিকাশে ফেরত আসবে।' },
  rejected: { en: 'A return request was declined.', bn: 'রিটার্নের অনুরোধ গ্রহণ করা হয়নি।' },
};

const ordersArgs = z.object({ order_number: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,24}$/).optional() });

/** One order, as the person is shown it: the safe fields only - no address, phone or payment number. */
const orderCard = (lines: LeanOrder[], returns: Map<string, string>, language: Language): AssistantOrder => {
  const status = orderStatusOf(lines);
  const charges = orderChargesFor(lines);
  const now = Date.now();
  const deadlines = lines.map((line) => returnDeadline(line)).filter((date): date is Date => Boolean(date && date.getTime() > now));
  const returnStatus = lines.map((line) => returns.get(String(line._id))).find(Boolean);
  const explained = STAGE_EXPLAINED[status] ?? STAGE_EXPLAINED['Order Confirmed'];
  const first = lines[0];
  return {
    orderNumber: String(first?.orderNumber ?? ''),
    placedAt: new Date(first?.createdAt ?? Date.now()).toISOString(),
    status,
    statusLabel: language === 'bn' ? (STATUS_BN[status] ?? status) : status,
    stage: status === CANCELLED ? -1 : ORDER_STAGES.indexOf(status as (typeof ORDER_STAGES)[number]),
    explanation: [
      language === 'bn' ? explained?.bn : explained?.en,
      returnStatus ? (language === 'bn' ? RETURN_EXPLAINED[returnStatus]?.bn : RETURN_EXPLAINED[returnStatus]?.en) : null,
    ]
      .filter(Boolean)
      .join(' '),
    books: lines.map((line) => ({ title: String(line.title ?? ''), quantity: Number(line.quantity ?? 1) })),
    total: charges.totalCost,
    canCancel: canCancelLines('buyer', lines),
    returnableUntil: deadlines.length ? new Date(Math.max(...deadlines.map((date) => date.getTime()))).toISOString() : null,
    link: `/order-tracking/${encodeURIComponent(String(first?.orderNumber ?? ''))}`,
  };
};

const myOrders = async (raw: unknown, context: ToolContext, collected: Collected) => {
  // Identity from the session only: a guest has no orders to show, and the
  // model cannot name somebody else's address.
  if (!context.email) return { signed_in: false, note: 'Ask the user to sign in to see their orders.' };
  const { order_number: orderNumber } = ordersArgs.parse(raw ?? {});
  const filter = { buyerEmail: context.email, ...(orderNumber ? { orderNumber } : {}) };
  const recent = await Order.find(filter, { orderNumber: 1 }).sort({ createdAt: -1, _id: -1 }).limit(30).lean();
  const numbers = [...new Set(recent.map((line) => line.orderNumber))].slice(0, 3);
  if (!numbers.length) {
    addLink(collected, { href: '/buyer/orders', label: context.language === 'bn' ? 'আমার অর্ডার' : 'My orders' });
    // The same answer whether the number exists for someone else or not at all.
    return { orders_found: 0, note: orderNumber ? 'No order with that number in this account.' : 'This account has no orders yet.' };
  }
  const lines = await Order.find(
    { buyerEmail: context.email, orderNumber: { $in: numbers } },
    // The safe fields: nothing about where it goes, who to call, or how it is paid.
    { orderNumber: 1, title: 1, quantity: 1, price: 1, status: 1, deliveredAt: 1, createdAt: 1, shippingCharge: 1, discount: 1, bookId: 1 }
  ).lean<LeanOrder[]>();
  const returns = await ReturnRequest.find({ userEmail: context.email, orderId: { $in: lines.map((line) => line._id) } }, { orderId: 1, status: 1 }).lean();
  const byLine = new Map(returns.map((request) => [String(request.orderId), String(request.status)]));
  collected.orders = numbers.map((number) =>
    orderCard(
      lines.filter((line) => line.orderNumber === number),
      byLine,
      context.language
    )
  );
  addLink(collected, { href: '/buyer/orders', label: context.language === 'bn' ? 'আমার অর্ডার' : 'My orders' });
  // The model learns only that cards are shown, and their stages - no titles, no totals.
  return {
    orders_found: collected.orders.length,
    stages: collected.orders.map((order) => order.status),
    note: 'The orders are shown to the user as cards with each stage explained. Do not repeat their details.',
  };
};

// ------------------------------------------------------------ hand over

const handoverArgs = z.object({ who: z.enum(['seller', 'shop']), ref: z.string().regex(/^B\d{1,2}$/).optional() });

const talkToPerson = async (raw: unknown, context: ToolContext, collected: Collected) => {
  const args = handoverArgs.parse(raw);
  if (args.who === 'seller' && args.ref) {
    const book = collected.refs.get(args.ref);
    if (book?.sellerEmail) {
      const seller = await User.findOne({ email: book.sellerEmail }, { username: 1 }).lean();
      collected.handover = {
        kind: 'seller',
        chatWith: book.sellerEmail,
        name: seller?.username ?? '',
        bookTitle: book.title,
        email: null,
      };
      return { handover: 'seller', shown: true, note: 'A button to chat with the seller is shown. The conversation is not sent anywhere unless the user chooses to.' };
    }
  }
  const shopAccount = await User.exists({ email: SUPPORT_EMAIL });
  collected.handover = { kind: 'shop', chatWith: shopAccount ? SUPPORT_EMAIL : null, name: 'BookStoreBD', bookTitle: null, email: SUPPORT_EMAIL };
  addLink(collected, { href: '/contact', label: pageName('/contact', context.language) });
  return { handover: 'shop', shown: true, note: 'Buttons to chat with the shop or e-mail it are shown.' };
};

const wantedArgs = z.object({ title: text(150), author: text(100).optional() });

const offerWanted = async (raw: unknown, context: ToolContext, collected: Collected) => {
  const args = wantedArgs.parse(raw);
  collected.wanted = { title: args.title, author: args.author ?? '' };
  addLink(collected, { href: '/wanted', label: pageName('/wanted', context.language) });
  return { offered: true, note: 'The user is shown a button to ask for this book on the Wanted board. Nothing is posted unless they press it.' };
};

// ------------------------------------------------------------ registry

type ToolRunner = (raw: unknown, context: ToolContext, collected: Collected) => unknown;

interface ToolDefinition {
  declaration: GeminiFunctionDeclaration;
  run: ToolRunner;
  /** Only for a signed-in person. */
  signedIn?: boolean;
}

const TOOLS: Record<string, ToolDefinition> = {
  search_books: {
    declaration: {
      name: 'search_books',
      description:
        'Search the BookStoreBD catalogue. Use for any request to find, price or check a book. Pass the author separately when one is named. Names may be in Bangla or English.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Title words or ISBN, as the user wrote them.' },
          description: {
            type: 'string',
            description: 'What the book is about or its mood, when the user describes rather than names it, e.g. "a sad novel about the liberation war".',
          },
          author: { type: 'string', description: 'The author, as the user wrote the name.' },
          category: { type: 'string', description: 'A category name, e.g. Novel, Academic, Children.' },
          type: { type: 'string', enum: ['new', 'second-hand'] },
          min_price: { type: 'number', description: 'Taka.' },
          max_price: { type: 'number', description: 'Taka. "Under 300 taka" is 300.' },
          in_stock: { type: 'boolean' },
          deals: { type: 'boolean', description: 'Only discounted books.' },
          sort: { type: 'string', enum: ['relevant', 'newest', 'rated', 'cheapest', 'priciest', 'biggest_discount'] },
        },
      },
    },
    run: searchBooks,
  },
  book_details: {
    declaration: {
      name: 'book_details',
      description: 'More about one book a search returned (description, publisher, condition), by its ref such as B1.',
      parameters: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] },
    },
    run: bookDetails,
  },
  shop_help: {
    declaration: {
      name: 'shop_help',
      description:
        'The shop’s own rules and help: delivery charges and times, payment, returns and refunds, cancelling, promo codes, selling, fees, payouts, reviews, the Wanted board, accounts, privacy, contact.',
      parameters: { type: 'object', properties: { question: { type: 'string' } }, required: ['question'] },
    },
    run: shopHelp,
  },
  browse_shop: {
    declaration: {
      name: 'browse_shop',
      description: 'What the shop has: its categories with book counts, popular writers, and how many deals are on.',
      parameters: { type: 'object', properties: {} },
    },
    run: browseShop,
  },
  find_seller: {
    declaration: {
      name: 'find_seller',
      description: 'Find a seller’s shop by username.',
      parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    },
    run: findSeller,
  },
  recommend_books: {
    declaration: {
      name: 'recommend_books',
      description: 'Suggest books for this person: from what they bought, saved and viewed, or what is popular.',
      parameters: { type: 'object', properties: {} },
    },
    run: recommendBooks,
  },
  my_orders: {
    declaration: {
      name: 'my_orders',
      description: 'The signed-in user’s own recent orders and their status. Optionally one order by its number.',
      parameters: { type: 'object', properties: { order_number: { type: 'string' } } },
    },
    run: myOrders,
    signedIn: true,
  },
  talk_to_person: {
    declaration: {
      name: 'talk_to_person',
      description: 'Offer to connect the user with a person: a book’s seller (give its ref) or the shop.',
      parameters: {
        type: 'object',
        properties: { who: { type: 'string', enum: ['seller', 'shop'] }, ref: { type: 'string' } },
        required: ['who'],
      },
    },
    run: talkToPerson,
  },
  offer_wanted_request: {
    declaration: {
      name: 'offer_wanted_request',
      description: 'When a wanted book is not in the shop: offer to ask for it on the Wanted board. The user confirms; nothing is posted by this tool.',
      parameters: { type: 'object', properties: { title: { type: 'string' }, author: { type: 'string' } }, required: ['title'] },
    },
    run: offerWanted,
  },
};

/** The tools this person may use. */
export const toolDeclarations = (signedIn: boolean): GeminiFunctionDeclaration[] =>
  Object.values(TOOLS)
    .filter((tool) => !tool.signedIn || signedIn)
    .map((tool) => tool.declaration);

/**
 * Runs a tool the model asked for. An unknown tool, a tool this person may
 * not use, or arguments that fail their schema come back as an error the
 * model can read - never as an exception, and never with the call carried out.
 */
export const runTool = async (name: string, args: unknown, context: ToolContext, collected: Collected): Promise<Record<string, unknown>> => {
  const tool = Object.hasOwn(TOOLS, name) ? TOOLS[name] : undefined;
  if (!tool) return { error: 'No such tool.' };
  if (tool.signedIn && !context.email) return { error: 'The user is not signed in.' };
  try {
    return { result: await tool.run(args ?? {}, context, collected) };
  } catch (error) {
    if (error instanceof z.ZodError) return { error: 'Invalid arguments.' };
    throw error;
  }
};

export const TOOL_NAMES = Object.keys(TOOLS);

