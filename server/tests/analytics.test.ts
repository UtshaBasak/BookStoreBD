/**
 * The administrator's dashboard: sales and fees counted the way the shop is
 * paid, orders counted by order number, and hours in Dhaka time.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUser, createUserWithToken } from './helpers/factories.js';
import Order from '../models/Order.model.js';
import SearchLog from '../models/SearchLog.model.js';
import WantedBook from '../models/WantedBook.model.js';
import AddBook from '../models/AddBook.model.js';
import { shopAnalytics } from '../utils/analytics.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-30T12:00:00Z');

let lineNo = 0;
const line = async (overrides: Record<string, unknown>) => {
  lineNo += 1;
  const book = await createBook({ title: `Book ${lineNo}` });
  return Order.create({
    orderNumber: `ORD-${lineNo}`,
    buyerEmail: 'buyer@test.com',
    sellerEmail: 'seller@test.com',
    bookId: book._id,
    title: book.title,
    author: 'An Author',
    category: ['Fiction'],
    bookType: 'new',
    price: 100,
    quantity: 1,
    status: 'Delivered',
    ...overrides,
  });
};

describe('the shop’s analytics', () => {
  it('are for administrators only', async () => {
    const buyer = await createUserWithToken();
    expect((await request.get('/admin/analytics').set('Authorization', buyer.auth)).status).toBe(403);
    const admin = await createUserWithToken({ email: 'admin@test.com', role: 'admin' });
    const res = await request.get('/admin/analytics?range=7d').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.range).toBe('7d');
    expect(res.body.series).toHaveLength(7);
    expect((await request.get('/admin/analytics?range=forever').set('Authorization', admin.auth)).status).toBe(400);
  });

  it('count sales and fees the way the shop is paid', async () => {
    await createUser({ email: 'seller@test.com', username: 'rahim_books' });
    const at = new Date(NOW.getTime() - 2 * DAY);
    // One order of two books, delivered.
    await line({ orderNumber: 'ORD-A', price: 200, quantity: 2, createdAt: at });
    await line({ orderNumber: 'ORD-A', price: 100, createdAt: at, category: ['Fiction', 'Poetry'] });
    // On its way: a sale, but the fee is not earned yet.
    await line({ status: 'Shipped', price: 300, createdAt: at });
    // Returned: sold, but no fee.
    await line({ price: 1000, isReturned: 1, createdAt: at });
    // Cancelled: not a sale at all.
    await line({ status: 'Cancelled', price: 5000, createdAt: at });
    // Last month, for the comparison.
    await line({ price: 50, createdAt: new Date(NOW.getTime() - 10 * DAY) });

    const stats = await shopAnalytics('7d', NOW);
    expect(stats.kpis.revenue).toEqual({ value: 1800, previous: 50 });
    expect(stats.kpis.orders.value).toBe(3);
    expect(stats.kpis.copiesSold.value).toBe(5);
    expect(stats.kpis.feesEarned.value).toBe(25); // 5% of 400 + 100
    expect(stats.kpis.feesPending).toBe(15); // 5% of 300
    expect(stats.kpis.averageOrder.value).toBe(600);
    expect(stats.rates.cancelled).toBe(0.2);
    expect(stats.categories[0]).toEqual({ name: 'Fiction', revenue: 1800, copies: 5 });
    expect(stats.categories.find((c) => c.name === 'Poetry')?.revenue).toBe(100);
    expect(stats.topSellers[0]).toMatchObject({ email: 'seller@test.com', username: 'rahim_books', revenue: 1800, orders: 3 });
    expect(stats.series.reduce((sum, point) => sum + point.revenue, 0)).toBe(1800);
  });

  it('read hours and weekdays in Dhaka time', async () => {
    // 20:30 UTC on a Sunday is 02:30 on Monday in Dhaka.
    await line({ createdAt: new Date('2026-09-27T20:30:00Z') });
    const stats = await shopAnalytics('7d', NOW);
    expect(stats.busyHours).toHaveLength(7);
    expect(stats.busyHours[0][2]).toBe(1);
    expect(stats.busyHours.flat().reduce((a, b) => a + b, 0)).toBe(1);
  });

  it('show what people search for and cannot find, and what they ask for', async () => {
    const at = new Date(NOW.getTime() - DAY);
    await SearchLog.create([
      { term: 'tagore', results: 4, createdAt: at },
      { term: 'tagore', results: 4, createdAt: at },
      { term: 'rare atlas', results: 0, createdAt: at },
    ]);
    await WantedBook.create({ title: 'Rare Atlas', titleKey: 'rr', requesterCount: 3, createdBy: 'a@test.com' });
    const book = await createBook();
    await AddBook.updateOne({ _id: book._id }, { viewCount: 12, wishlistCount: 2 });

    const stats = await shopAnalytics('30d', NOW);
    expect(stats.searches.total).toBe(3);
    expect(stats.searches.top[0]).toEqual({ term: 'tagore', count: 2 });
    expect(stats.searches.unmet).toEqual([{ term: 'rare atlas', count: 1 }]);
    expect(stats.wanted.open).toBe(1);
    expect(stats.wanted.top[0]).toMatchObject({ title: 'Rare Atlas', requesterCount: 3 });
    expect(stats.catalogue).toMatchObject({ listings: 1, views: 12, wishlists: 2 });
    expect(stats.catalogue.mostViewed[0].viewCount).toBe(12);
  });

  it('gather a long window into weeks or months', async () => {
    expect((await shopAnalytics('90d', NOW)).bucket).toBe('week');
    const year = await shopAnalytics('12m', NOW);
    expect(year.bucket).toBe('month');
    expect(year.series.at(-1)?.date).toBe('2026-09');
    expect((await shopAnalytics('all', NOW)).kpis.revenue.previous).toBeNull();
  });
});
