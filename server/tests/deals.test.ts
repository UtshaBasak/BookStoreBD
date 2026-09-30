/**
 * Quick deals: a seller's discount on their own book, as a percentage or an
 * amount of taka, and everything that follows from it - the sale price the
 * catalogue sorts and filters by, the shelf on the homepage, and the price
 * checkout actually charges.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser } from './helpers/factories.js';
import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';
import { priceWith } from '../config/pricing.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const SELLER = 'seller@test.com';

const discount = (auth: string, id: unknown, body: Record<string, unknown>) =>
  request.put(`/book/discount/${String(id)}`).set('Authorization', auth).send(body);

describe('the arithmetic', () => {
  it('takes a percentage or an amount off, and records both measures', () => {
    expect(priceWith(500, { type: 'percent', value: 20 })).toEqual({ salePrice: 400, discountPercent: 20, discountAmount: 100 });
    expect(priceWith(400, { type: 'amount', value: 100 })).toEqual({ salePrice: 300, discountPercent: 25, discountAmount: 100 });
    expect(priceWith(400, { type: null, value: 0 })).toEqual({ salePrice: 400, discountPercent: 0, discountAmount: 0 });
  });

  it('treats a discount that no longer fits the price as none', () => {
    expect(priceWith(80, { type: 'amount', value: 100 }).salePrice).toBe(80);
  });
});

describe('PUT /book/discount/:id', () => {
  it('lets the seller set a percentage, and the book carries its sale price', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER });
    const book = await createBook({ sellerEmail: SELLER, price: 500 });

    const res = await discount(auth, book._id, { type: 'percent', value: 20 });

    expect(res.status).toBe(200);
    expect(res.body.book).toMatchObject({ salePrice: 400, discountPercent: 20, discountAmount: 100, discountType: 'percent' });
  });

  it('takes an amount of taka off, and can be removed again', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER });
    const book = await createBook({ sellerEmail: SELLER, price: 400 });

    expect((await discount(auth, book._id, { type: 'amount', value: 100 })).body.book.salePrice).toBe(300);

    const removed = await discount(auth, book._id, { type: 'none' });
    expect(removed.body.book).toMatchObject({ salePrice: 400, discountPercent: 0, discountType: null });
  });

  it('refuses a discount that is too big, or not a whole number', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER });
    const book = await createBook({ sellerEmail: SELLER, price: 400 });

    expect((await discount(auth, book._id, { type: 'percent', value: 95 })).status).toBe(400);
    expect((await discount(auth, book._id, { type: 'amount', value: 400 })).status).toBe(400);
    expect((await discount(auth, book._id, { type: 'percent', value: 0 })).status).toBe(400);
    expect((await AddBook.findById(book._id).lean())?.discountPercent).toBe(0);
  });

  it("is only the seller's to set", async () => {
    await createUser({ email: SELLER });
    const { auth } = await createSignedInUser(request, { email: 'someone-else@test.com' });
    const book = await createBook({ sellerEmail: SELLER, price: 400 });

    expect((await discount(auth, book._id, { type: 'percent', value: 50 })).status).toBe(403);
  });

  it('drops an amount off when the price is lowered below it', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER });
    const book = await createBook({ sellerEmail: SELLER, price: 400 });
    await discount(auth, book._id, { type: 'amount', value: 150 });

    const res = await request.put(`/book/update-price/${String(book._id)}`).set('Authorization', auth).send({ price: 120 });

    expect(res.body.book).toMatchObject({ price: 120, salePrice: 120, discountType: null });
  });
});

describe('the catalogue', () => {
  const seed = async () => {
    await createBook({ title: 'Plain', price: 300, createdAt: new Date(Date.now() + 5000) });
    await createBook({ title: 'Tenth off', price: 1500, discountType: 'percent', discountValue: 10 });
    await createBook({ title: 'Half off', price: 200, discountType: 'percent', discountValue: 50 });
    await createBook({ title: 'Big saving', price: 2000, discountType: 'amount', discountValue: 400 });
  };
  const titles = (res: { body: { items: { title: string }[] } }) => res.body.items.map((book) => book.title);

  it('puts deals first by default, the biggest share off leading', async () => {
    await seed();
    const res = await request.get('/filter/booklist');

    // 50%, 20% (400 of 2000), 10% (150 of 1500), then the newest without a deal.
    expect(titles(res)).toEqual(['Half off', 'Big saving', 'Tenth off', 'Plain']);
  });

  it('ranks deals by taka saved when asked, and shows only deals', async () => {
    await seed();
    const res = await request.get('/filter/booklist?sort=dealAmount');

    expect(titles(res)).toEqual(['Big saving', 'Tenth off', 'Half off']);
  });

  it('filters to deals, and by the price actually paid', async () => {
    await seed();

    expect(titles(await request.get('/filter/booklist?deals=1&sort=dealPercent'))).toEqual(['Half off', 'Big saving', 'Tenth off']);
    // Half off is 100 Tk now, though listed at 200.
    expect(titles(await request.get('/filter/booklist?maxPrice=150'))).toEqual(['Half off']);
  });
});

describe('checkout', () => {
  it('charges the sale price, and keeps the listed price beside it', async () => {
    const { auth } = await createSignedInUser(request, { email: 'buyer@test.com' });
    const book = await createBook({ price: 500, stock: 3, discountType: 'percent', discountValue: 20 });

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', auth)
      .send({ items: [{ bookId: String(book._id), quantity: 2 }], deliveryDistrict: 'Dhaka' });

    expect(res.status).toBe(200);
    const line = await Order.findOne({ orderNumber: res.body.orderNumber }).lean();
    expect(line).toMatchObject({ price: 400, listPrice: 500, quantity: 2 });
  });
});

describe('GET /filter/sections', () => {
  it('shelves the biggest deals first, and only books in stock', async () => {
    await createBook({ title: 'Small deal', price: 500, discountType: 'percent', discountValue: 10 });
    await createBook({ title: 'Big deal', price: 500, discountType: 'percent', discountValue: 40 });
    await createBook({ title: 'Sold out deal', price: 500, stock: 0, discountType: 'percent', discountValue: 60 });
    await createBook({ title: 'No deal', price: 500 });

    const res = await request.get('/filter/sections');

    expect(res.status).toBe(200);
    expect(res.body.deals.map((book: { title: string }) => book.title)).toEqual(['Big deal', 'Small deal']);
  });

  it('ranks bestsellers by copies sold, and names the writers and categories', async () => {
    const { auth } = await createSignedInUser(request, { email: 'buyer@test.com' });
    const popular = await createBook({ title: 'Popular', author: 'Humayun Ahmed', category: ['Novels'], stock: 10 });
    const quiet = await createBook({ title: 'Quiet', author: 'Someone', category: ['Poetry'], stock: 10 });
    const order = (id: unknown, quantity: number) =>
      request
        .post('/order/decrease-stock')
        .set('Authorization', auth)
        .send({ items: [{ bookId: String(id), quantity }], deliveryDistrict: 'Dhaka' });
    await order(popular._id, 3);
    await order(quiet._id, 1);

    const res = await request.get('/filter/sections');

    expect(res.body.bestsellers.map((book: { title: string }) => book.title)).toEqual(['Popular', 'Quiet']);
    expect(res.body.trending[0].title).toBe('Popular');
    expect(res.body.writers[0]).toMatchObject({ name: 'Humayun Ahmed', sold: 3, books: 1 });
    expect(res.body.categories).toEqual(
      expect.arrayContaining([
        { name: 'Novels', books: 1 },
        { name: 'Poetry', books: 1 },
      ])
    );
  });

  it('answers with empty shelves for an empty shop', async () => {
    const res = await request.get('/filter/sections');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ deals: [], trending: [], bestsellers: [], writers: [], categories: [] });
  });
});

describe('Recently viewed and Top picks', () => {
  it('returns books in the order asked for', async () => {
    const a = await createBook({ title: 'A' });
    const b = await createBook({ title: 'B' });

    const res = await request.get(`/filter/by-ids?ids=${String(b._id)},${String(a._id)}`);

    expect(res.body.map((book: { title: string }) => book.title)).toEqual(['B', 'A']);
  });

  it('refuses something that is not a book id', async () => {
    expect((await request.get('/filter/by-ids?ids=not-an-id')).status).toBe(400);
  });

  it('picks books like the ones viewed, and not the ones viewed', async () => {
    const seen = await createBook({ title: 'Seen', author: 'Agatha Christie', category: ['Mystery & Thriller'] });
    await createBook({ title: 'Also a mystery', author: 'Satyajit Ray', category: ['Mystery & Thriller'] });
    await createBook({ title: 'Cookery', author: 'Siddika Kabir', category: ['Cooking & Food'] });

    const res = await request.get(`/filter/for-you?seen=${String(seen._id)}`);

    expect(res.body.personal).toBe(true);
    expect(res.body.items[0].title).toBe('Also a mystery');
    expect(res.body.items.map((book: { title: string }) => book.title)).not.toContain('Seen');
  });
});
