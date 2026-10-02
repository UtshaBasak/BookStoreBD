import type {
  AnalyticsBucket,
  AnalyticsPoint,
  AnalyticsRange,
  AnalyticsKpi,
  ShopAnalytics,
} from '@shared/api.js';

import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';
import SearchLog from '../models/SearchLog.model.js';
import User from '../models/user.model.js';
import WantedBook from '../models/WantedBook.model.js';
import { CANCELLED, SELLER_FEE_PERCENT, sellerFeeFor } from '../config/commerce.js';

/**
 * The administrator's view of how the shop is doing: sales, fees, what sells,
 * when people buy, and what they look for and cannot find.
 *
 * An order is the order number; its books are separate documents, so counts
 * of orders are counts of distinct numbers. Sales are book totals - what the
 * books sold for - without delivery, which goes to the courier. Hours and days
 * are Dhaka time, which has no daylight saving, so a fixed six hours is exact.
 */

const TZ = 'Asia/Dhaka';
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_DAYS: Record<Exclude<AnalyticsRange, 'all'>, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 };

/** A date's calendar day in Dhaka, as YYYY-MM-DD. */
const dhakaDay = (date: Date): string => new Date(date.getTime() + DHAKA_OFFSET_MS).toISOString().slice(0, 10);

/** Midnight in Dhaka at the start of the day `date` falls on. */
const startOfDhakaDay = (date: Date): Date => new Date(Date.parse(`${dhakaDay(date)}T00:00:00Z`) - DHAKA_OFFSET_MS);

const round = (value: number): number => Math.round(value * 100) / 100;
const share = (part: number, whole: number): number => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : 0);

/** A book line's total: the price paid for one copy, times the copies. */
const LINE_TOTAL = { $multiply: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$quantity', 1] }] };
const LIVE = { status: { $ne: CANCELLED } };

interface Totals {
  revenue: number;
  copies: number;
  orders: number;
  earnedBase: number;
  pendingBase: number;
}

/** Sales, copies, orders and the fee bases for one window. */
const totalsFor = async (from: Date, to: Date): Promise<Totals> => {
  const [row] = await Order.aggregate<Totals & { _id: null }>([
    { $match: { createdAt: { $gte: from, $lt: to }, ...LIVE } },
    { $addFields: { lineTotal: LINE_TOTAL } },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$lineTotal' },
        copies: { $sum: { $ifNull: ['$quantity', 1] } },
        numbers: { $addToSet: '$orderNumber' },
        // The fee is the shop's once a book has arrived and stays arrived.
        earnedBase: {
          $sum: { $cond: [{ $and: [{ $eq: ['$status', 'Delivered'] }, { $ne: ['$isReturned', 1] }] }, '$lineTotal', 0] },
        },
        pendingBase: { $sum: { $cond: [{ $ne: ['$status', 'Delivered'] }, '$lineTotal', 0] } },
      },
    },
    { $project: { revenue: 1, copies: 1, earnedBase: 1, pendingBase: 1, orders: { $size: '$numbers' } } },
  ]);
  return row ?? { revenue: 0, copies: 0, orders: 0, earnedBase: 0, pendingBase: 0 };
};

const kpi = (value: number, previous: number | null): AnalyticsKpi => ({ value: round(value), previous: previous === null ? null : round(previous) });

/** Days, weeks or months, so a chart has a sensible number of points. */
const bucketFor = (days: number): AnalyticsBucket => (days <= 31 ? 'day' : days <= 120 ? 'week' : 'month');

/** Every day from `from` to `to`, as Dhaka dates, so quiet days show as zero rather than vanish. */
const daysBetween = (from: Date, to: Date): string[] => {
  const days: string[] = [];
  for (let at = from.getTime(); at < to.getTime(); at += DAY_MS) days.push(dhakaDay(new Date(at)));
  return [...new Set(days)];
};

/** Daily figures gathered into the chart's buckets: weeks from the first day, or calendar months. */
const bucketise = (days: string[], daily: Map<string, Omit<AnalyticsPoint, 'date'>>, bucket: AnalyticsBucket): AnalyticsPoint[] => {
  const points = new Map<string, AnalyticsPoint>();
  days.forEach((day, index) => {
    const key = bucket === 'day' ? day : bucket === 'week' ? days[index - (index % 7)] : day.slice(0, 7);
    const point = points.get(key) ?? { date: key, revenue: 0, orders: 0, signups: 0, listings: 0 };
    const figures = daily.get(day);
    if (figures) {
      point.revenue += figures.revenue;
      point.orders += figures.orders;
      point.signups += figures.signups;
      point.listings += figures.listings;
    }
    points.set(key, point);
  });
  return [...points.values()].map((point) => ({ ...point, revenue: round(point.revenue) }));
};

/** Counts per Dhaka day of documents created in the window. */
const perDay = async (
  model: typeof User | typeof AddBook,
  from: Date,
  to: Date,
  extra: Record<string, unknown> = {}
): Promise<Map<string, number>> => {
  const rows = await (model as typeof AddBook).aggregate<{ _id: string; n: number }>([
    { $match: { createdAt: { $gte: from, $lt: to }, ...extra } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } }, n: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.n]));
};

export const shopAnalytics = async (range: AnalyticsRange, now: Date = new Date()): Promise<ShopAnalytics> => {
  const to = now;
  let from: Date;
  if (range === 'all') {
    // From the first order, and never less than a month, so a new shop still has a chart.
    const first = await Order.findOne({}, { createdAt: 1 }).sort({ createdAt: 1 }).lean();
    const monthAgo = now.getTime() - 29 * DAY_MS;
    from = startOfDhakaDay(new Date(Math.min(first?.createdAt ? new Date(first.createdAt).getTime() : monthAgo, monthAgo)));
  } else {
    from = startOfDhakaDay(new Date(now.getTime() - (RANGE_DAYS[range] - 1) * DAY_MS));
  }
  const span = to.getTime() - from.getTime();
  const previousFrom = new Date(from.getTime() - span);
  const days = daysBetween(from, to);
  const bucket = bucketFor(days.length);
  const inRange = { createdAt: { $gte: from, $lt: to } };

  const [current, previous, facets, signupsByDay, listingsByDay, newUsers, previousUsers, newListings, previousListings] =
    await Promise.all([
      totalsFor(from, to),
      range === 'all' ? Promise.resolve(null) : totalsFor(previousFrom, from),
      Order.aggregate<{
        series: { _id: string; revenue: number; orders: number }[];
        statuses: { _id: string | null; count: number }[];
        categories: { _id: string; revenue: number; copies: number }[];
        bookTypes: { _id: string | null; revenue: number; copies: number }[];
        books: { _id: unknown; title: string; author: string; copies: number; revenue: number }[];
        sellers: { _id: string; revenue: number; orders: number }[];
        regions: { _id: string | null; orders: number }[];
        hours: { _id: { day: number; hour: number }; orders: number }[];
        lines: { _id: null; all: number; cancelled: number; delivered: number; returned: number }[];
        promo: { _id: null; orders: number; withPromo: number }[];
      }>([
        { $match: inRange },
        { $addFields: { lineTotal: LINE_TOTAL, live: { $ne: ['$status', CANCELLED] } } },
        {
          $facet: {
            series: [
              { $match: { live: true } },
              {
                $group: {
                  _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TZ } },
                  revenue: { $sum: '$lineTotal' },
                  numbers: { $addToSet: '$orderNumber' },
                },
              },
              { $project: { revenue: 1, orders: { $size: '$numbers' } } },
            ],
            statuses: [{ $group: { _id: '$status', count: { $sum: 1 } } }, { $sort: { count: -1 } }],
            // A book in two categories counts in both: this is what each category sells.
            categories: [
              { $match: { live: true } },
              { $unwind: '$category' },
              { $group: { _id: '$category', revenue: { $sum: '$lineTotal' }, copies: { $sum: { $ifNull: ['$quantity', 1] } } } },
              { $sort: { revenue: -1, copies: -1 } },
              { $limit: 8 },
            ],
            bookTypes: [
              { $match: { live: true } },
              { $group: { _id: '$bookType', revenue: { $sum: '$lineTotal' }, copies: { $sum: { $ifNull: ['$quantity', 1] } } } },
            ],
            books: [
              { $match: { live: true } },
              {
                $group: {
                  _id: '$bookId',
                  title: { $first: '$title' },
                  author: { $first: '$author' },
                  copies: { $sum: { $ifNull: ['$quantity', 1] } },
                  revenue: { $sum: '$lineTotal' },
                },
              },
              { $sort: { copies: -1, revenue: -1 } },
              { $limit: 5 },
            ],
            sellers: [
              { $match: { live: true } },
              { $group: { _id: '$sellerEmail', revenue: { $sum: '$lineTotal' }, numbers: { $addToSet: '$orderNumber' } } },
              { $project: { revenue: 1, orders: { $size: '$numbers' } } },
              { $sort: { revenue: -1 } },
              { $limit: 5 },
            ],
            regions: [
              { $group: { _id: { number: '$orderNumber', division: '$deliveryDivision' } } },
              { $group: { _id: '$_id.division', orders: { $sum: 1 } } },
              { $sort: { orders: -1 } },
            ],
            // When people order, cancelled or not: that is when they are shopping.
            hours: [
              { $group: { _id: '$orderNumber', at: { $min: '$createdAt' } } },
              {
                $group: {
                  _id: { day: { $dayOfWeek: { date: '$at', timezone: TZ } }, hour: { $hour: { date: '$at', timezone: TZ } } },
                  orders: { $sum: 1 },
                },
              },
            ],
            lines: [
              {
                $group: {
                  _id: null,
                  all: { $sum: 1 },
                  cancelled: { $sum: { $cond: ['$live', 0, 1] } },
                  delivered: { $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] } },
                  returned: { $sum: { $cond: [{ $eq: ['$isReturned', 1] }, 1, 0] } },
                },
              },
            ],
            promo: [
              { $match: { live: true } },
              { $group: { _id: '$orderNumber', promo: { $max: { $cond: ['$promoApplied', 1, 0] } } } },
              { $group: { _id: null, orders: { $sum: 1 }, withPromo: { $sum: '$promo' } } },
            ],
          },
        },
      ]).then(([row]) => row),
      perDay(User, from, to, { role: 'user' }),
      perDay(AddBook, from, to),
      User.countDocuments({ role: 'user', ...inRange }),
      range === 'all' ? Promise.resolve(null) : User.countDocuments({ role: 'user', createdAt: { $gte: previousFrom, $lt: from } }),
      AddBook.countDocuments(inRange),
      range === 'all' ? Promise.resolve(null) : AddBook.countDocuments({ createdAt: { $gte: previousFrom, $lt: from } }),
    ]);

  const [searchRows, wantedOpen, wantedFound, wantedTop, catalogue, mostViewed, sellers, buyers] = await Promise.all([
    SearchLog.aggregate<{ _id: string; count: number; best: number }>([
      { $match: inRange },
      { $group: { _id: '$term', count: { $sum: 1 }, best: { $max: '$results' } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 200 },
    ]),
    WantedBook.countDocuments({ status: 'open' }),
    WantedBook.countDocuments({ status: 'found', foundAt: { $gte: from, $lt: to } }),
    WantedBook.find({ status: 'open' }, { title: 1, author: 1, requesterCount: 1 })
      .sort({ requesterCount: -1, createdAt: 1 })
      .limit(5)
      .lean(),
    AddBook.aggregate<{ _id: null; listings: number; inStock: number; views: number; wishlists: number }>([
      {
        $group: {
          _id: null,
          listings: { $sum: 1 },
          inStock: { $sum: { $cond: [{ $gt: ['$stock', 0] }, 1, 0] } },
          views: { $sum: { $ifNull: ['$viewCount', 0] } },
          wishlists: { $sum: { $ifNull: ['$wishlistCount', 0] } },
        },
      },
    ]).then(([row]) => row),
    AddBook.find({ viewCount: { $gt: 0 } }, { title: 1, author: 1, viewCount: 1, wishlistCount: 1 })
      .sort({ viewCount: -1, wishlistCount: -1 })
      .limit(5)
      .lean(),
    User.countDocuments({ role: 'user', bkashMerchant: { $nin: [null, ''] } }),
    User.countDocuments({ role: 'user', bkashMerchant: { $in: [null, ''] } }),
  ]);

  // Sellers by name as well as address, for the table.
  const names = new Map(
    (await User.find({ email: { $in: facets.sellers.map((seller) => seller._id) } }, { email: 1, username: 1 }).lean()).map(
      (user) => [user.email, user.username]
    )
  );

  const daily = new Map<string, Omit<AnalyticsPoint, 'date'>>();
  const dayOf = (day: string) => {
    const entry = daily.get(day) ?? { revenue: 0, orders: 0, signups: 0, listings: 0 };
    daily.set(day, entry);
    return entry;
  };
  facets.series.forEach((row) => Object.assign(dayOf(row._id), { revenue: row.revenue, orders: row.orders }));
  signupsByDay.forEach((n, day) => (dayOf(day).signups = n));
  listingsByDay.forEach((n, day) => (dayOf(day).listings = n));

  // Monday first, as the shop's week is read; $dayOfWeek counts Sunday as 1.
  const busyHours = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  facets.hours.forEach(({ _id, orders }) => {
    busyHours[(_id.day + 5) % 7][_id.hour] = orders;
  });

  const lines = facets.lines[0] ?? { all: 0, cancelled: 0, delivered: 0, returned: 0 };
  const promo = facets.promo[0] ?? { orders: 0, withPromo: 0 };
  const average = (totals: Totals | null) => (totals && totals.orders ? totals.revenue / totals.orders : 0);

  return {
    range,
    bucket,
    from: from.toISOString(),
    to: to.toISOString(),
    feePercent: SELLER_FEE_PERCENT,
    kpis: {
      revenue: kpi(current.revenue, previous?.revenue ?? null),
      orders: kpi(current.orders, previous?.orders ?? null),
      averageOrder: kpi(average(current), previous ? average(previous) : null),
      copiesSold: kpi(current.copies, previous?.copies ?? null),
      feesEarned: kpi(sellerFeeFor(current.earnedBase), previous ? sellerFeeFor(previous.earnedBase) : null),
      feesPending: round(sellerFeeFor(current.pendingBase)),
      newUsers: kpi(newUsers, previousUsers),
      newListings: kpi(newListings, previousListings),
    },
    series: bucketise(days, daily, bucket),
    categories: facets.categories.map((row) => ({ name: row._id, revenue: round(row.revenue), copies: row.copies })),
    busyHours,
    statuses: facets.statuses.map((row) => ({ status: row._id || 'Order Confirmed', count: row.count })),
    bookTypes: facets.bookTypes.map((row) => ({ type: row._id === 'old' ? 'old' : 'new', revenue: round(row.revenue), copies: row.copies })),
    regions: facets.regions.map((row) => ({ division: row._id || 'Not given', orders: row.orders })),
    topBooks: facets.books.map((row) => ({
      id: String(row._id),
      title: row.title || 'Untitled',
      author: row.author || '',
      copies: row.copies,
      revenue: round(row.revenue),
    })),
    topSellers: facets.sellers.map((row) => ({
      email: row._id,
      username: names.get(row._id) ?? '',
      revenue: round(row.revenue),
      orders: row.orders,
    })),
    rates: {
      cancelled: share(lines.cancelled, lines.all),
      returned: share(lines.returned, lines.delivered),
      promo: share(promo.withPromo, promo.orders),
    },
    searches: {
      total: searchRows.reduce((sum, row) => sum + row.count, 0),
      top: searchRows.slice(0, 8).map((row) => ({ term: row._id, count: row.count })),
      unmet: searchRows
        .filter((row) => row.best === 0)
        .slice(0, 8)
        .map((row) => ({ term: row._id, count: row.count })),
    },
    wanted: {
      open: wantedOpen,
      foundInRange: wantedFound,
      top: wantedTop.map((entry) => ({
        id: String(entry._id),
        title: entry.title,
        author: entry.author ?? '',
        requesterCount: entry.requesterCount ?? 0,
      })),
    },
    catalogue: {
      listings: catalogue?.listings ?? 0,
      inStock: catalogue?.inStock ?? 0,
      views: catalogue?.views ?? 0,
      wishlists: catalogue?.wishlists ?? 0,
      mostViewed: mostViewed.map((book) => ({
        id: String(book._id),
        title: book.title,
        author: book.author ?? '',
        viewCount: book.viewCount ?? 0,
        wishlistCount: book.wishlistCount ?? 0,
      })),
    },
    people: { buyers, sellers },
  };
};
