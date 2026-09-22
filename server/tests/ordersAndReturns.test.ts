/**
 * The three order tables and the returns table each fetched everything they
 * could see and then searched and grouped in the browser - so the search box
 * could only find a row that had already been downloaded, and the returns
 * table downloaded every photograph of every defect to draw a button that did
 * not open them.
 *
 * None of these endpoints had a test on what they returned, only on who could
 * call them, which is why changing the shape broke nothing.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser, PNG_PIXEL } from './helpers/factories.js';
import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const BUYER = 'buyer@test.com';
const SELLER = 'seller@test.com';

/** One order of `books` lines, all sharing an order number. */
const placeOrder = async (
  orderNumber: string,
  books: { title: string; author?: string }[],
  overrides: Record<string, unknown> = {}
) =>
  Order.insertMany(
    books.map((book, index) => ({
      orderNumber,
      status: 'Order Confirmed',
      buyerEmail: BUYER,
      sellerEmail: SELLER,
      bookId: new mongoose.Types.ObjectId(),
      title: book.title,
      author: book.author ?? 'An Author',
      price: 100 + index,
      quantity: 1,
      ...overrides,
    }))
  );

const orderNumber = (n: number) => `ORDER${String(n).padStart(11, '0')}`;

describe('a page of orders', () => {
  it('counts orders, not lines', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    // Three orders of three books each: nine rows, three orders.
    for (let i = 0; i < 3; i += 1) {
      await placeOrder(orderNumber(i), [
        { title: 'One' },
        { title: 'Two' },
        { title: 'Three' },
      ]);
    }

    const res = await request.get('/order/buyer?pageSize=2').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(3);
    expect(res.body.pageCount).toBe(2);
  });

  it('never cuts an order between two pages', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    for (let i = 0; i < 3; i += 1) {
      await placeOrder(orderNumber(i), [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }]);
    }

    const first = await request.get('/order/buyer?pageSize=2&page=1').set('Authorization', auth);
    const second = await request.get('/order/buyer?pageSize=2&page=2').set('Authorization', auth);

    // Two whole orders, then one: six lines and three, not five and four.
    expect(first.body.items).toHaveLength(6);
    expect(second.body.items).toHaveLength(3);

    const on = (body: { items: { orderNumber: string }[] }) =>
      new Set(body.items.map((line) => line.orderNumber));
    for (const number of on(second.body)) {
      expect(on(first.body).has(number)).toBe(false);
    }
  });

  it('carries the order totals on every line, as it always did', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    await placeOrder(orderNumber(1), [{ title: 'One' }, { title: 'Two' }]);

    const res = await request.get('/order/buyer').set('Authorization', auth);

    for (const line of res.body.items) {
      expect(line.totalCost).toBeGreaterThan(0);
      expect(line.booksTotal).toBeGreaterThan(0);
    }
  });

  it('shows a seller their own orders, and nobody else the seller list', async () => {
    const seller = await createSignedInUser(request, { email: SELLER });
    await placeOrder(orderNumber(1), [{ title: 'One' }]);
    await placeOrder(orderNumber(2), [{ title: 'Two' }], { sellerEmail: 'other@test.com' });

    const res = await request.get('/order/seller').set('Authorization', seller.auth);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe('One');
  });
});

describe('searching orders', () => {
  const stock = async () => {
    await placeOrder(orderNumber(1), [{ title: 'Pather Panchali', author: 'Bibhutibhushan' }]);
    await placeOrder(orderNumber(2), [{ title: 'Clean Code', author: 'Robert Martin' }]);
  };

  it('finds an order that is not on the page being looked at', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    await stock();

    const res = await request.get('/order/buyer?search=panchali').set('Authorization', auth);

    // The browser filter could only ever search what it had downloaded.
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].title).toBe('Pather Panchali');
  });

  it('by order number', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    await stock();

    const res = await request
      .get(`/order/buyer?search=${orderNumber(2)}`)
      .set('Authorization', auth);

    expect(res.body.total).toBe(1);
  });

  it('treats a crafted pattern literally', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    await stock();

    expect((await request.get('/order/buyer?search=.*').set('Authorization', auth)).body.total).toBe(0);
  });

  it('refuses a page size big enough to be every order', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });

    expect((await request.get('/order/buyer?pageSize=9000').set('Authorization', auth)).status).toBe(400);
  });
});

describe("a buyer's line knows whether it is being returned", () => {
  it('carries the status, so the list needs no second request', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const [line] = await placeOrder(orderNumber(1), [{ title: 'Faulty' }]);
    await ReturnRequest.create({
      bookId: line.bookId,
      bookTitle: 'Faulty',
      userEmail: BUYER,
      sellerEmail: SELLER,
      defectDescription: 'Pages missing',
      status: 'pending',
    });

    const res = await request.get('/order/buyer').set('Authorization', auth);

    // This used to mean downloading every return request the account had ever
    // made - photographs of every defect included - to build a lookup.
    expect(res.body.items[0].returnStatus).toBe('pending');
  });

  it('and says so plainly when there is none', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    await placeOrder(orderNumber(1), [{ title: 'Fine' }]);

    const res = await request.get('/order/buyer').set('Authorization', auth);

    expect(res.body.items[0].returnStatus).toBeNull();
  });
});

const makeReturn = async (overrides: Record<string, unknown> = {}) =>
  ReturnRequest.create({
    bookId: new mongoose.Types.ObjectId(),
    bookTitle: 'A Book',
    userEmail: BUYER,
    sellerEmail: SELLER,
    defectDescription: 'Torn cover',
    images: [`data:image/png;base64,${PNG_PIXEL.toString('base64')}`],
    status: 'pending',
    ...overrides,
  });

describe('a page of return requests', () => {
  it('sends addresses for the photographs, not the photographs', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const created = await makeReturn();

    const res = await request.get('/return/requests').set('Authorization', admin.auth);

    expect(res.body.items[0].images).toEqual([
      `/api/return/requests/${String(created._id)}/image/0`,
    ]);
    // The whole table used to carry every picture anybody had uploaded.
    expect(JSON.stringify(res.body)).not.toContain('base64');
  });

  it('pages, and counts what matched', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    for (let i = 0; i < 30; i += 1) await makeReturn({ bookTitle: `Book ${String(i)}` });

    const res = await request.get('/return/requests?pageSize=25').set('Authorization', admin.auth);

    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
  });

  it('shows a buyer only their own', async () => {
    const buyer = await createSignedInUser(request, { email: BUYER });
    await makeReturn();
    await makeReturn({ userEmail: 'someone-else@test.com' });

    const res = await request.get('/return/requests').set('Authorization', buyer.auth);

    expect(res.body.total).toBe(1);
  });

  it('searches the whole table', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    await makeReturn({ bookTitle: 'Pather Panchali' });
    await makeReturn({ bookTitle: 'Clean Code' });

    const res = await request
      .get('/return/requests?search=panchali')
      .set('Authorization', admin.auth);

    expect(res.body.total).toBe(1);
  });
});

describe('one photograph from a return request', () => {
  it('is served to the administrator deciding it', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const created = await makeReturn();

    const res = await request
      .get(`/return/requests/${String(created._id)}/image/0`)
      .set('Authorization', admin.auth);

    // The button that should have opened this never had anywhere to go.
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.body).toEqual(PNG_PIXEL);
  });

  it('and to the buyer who uploaded it', async () => {
    const buyer = await createSignedInUser(request, { email: BUYER });
    const created = await makeReturn();

    expect(
      (
        await request
          .get(`/return/requests/${String(created._id)}/image/0`)
          .set('Authorization', buyer.auth)
      ).status
    ).toBe(200);
  });

  it('and to nobody else', async () => {
    const stranger = await createSignedInUser(request, { email: 'stranger@test.com' });
    const created = await makeReturn();

    // A defect photograph is somebody's property, and their address label may
    // well be in the frame.
    expect(
      (
        await request
          .get(`/return/requests/${String(created._id)}/image/0`)
          .set('Authorization', stranger.auth)
      ).status
    ).toBe(403);
  });

  it('not at all when signed out', async () => {
    const created = await makeReturn();

    expect((await request.get(`/return/requests/${String(created._id)}/image/0`)).status).toBe(401);
  });

  it('can be cached and revalidated', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const created = await makeReturn();
    const url = `/return/requests/${String(created._id)}/image/0`;

    const first = await request.get(url).set('Authorization', admin.auth);
    expect(first.headers['cache-control']).toMatch(/public, max-age=\d+/);

    const again = await request
      .get(url)
      .set('Authorization', admin.auth)
      .set('If-None-Match', first.headers.etag);

    expect(again.status).toBe(304);
  });

  it('404s for an index that is not there', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const created = await makeReturn();

    expect(
      (
        await request
          .get(`/return/requests/${String(created._id)}/image/7`)
          .set('Authorization', admin.auth)
      ).status
    ).toBe(404);
  });

  it('refuses to serve anything that is not an image', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const created = await makeReturn({
      images: ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='],
    });

    expect(
      (
        await request
          .get(`/return/requests/${String(created._id)}/image/0`)
          .set('Authorization', admin.auth)
      ).status
    ).toBe(404);
  });
});
