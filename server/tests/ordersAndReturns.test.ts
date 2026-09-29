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
import { createBook, createSignedInUser, PNG_PIXEL } from './helpers/factories.js';
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

/**
 * The photographs a buyer uploads.
 *
 * They were being discarded. The form posted them to /user/upload-images,
 * which handed back base64 and stored nothing, and the return request was then
 * created without them - so a buyer was asked to photograph the damage, and an
 * administrator decided the return with no evidence. The upload form did not
 * even have a submit button.
 */
describe('submitting a return with its photographs', () => {
  /** A line the buyer has had delivered today, so it is inside the window. */
  const book = async () => {
    const [line] = await placeOrder(orderNumber(90), [{ title: 'A Damaged Book' }], {
      status: 'Delivered',
      deliveredAt: new Date(),
    });
    return line;
  };

  it('keeps them, so the administrator can see the damage', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const damaged = await book();

    const res = await request
      .post('/return')
      .set('Authorization', auth)
      .field('orderId', String(damaged._id))
      .field('refundBkash', '01712345678')
      .field('defectDescription', 'Pages loose at the spine')
      .attach('images', PNG_PIXEL, 'damage.png');

    expect(res.status).toBe(200);

    const stored = await ReturnRequest.findById(res.body.returnId).lean();
    expect(stored?.images).toHaveLength(1);
    expect(stored?.images?.[0]).toMatch(/^data:image\/png;base64,/);
  });

  it('and the administrator is served them one at a time', async () => {
    const buyer = await createSignedInUser(request, { email: BUYER });
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const damaged = await book();

    await request
      .post('/return')
      .set('Authorization', buyer.auth)
      .field('orderId', String(damaged._id))
      .field('refundBkash', '01712345678')
      .field('defectDescription', 'Cover torn')
      .attach('images', PNG_PIXEL, 'damage.png');

    const list = await request.get('/return/requests').set('Authorization', admin.auth);
    const [address] = list.body.items[0].images as string[];

    const image = await request.get(address.replace('/api', '')).set('Authorization', admin.auth);

    expect(image.status).toBe(200);
    expect(image.body).toEqual(PNG_PIXEL);
  });

  it('is still accepted without any, because not every fault photographs', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const damaged = await book();

    const res = await request
      .post('/return')
      .set('Authorization', auth)
      .field('orderId', String(damaged._id))
      .field('refundBkash', '01712345678')
      .field('defectDescription', 'Two chapters are missing');

    expect(res.status).toBe(200);
    const stored = await ReturnRequest.findById(res.body.returnId).lean();
    expect(stored?.images).toHaveLength(0);
  });

  it('refuses a file that is not an image, whatever it is called', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const damaged = await book();

    const res = await request
      .post('/return')
      .set('Authorization', auth)
      .field('orderId', String(damaged._id))
      .field('refundBkash', '01712345678')
      .field('defectDescription', 'Pages loose')
      .attach('images', Buffer.from('<script>alert(1)</script>'), 'damage.png');

    // The first bytes are read, so a rename does not get anything through.
    expect(res.status).toBe(415);
  });

  it('will not store a URL pointing somewhere we do not own', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const damaged = await book();

    const res = await request
      .post('/return')
      .set('Authorization', auth)
      .field('orderId', String(damaged._id))
      .field('refundBkash', '01712345678')
      .field('defectDescription', 'Pages loose')
      .field('images', 'https://example.invalid/whatever.png');

    expect(res.status).toBe(200);
    const stored = await ReturnRequest.findById(res.body.returnId).lean();
    // Nothing configured here, so nothing passes the ownership check.
    expect(stored?.images).toHaveLength(0);
  });

  it('still requires a description', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const damaged = await book();

    const res = await request
      .post('/return')
      .set('Authorization', auth)
      .field('orderId', String(damaged._id))
      .field('refundBkash', '01712345678')
      .attach('images', PNG_PIXEL, 'damage.png');

    expect(res.status).toBe(400);
  });
});

/**
 * Who may return what, and when.
 *
 * The request used to carry a book id and nothing else. The server did not
 * check that the person asking had bought the book, and the three-day limit
 * was worked out only in the browser, from the order date - so a book that
 * took four days to arrive had lost its return before it came, while a
 * hand-made request could return anything at any time.
 */
describe('the return window', () => {
  const DAY = 24 * 60 * 60 * 1000;

  const ask = (auth: string, orderId: unknown, refundBkash = '01712345678') =>
    request
      .post('/return')
      .set('Authorization', auth)
      .field('orderId', String(orderId))
      .field('refundBkash', refundBkash)
      .field('defectDescription', 'Pages missing');

  it('opens on delivery, not on the order date', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    // Ordered ten days ago, delivered yesterday: well inside seven days.
    const [line] = await placeOrder(orderNumber(1), [{ title: 'Slow Post' }], {
      createdAt: new Date(Date.now() - 10 * DAY),
      status: 'Delivered',
      deliveredAt: new Date(Date.now() - DAY),
    });

    expect((await ask(auth, line._id)).status).toBe(200);
  });

  it('is not open before the book has arrived', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const [line] = await placeOrder(orderNumber(1), [{ title: 'On Its Way' }], { status: 'Shipped' });

    const res = await ask(auth, line._id);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/delivered/);
  });

  it('closes seven days after delivery', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const [line] = await placeOrder(orderNumber(1), [{ title: 'Too Late' }], {
      status: 'Delivered',
      deliveredAt: new Date(Date.now() - 8 * DAY),
    });

    const res = await ask(auth, line._id);

    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/7-day/);
  });

  it("will not return somebody else's order", async () => {
    await createSignedInUser(request, { email: BUYER });
    const stranger = await createSignedInUser(request, { email: 'stranger@test.com' });
    const [line] = await placeOrder(orderNumber(1), [{ title: 'Not Yours' }], {
      status: 'Delivered',
      deliveredAt: new Date(),
    });

    expect((await ask(stranger.auth, line._id)).status).toBe(404);
  });

  it('takes one request per book bought', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const [line] = await placeOrder(orderNumber(1), [{ title: 'Once' }], {
      status: 'Delivered',
      deliveredAt: new Date(),
    });

    expect((await ask(auth, line._id)).status).toBe(200);
    expect((await ask(auth, line._id)).status).toBe(409);
  });

  it('needs a bKash number to refund to, written however people write them', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const [first, second] = await placeOrder(
      orderNumber(1),
      [{ title: 'One' }, { title: 'Two' }],
      { status: 'Delivered', deliveredAt: new Date() }
    );

    expect((await ask(auth, first._id, '12345')).status).toBe(400);

    const res = await ask(auth, second._id, '+880 1712-345678');
    expect(res.status).toBe(200);
    const stored = await ReturnRequest.findById(res.body.returnId).lean();
    expect(stored?.refundBkash).toBe('01712345678');
    expect(stored?.orderNumber).toBe(orderNumber(1));
  });

  it('is told to the buyer with each line, so the page shows what the server will allow', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const deliveredAt = new Date(Date.now() - DAY);
    await placeOrder(orderNumber(1), [{ title: 'Open' }], { status: 'Delivered', deliveredAt });
    await placeOrder(orderNumber(2), [{ title: 'Pending' }], { status: 'Processing' });

    const res = await request.get('/order/buyer').set('Authorization', auth);
    const byTitle = Object.fromEntries(
      (res.body.items as { title: string; returnableUntil: string | null }[]).map((line) => [
        line.title,
        line.returnableUntil,
      ])
    );

    expect(byTitle.Open).toBe(new Date(deliveredAt.getTime() + 7 * DAY).toISOString());
    expect(byTitle.Pending).toBeNull();
  });

  it('tells two purchases of the same title apart', async () => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const bookId = new mongoose.Types.ObjectId();
    const [returned] = await placeOrder(orderNumber(1), [{ title: 'Twice' }], {
      bookId,
      status: 'Delivered',
      deliveredAt: new Date(),
    });
    await placeOrder(orderNumber(2), [{ title: 'Twice' }], {
      bookId,
      status: 'Delivered',
      deliveredAt: new Date(),
    });

    await ask(auth, returned._id);
    const res = await request.get('/order/buyer').set('Authorization', auth);
    const statuses = (res.body.items as { orderNumber: string; returnStatus: string | null }[]).map(
      (line) => [line.orderNumber, line.returnStatus]
    );

    expect(Object.fromEntries(statuses)).toEqual({
      [orderNumber(1)]: 'pending',
      [orderNumber(2)]: null,
    });
  });
});

describe('marking an order delivered', () => {
  const place = async () => {
    const buyer = await createSignedInUser(request, { email: BUYER });
    const seller = await createSignedInUser(request, { email: SELLER });
    await placeOrder(orderNumber(1), [{ title: 'Parcel' }]);
    const move = (auth: string, status: string) =>
      request.patch(`/order/status/${orderNumber(1)}`).set('Authorization', auth).send({ status });
    const line = () => Order.findOne({ orderNumber: orderNumber(1) }).lean();
    return { buyer, seller, move, line };
  };

  it('stamps the date the return window counts from', async () => {
    const { seller, move, line } = await place();

    await move(seller.auth, 'Delivered');

    expect((await line())?.deliveredAt).toBeInstanceOf(Date);
  });

  it('does not move that date when it is marked delivered again', async () => {
    const { seller, move, line } = await place();
    await move(seller.auth, 'Delivered');
    const first = (await line())?.deliveredAt;

    await move(seller.auth, 'Delivered');

    expect((await line())?.deliveredAt).toEqual(first);
  });

  it('is for the seller or an administrator, not the buyer', async () => {
    const { buyer, move, line } = await place();

    // Otherwise a buyer could step their own order out of 'Delivered' and back
    // to restart the window.
    expect((await move(buyer.auth, 'Delivered')).status).toBe(403);
    expect((await line())?.deliveredAt).toBeNull();
  });
});

/**
 * Delivery is priced by the server.
 *
 * The browser sent the charge and it was stored as given - and the browser
 * priced the whole Dhaka division as inside Dhaka, Tangail and Faridpur
 * included.
 */
describe('the delivery charge', () => {
  const checkout = async (body: Record<string, unknown>, price = 300) => {
    const { auth } = await createSignedInUser(request, { email: BUYER });
    const book = await createBook({ price, stock: 5 });
    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', auth)
      .send({ items: [{ bookId: String(book._id), quantity: 1 }], ...body });
    const line = await Order.findOne({ orderNumber: res.body.orderNumber }).lean();
    return { res, line };
  };

  it('is 70 taka inside Dhaka', async () => {
    const { res, line } = await checkout({ deliveryDivision: 'Dhaka', deliveryDistrict: 'Dhaka' });
    expect(res.body.shippingCharge).toBe(70);
    expect(line?.shippingCharge).toBe(70);
  });

  it('is 120 taka outside it, including the rest of Dhaka division', async () => {
    const { line } = await checkout({ deliveryDivision: 'Dhaka', deliveryDistrict: 'Tangail' });
    expect(line?.shippingCharge).toBe(120);
  });

  it('is free on an order of 1000 taka or more', async () => {
    const { line } = await checkout({ deliveryDistrict: 'Sylhet' }, 1000);
    expect(line?.shippingCharge).toBe(0);
  });

  it('ignores a figure the browser sends', async () => {
    const { line } = await checkout({ deliveryDistrict: 'Sylhet', shippingCharge: 0 });
    expect(line?.shippingCharge).toBe(120);
  });
});
