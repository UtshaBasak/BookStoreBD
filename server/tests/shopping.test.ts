/**
 * The shopper's side of the review batch: copies in the cart, stock that runs
 * out after, cancelling an order, returning a whole one, a seller's shop, the
 * notifications that go with all of it, and the administrator's lists.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createUserWithToken, PNG_PIXEL } from './helpers/factories.js';
import AddBook from '../models/AddBook.model.js';
import Notification from '../models/Notification.model.js';
import Order from '../models/Order.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const BUYER = 'buyer@test.com';
const SELLER = 'seller@test.com';
const ADMIN = 'admin@test.com';

const people = async () => ({
  buyer: await createUserWithToken({ email: BUYER, username: 'reader', bkashMerchant: null }),
  seller: await createUserWithToken({ email: SELLER, username: 'bookshop', bkashMerchant: '01710000001' }),
  admin: await createUserWithToken({ email: ADMIN, username: 'admin', role: 'admin' }),
});

const checkout = (auth: string, items: { bookId: unknown; quantity: number }[]) =>
  request
    .post('/order/decrease-stock')
    .set('Authorization', auth)
    .send({ items: items.map((item) => ({ ...item, bookId: String(item.bookId) })), deliveryDistrict: 'Dhaka' });

const notificationsOf = async (email: string) => (await Notification.find({ recipient: email }).lean()).map((n) => n.type);

// ------------------------------------------------------------------- cart
describe('copies in the cart', () => {
  it('holds how many copies, and changes them', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });

    const added = await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth).send({ quantity: 3 });
    expect(added.status).toBe(200);
    expect(added.body[0].cartQuantity).toBe(3);

    const changed = await request.patch(`/cart/${String(book._id)}`).set('Authorization', buyer.auth).send({ quantity: 2 });
    expect(changed.body[0].cartQuantity).toBe(2);
  });

  it('refuses more copies than there are', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 2 });

    const res = await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth).send({ quantity: 3 });

    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ message: 'Only 2 copies are left.', available: 2 });
  });

  it('brings a quantity down to what is left when stock falls, and says so', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth).send({ quantity: 4 });
    await AddBook.updateOne({ _id: book._id }, { stock: 2 });

    const res = await request.get('/cart').set('Authorization', buyer.auth);

    expect(res.body[0]).toMatchObject({ cartQuantity: 2, cartAdjusted: true });
  });

  it('keeps a sold-out book in the cart, marked by its stock, rather than dropping it', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 1 });
    await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth);
    await AddBook.updateOne({ _id: book._id }, { stock: 0 });

    const res = await request.get('/cart').set('Authorization', buyer.auth);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].stock).toBe(0);
  });
});

// ----------------------------------------------------------- cancellation
describe('cancelling an order', () => {
  const place = async () => {
    const who = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5, title: 'Deyal' });
    const res = await checkout(who.buyer.auth, [{ bookId: book._id, quantity: 2 }]);
    const orderNumber = res.body.orderNumber as string;
    const cancel = (auth: string) => request.post(`/order/${orderNumber}/cancel`).set('Authorization', auth).send({ reason: 'Changed my mind' });
    const move = (auth: string, status: string) => request.patch(`/order/status/${orderNumber}`).set('Authorization', auth).send({ status });
    return { ...who, book, orderNumber, cancel, move };
  };
  const stockOf = async (id: unknown) => (await AddBook.findById(id).lean())?.stock;

  it('lets the buyer cancel before it is being prepared, and puts the books back', async () => {
    const { buyer, book, orderNumber, cancel } = await place();
    expect(await stockOf(book._id)).toBe(3);

    const res = await cancel(buyer.auth);

    expect(res.status).toBe(200);
    expect(await stockOf(book._id)).toBe(5);
    expect(await Order.findOne({ orderNumber }).lean()).toMatchObject({ status: 'Cancelled', cancelledBy: 'buyer', cancelReason: 'Changed my mind' });
  });

  it('does not let the buyer cancel once it is Processing', async () => {
    const { buyer, seller, cancel, move } = await place();
    await move(seller.auth, 'Processing');

    expect((await cancel(buyer.auth)).status).toBe(409);
  });

  it('lets the seller cancel until it ships, and the admin until it is delivered', async () => {
    const one = await place();
    await one.move(one.seller.auth, 'Processing');
    expect((await one.cancel(one.seller.auth)).status).toBe(200);

    await clearDatabase();
    const two = await place();
    await two.move(two.seller.auth, 'Shipped');
    expect((await two.cancel(two.seller.auth)).status).toBe(409);
    expect((await two.cancel(two.admin.auth)).status).toBe(200);
  });

  it('cannot be undone by moving the status on', async () => {
    const { buyer, admin, orderNumber, cancel, move } = await place();
    await cancel(buyer.auth);

    expect((await move(admin.auth, 'Shipped')).status).toBe(403);
    expect((await Order.findOne({ orderNumber }).lean())?.status).toBe('Cancelled');
  });

  it('says what the person looking may do', async () => {
    const { buyer, seller, admin, orderNumber } = await place();
    const detail = async (auth: string) => (await request.get(`/order/${orderNumber}`).set('Authorization', auth)).body;

    expect(await detail(buyer.auth)).toMatchObject({ canCancel: true, statusOptions: [] });
    expect((await detail(seller.auth)).statusOptions).toEqual(['Order Confirmed', 'Processing', 'Shipped']);
    expect((await detail(admin.auth)).statusOptions).toHaveLength(5);
  });

  it('costs nothing once every book in it is cancelled', async () => {
    const { buyer, orderNumber, cancel } = await place();
    await cancel(buyer.auth);

    const res = await request.get(`/order/${orderNumber}`).set('Authorization', buyer.auth);

    expect(res.body).toMatchObject({ status: 'Cancelled', booksTotal: 0, shippingCost: 0, totalCost: 0 });
  });
});

// ---------------------------------------------------------- notifications
describe('notifications', () => {
  it('tell the buyer, the seller and the admins about a new order, and who sold out', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 1 });

    await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);

    expect(await notificationsOf(BUYER)).toEqual(['order-placed']);
    expect((await notificationsOf(SELLER)).sort()).toEqual(['order-received', 'stock']);
    expect(await notificationsOf(ADMIN)).toEqual(['order-received']);
  });

  it('tell the buyer when the order moves on, and the seller when the shop moves it', async () => {
    const { buyer, admin } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3 });
    const { body } = await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);
    await Notification.deleteMany({});

    await request.patch(`/order/status/${String(body.orderNumber)}`).set('Authorization', admin.auth).send({ status: 'Out for Delivery' });

    expect(await notificationsOf(BUYER)).toEqual(['order-status']);
    expect(await notificationsOf(SELLER)).toEqual(['order-status']);
  });

  it('are a person\'s own, newest first, with an unread count, and can be marked read', async () => {
    const { buyer, seller } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3 });
    await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);

    const mine = await request.get('/notification').set('Authorization', buyer.auth);
    expect(mine.body).toMatchObject({ unread: 1, total: 1 });
    expect(mine.body.items[0].link).toMatch(/^\/order-tracking\//);

    await request.post('/notification/read').set('Authorization', buyer.auth).send({});
    expect((await request.get('/notification').set('Authorization', buyer.auth)).body.unread).toBe(0);
    // Marking your own read does not touch anyone else's.
    expect((await request.get('/notification').set('Authorization', seller.auth)).body.unread).toBeGreaterThan(0);
  });

  it('tell the people who saved a book when it goes on a deal', async () => {
    const { buyer, seller } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3, price: 500 });
    await request.post(`/wishlist/add/${String(book._id)}`).set('Authorization', buyer.auth);

    await request.put(`/book/discount/${String(book._id)}`).set('Authorization', seller.auth).send({ type: 'percent', value: 20 });

    const [deal] = await Notification.find({ recipient: BUYER, type: 'deal' }).lean();
    expect(deal?.title).toContain('20% off');
  });
});

// ------------------------------------------------------------------ returns
describe('returning a whole order', () => {
  it('asks for every book in it at once, under one description', async () => {
    const { buyer, admin } = await people();
    const a = await createBook({ sellerEmail: SELLER, stock: 3, title: 'One' });
    const b = await createBook({ sellerEmail: SELLER, stock: 3, title: 'Two' });
    const { body } = await checkout(buyer.auth, [
      { bookId: a._id, quantity: 1 },
      { bookId: b._id, quantity: 1 },
    ]);
    await request.patch(`/order/status/${String(body.orderNumber)}`).set('Authorization', admin.auth).send({ status: 'Delivered' });
    const lines = await Order.find({ orderNumber: body.orderNumber }).lean();

    const res = await request
      .post('/return')
      .set('Authorization', buyer.auth)
      .field('orderId', String(lines[0]._id))
      .field('orderId', String(lines[1]._id))
      .field('defectDescription', 'Both arrived water-damaged.')
      .field('refundBkash', '01710000002')
      .attach('images', PNG_PIXEL, { filename: 'damage.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.returnIds).toHaveLength(2);
    expect(await notificationsOf(SELLER)).toContain('return-requested');
  });
});

// --------------------------------------------------------------------- shop
describe("a seller's shop", () => {
  it('shows who they are and how the shop is doing', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3 });
    await createBook({ sellerEmail: SELLER, stock: 0, isbn: '0000000000' });
    await checkout(buyer.auth, [{ bookId: book._id, quantity: 2 }]);

    const res = await request.get('/user/shop/bookshop');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ username: 'bookshop', books: 2, inStock: 1, sold: 2 });
    // The books come from the catalogue.
    const books = await request.get('/filter/booklist?seller=bookshop');
    expect(books.body.total).toBe(2);
  });

  it('is not there for an account that sells nothing', async () => {
    await people();
    expect((await request.get('/user/shop/reader')).status).toBe(404);
    expect((await request.get('/user/shop/nobody-at-all')).status).toBe(404);
  });
});

// ------------------------------------------------------------ admin lists
describe("the administrator's lists", () => {
  it('filter books by stock, and sort them', async () => {
    const { admin } = await people();
    await createBook({ title: 'Plenty', stock: 9, price: 100 });
    await createBook({ title: 'Last one', stock: 1, price: 300 });
    await createBook({ title: 'Gone', stock: 0, price: 200 });
    const titles = async (query: string) =>
      (await request.get(`/book/admin?${query}`).set('Authorization', admin.auth)).body.items.map((b: { title: string }) => b.title);

    expect(await titles('stock=out')).toEqual(['Gone']);
    expect(await titles('stock=low')).toEqual(['Last one']);
    expect(await titles('sort=priceHigh')).toEqual(['Last one', 'Gone', 'Plenty']);
  });

  it('filter users to sellers or buyers', async () => {
    const { admin } = await people();
    const names = async (kind: string) =>
      (await request.get(`/user?kind=${kind}`).set('Authorization', admin.auth)).body.items.map((u: { username: string }) => u.username);

    expect(await names('sellers')).toEqual(['bookshop']);
    expect(await names('buyers')).toEqual(['reader']);
  });

  it('filter orders by status', async () => {
    const { buyer, admin } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    const first = (await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }])).body.orderNumber as string;
    await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);
    await request.post(`/order/${first}/cancel`).set('Authorization', buyer.auth).send({});

    const res = await request.get('/order/admin/all?status=Cancelled').set('Authorization', admin.auth);

    expect(res.body.total).toBe(1);
    expect(res.body.items[0].orderNumber).toBe(first);
  });

  it('list every review, and filter them by stars', async () => {
    const { buyer, admin } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);
    await request.post(`/review/${String(book._id)}`).set('Authorization', buyer.auth).send({ rating: 4, body: 'Good read' });

    const all = await request.get('/review/all').set('Authorization', admin.auth);
    expect(all.body.total).toBe(1);
    expect(all.body.items[0]).toMatchObject({ rating: 4, bookTitle: book.title });
    expect((await request.get('/review/all?rating=5').set('Authorization', admin.auth)).body.total).toBe(0);
    expect((await request.get('/review/all').set('Authorization', buyer.auth)).status).toBe(403);
    // And the seller heard about it.
    expect(await notificationsOf(SELLER)).toContain('review');
    const note = await Notification.findOne({ recipient: SELLER, type: 'review' }).lean();
    expect(note?.title).toBe(`New ★★★★ review of "${book.title}"`);
  });

  it('show sales still inside the return window as upcoming payouts', async () => {
    const { buyer, admin } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5, price: 400 });
    const { body } = await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);
    await request.patch(`/order/status/${String(body.orderNumber)}`).set('Authorization', admin.auth).send({ status: 'Delivered' });

    const due = await request.get('/order/admin/payouts?state=due').set('Authorization', admin.auth);
    const upcoming = await request.get('/order/admin/payouts?state=upcoming').set('Authorization', admin.auth);

    expect(due.body.total).toBe(0);
    expect(upcoming.body.total).toBe(1);
    expect(upcoming.body.items[0]).toMatchObject({ orderNumber: body.orderNumber, booksTotal: 400 });
    expect(upcoming.body.items[0].payableFrom).toEqual(expect.any(String));
  });
});

// --------------------------------------------------------------------- chat
describe('sending a chat picture', () => {
  it('answers with the address of the picture, as the thread does, not its bytes', async () => {
    const { buyer } = await people();

    const res = await request
      .post('/chat/message')
      .set('Authorization', buyer.auth)
      .field('receiver', SELLER)
      .attach('image', PNG_PIXEL, { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.image).toMatch(/^\/api\/chat\/messages\/[a-f0-9]{24}\/image$/);
  });
});
