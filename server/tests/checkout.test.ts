/**
 * Placing an order and what happens to it after: the checks a checkout cannot
 * get past, a checkout sent twice, cancelling twice, an order from more than
 * one seller, and what each person is shown of it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createUserWithToken, CHECKOUT } from './helpers/factories.js';
import AddBook from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import Notification from '../models/Notification.model.js';
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
const OTHER_SELLER = 'other-seller@test.com';
const ADMIN = 'admin@test.com';

const people = async () => ({
  buyer: await createUserWithToken({ email: BUYER, username: 'reader', bkashMerchant: null }),
  seller: await createUserWithToken({ email: SELLER, username: 'bookshop' }),
  other: await createUserWithToken({ email: OTHER_SELLER, username: 'secondshop' }),
  admin: await createUserWithToken({ email: ADMIN, username: 'admin', role: 'admin' }),
});

const checkout = (auth: string, items: { bookId: unknown; quantity: number }[], extra: Record<string, unknown> = {}) =>
  request
    .post('/order/decrease-stock')
    .set('Authorization', auth)
    .send({ ...CHECKOUT, items: items.map((item) => ({ ...item, bookId: String(item.bookId) })), ...extra });

const stockOf = async (id: unknown) => (await AddBook.findById(id).lean())?.stock;
const linesOf = (orderNumber: string) => Order.find({ orderNumber }).lean();
const noticesOf = (email: string, type: string) => Notification.countDocuments({ recipient: email, type });

// --------------------------------------------------------------- refusals
describe('a checkout with nothing to order', () => {
  it('is refused when every book has been taken down, with no order and no notices', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3 });
    await AddBook.deleteOne({ _id: book._id });

    const res = await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);

    expect(res.status).toBe(409);
    expect(res.body.orderNumber).toBeUndefined();
    expect(res.body.unavailable).toEqual([expect.objectContaining({ bookId: String(book._id), reason: 'removed' })]);
    expect(await Order.countDocuments({})).toBe(0);
    expect(await noticesOf(BUYER, 'order-placed')).toBe(0);
    expect(await noticesOf(ADMIN, 'order-received')).toBe(0);
  });

  it('goes ahead with what is left, naming a book that was taken down', async () => {
    const { buyer } = await people();
    const kept = await createBook({ sellerEmail: SELLER, stock: 3, title: 'Kept' });
    const gone = await createBook({ sellerEmail: SELLER, stock: 3, title: 'Gone' });
    await AddBook.deleteOne({ _id: gone._id });

    const res = await checkout(buyer.auth, [
      { bookId: kept._id, quantity: 1 },
      { bookId: gone._id, quantity: 1 },
    ]);

    expect(res.status).toBe(200);
    expect(res.body.unavailable).toEqual([expect.objectContaining({ bookId: String(gone._id), reason: 'removed' })]);
    expect((await linesOf(res.body.orderNumber)).map((line) => line.title)).toEqual(['Kept']);
  });
});

describe('the same book twice in one checkout', () => {
  it('is one line, its copies added together, and takes the stock once', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });

    const res = await checkout(buyer.auth, [
      { bookId: book._id, quantity: 1 },
      { bookId: book._id, quantity: 2 },
    ]);

    expect(res.status).toBe(200);
    const lines = await linesOf(res.body.orderNumber);
    expect(lines).toHaveLength(1);
    expect(lines[0]?.quantity).toBe(3);
    expect(await stockOf(book._id)).toBe(2);
  });
});

describe('books that cannot be bought', () => {
  it("refuses a seller's own book, in the cart and at checkout", async () => {
    const { seller } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });

    const cart = await request.post(`/cart/add/${String(book._id)}`).set('Authorization', seller.auth);
    expect(cart.status).toBe(409);
    expect(cart.body.code).toBe('own-listing');
    expect(await Cart.countDocuments({})).toBe(0);

    const res = await checkout(seller.auth, [{ bookId: book._id, quantity: 1 }]);
    expect(res.status).toBe(409);
    expect(res.body.unavailable[0]).toMatchObject({ reason: 'own-listing' });
    expect(await stockOf(book._id)).toBe(5);
  });

  it('refuses a book whose seller has no bKash number to be paid to', async () => {
    const { buyer } = await people();
    await createUserWithToken({ email: 'unpaid@test.com', bkashMerchant: null });
    const book = await createBook({ sellerEmail: 'unpaid@test.com', stock: 5 });

    const res = await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);

    expect(res.status).toBe(409);
    expect(res.body.unavailable[0]).toMatchObject({ reason: 'seller-unavailable' });
    expect(await stockOf(book._id)).toBe(5);
  });
});

describe('the delivery details', () => {
  const tryWith = async (details: Record<string, unknown>) => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    return checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }], details);
  };

  it.each([
    ['no name', { contactName: '' }],
    ['no address', { deliveryAddress: '' }],
    ['a phone number that is not a Bangladeshi mobile', { contactPhone: '12345' }],
    ['a division that is not on the list', { deliveryDivision: 'Atlantis' }],
    ['a district outside its division', { deliveryDivision: 'Sylhet', deliveryDistrict: 'Dhaka' }],
    ['a payment method the shop does not offer', { paymentMethod: 'Bitcoin' }],
  ])('are refused with %s, before any stock is taken', async (_what, details) => {
    const res = await tryWith(details);

    expect(res.status).toBe(400);
    expect(await Order.countDocuments({})).toBe(0);
    expect((await AddBook.findOne({}).lean())?.stock).toBe(5);
  });

  it('keep a phone number written the long way in the eleven-digit form', async () => {
    const res = await tryWith({ contactPhone: '+880 1712-345678' });

    expect(res.status).toBe(200);
    expect((await linesOf(res.body.orderNumber))[0]).toMatchObject({
      contactPhone: '01712345678',
      paymentMethod: 'Cash on Delivery',
    });
  });
});

describe('an order that cannot be written', () => {
  it('puts back every copy it took', async () => {
    const { buyer } = await people();
    const one = await createBook({ sellerEmail: SELLER, stock: 5 });
    const two = await createBook({ sellerEmail: SELLER, stock: 5 });
    const failing = vi.spyOn(Order, 'insertMany').mockRejectedValueOnce(new Error('disk full'));

    const res = await checkout(buyer.auth, [
      { bookId: one._id, quantity: 2 },
      { bookId: two._id, quantity: 1 },
    ]);
    failing.mockRestore();

    expect(res.status).toBe(500);
    expect(await stockOf(one._id)).toBe(5);
    expect(await stockOf(two._id)).toBe(5);
    expect(await Order.countDocuments({})).toBe(0);
    expect(await noticesOf(BUYER, 'order-placed')).toBe(0);
  });
});

// ------------------------------------------------------------- sent twice
describe('a checkout sent twice', () => {
  it('with the same checkout id gives back the first order rather than a second', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    const items = [{ bookId: book._id, quantity: 2 }];

    const first = await checkout(buyer.auth, items, { checkoutId: 'checkout-0001' });
    const again = await checkout(buyer.auth, items, { checkoutId: 'checkout-0001' });

    expect(first.status).toBe(200);
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ orderNumber: first.body.orderNumber, replayed: true });
    expect(await Order.countDocuments({})).toBe(1);
    expect(await stockOf(book._id)).toBe(3);
    expect(await noticesOf(BUYER, 'order-placed')).toBe(1);
  });

  it('one straight after another both go through: the first is finished before it answers', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 9 });

    for (let n = 0; n < 4; n += 1) {
      expect((await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }])).status).toBe(200);
    }
    expect(await stockOf(book._id)).toBe(5);
  });

  it('at the same moment places one order', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    const items = [{ bookId: book._id, quantity: 1 }];

    const results = await Promise.all([
      checkout(buyer.auth, items, { checkoutId: 'checkout-0002' }),
      checkout(buyer.auth, items, { checkoutId: 'checkout-0002' }),
    ]);

    // One places it; the other either waits its turn and gets the same
    // order back, or is told the first is still being placed.
    expect(results.map((res) => res.status).sort()).toEqual(expect.arrayContaining([200]));
    for (const res of results) {
      if (res.status === 409) expect(res.body.code).toBe('checkout-in-progress');
    }
    expect(new Set(await Order.distinct('orderNumber')).size).toBe(1);
    expect(await stockOf(book._id)).toBe(4);
  });

  it('cannot use the first-order code twice by checking out twice at once', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5, price: 300 });
    const items = [{ bookId: book._id, quantity: 1 }];

    await Promise.all([
      checkout(buyer.auth, items, { promo: 'BookStoreBD', checkoutId: 'checkout-a001' }),
      checkout(buyer.auth, items, { promo: 'BookStoreBD', checkoutId: 'checkout-b001' }),
    ]);

    const discounted = await Order.countDocuments({ promoApplied: true });
    expect(discounted).toBe(1);
  });
});

// ------------------------------------------------------------- cancelling
describe('cancelling', () => {
  it('twice at once puts the stock back once and tells people once', async () => {
    const { buyer, admin } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    const { orderNumber } = (await checkout(buyer.auth, [{ bookId: book._id, quantity: 2 }])).body as { orderNumber: string };
    const cancel = (auth: string) => request.post(`/order/${orderNumber}/cancel`).set('Authorization', auth).send({});

    const results = await Promise.all([cancel(buyer.auth), cancel(admin.auth), cancel(buyer.auth)]);

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(await stockOf(book._id)).toBe(5);
    expect(await noticesOf(SELLER, 'order-cancelled')).toBe(1);
  });

  it('again after it is cancelled is refused and changes nothing', async () => {
    const { buyer } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    const { orderNumber } = (await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }])).body as { orderNumber: string };

    await request.post(`/order/${orderNumber}/cancel`).set('Authorization', buyer.auth).send({});
    const again = await request.post(`/order/${orderNumber}/cancel`).set('Authorization', buyer.auth).send({});

    expect(again.status).toBe(409);
    expect(await stockOf(book._id)).toBe(5);
  });
});

// --------------------------------------------- an order from two sellers
describe('an order from two sellers', () => {
  const place = async () => {
    const who = await people();
    const mine = await createBook({ sellerEmail: SELLER, stock: 5, title: 'Mine', price: 300 });
    const theirs = await createBook({ sellerEmail: OTHER_SELLER, stock: 5, title: 'Theirs', price: 500 });
    const res = await checkout(who.buyer.auth, [
      { bookId: mine._id, quantity: 1 },
      { bookId: theirs._id, quantity: 1 },
    ]);
    const orderNumber = res.body.orderNumber as string;
    const detail = async (auth: string) => (await request.get(`/order/${orderNumber}`).set('Authorization', auth)).body;
    const move = (auth: string, status: string) =>
      request.patch(`/order/status/${orderNumber}`).set('Authorization', auth).send({ status });
    return { ...who, orderNumber, detail, move };
  };

  it('offers the buyer no Cancel once one seller has started, and the list agrees', async () => {
    const { buyer, seller, detail, move } = await place();
    await move(seller.auth, 'Processing');

    const order = await detail(buyer.auth);
    expect(order).toMatchObject({ canCancel: false, status: 'Order Confirmed' });

    const list = await request.get('/order/buyer').set('Authorization', buyer.auth);
    expect(list.body.items.every((line: { canCancel: boolean; orderStatus: string }) => !line.canCancel && line.orderStatus === 'Order Confirmed')).toBe(true);
  });

  it("shows a seller their own books and nothing of the other seller's", async () => {
    const { seller, detail } = await place();

    const order = await detail(seller.auth);

    expect(order.books.map((line: { title: string }) => line.title)).toEqual(['Mine']);
    expect(JSON.stringify(order)).not.toContain(OTHER_SELLER);
    expect(order.booksTotal).toBe(300);
  });

  it('caps the first-order discount at the books left when a seller cancels theirs', async () => {
    const who = await people();
    const cheap = await createBook({ sellerEmail: SELLER, stock: 5, price: 30 });
    const dear = await createBook({ sellerEmail: OTHER_SELLER, stock: 5, price: 300 });
    const { orderNumber } = (
      await checkout(who.buyer.auth, [
        { bookId: cheap._id, quantity: 1 },
        { bookId: dear._id, quantity: 1 },
      ], { promo: 'BookStoreBD' })
    ).body as { orderNumber: string };

    await request.post(`/order/${orderNumber}/cancel`).set('Authorization', who.other.auth).send({});
    const order = (await request.get(`/order/${orderNumber}`).set('Authorization', who.buyer.auth)).body;

    expect(order).toMatchObject({ booksTotal: 30, discount: 30, shippingCost: 70, totalCost: 70 });
  });

  it('keeps free delivery when a seller cancels part of it', async () => {
    const who = await people();
    const one = await createBook({ sellerEmail: SELLER, stock: 5, price: 600 });
    const two = await createBook({ sellerEmail: OTHER_SELLER, stock: 5, price: 600 });
    const { orderNumber } = (
      await checkout(who.buyer.auth, [
        { bookId: one._id, quantity: 1 },
        { bookId: two._id, quantity: 1 },
      ], { promo: 'FreeDelivery' })
    ).body as { orderNumber: string };

    await request.post(`/order/${orderNumber}/cancel`).set('Authorization', who.other.auth).send({});
    const order = (await request.get(`/order/${orderNumber}`).set('Authorization', who.buyer.auth)).body;

    expect(order).toMatchObject({ booksTotal: 600, shippingCost: 0, totalCost: 600 });
  });

  it("labels a seller's cancelled line as cancelled, not awaiting delivery", async () => {
    const { seller, orderNumber } = await place();
    await request.post(`/order/${orderNumber}/cancel`).set('Authorization', seller.auth).send({});

    const list = await request.get('/order/seller').set('Authorization', seller.auth);

    expect(list.body.items[0]).toMatchObject({ status: 'Cancelled', payoutState: 'cancelled' });
  });
});

// ----------------------------------------------------- the buyer's list
describe("the buyer's order list", () => {
  const twoBookOrder = async () => {
    const who = await people();
    const one = await createBook({ sellerEmail: SELLER, stock: 5, title: 'Deyal', price: 300 });
    const two = await createBook({ sellerEmail: OTHER_SELLER, stock: 5, title: 'Sapiens', price: 500 });
    const { orderNumber } = (
      await checkout(who.buyer.auth, [
        { bookId: one._id, quantity: 1 },
        { bookId: two._id, quantity: 2 },
      ])
    ).body as { orderNumber: string };
    const list = async (query = '') => (await request.get(`/order/buyer${query}`).set('Authorization', who.buyer.auth)).body;
    return { ...who, orderNumber, list };
  };

  it('totals the whole order when a search matches one of its books', async () => {
    const { list } = await twoBookOrder();

    const res = await list('?search=Deyal');

    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ title: 'Deyal', booksTotal: 1300, shippingCost: 70, totalCost: 1370 });
  });

  it('totals the whole order when listing its cancelled books', async () => {
    const { other, orderNumber, list } = await twoBookOrder();
    await request.post(`/order/${orderNumber}/cancel`).set('Authorization', other.auth).send({});

    const res = await list('?status=Cancelled');

    expect(res.items).toHaveLength(1);
    expect(res.items[0]).toMatchObject({ title: 'Sapiens', booksTotal: 300, totalCost: 370, orderStatus: 'Order Confirmed' });
  });

  it('sorts by what each order comes to', async () => {
    const who = await people();
    const cheap = await createBook({ sellerEmail: SELLER, stock: 9, price: 100 });
    const dear = await createBook({ sellerEmail: OTHER_SELLER, stock: 9, price: 900 });
    const small = (await checkout(who.buyer.auth, [{ bookId: cheap._id, quantity: 3 }])).body.orderNumber as string;
    const large = (await checkout(who.buyer.auth, [{ bookId: dear._id, quantity: 1 }])).body.orderNumber as string;
    const mixed = (
      await checkout(who.buyer.auth, [
        { bookId: cheap._id, quantity: 1 },
        { bookId: dear._id, quantity: 1 },
      ])
    ).body.orderNumber as string;
    // A cancelled book no longer counts towards its order's total.
    await request.post(`/order/${mixed}/cancel`).set('Authorization', who.other.auth).send({});

    const res = await request.get('/order/buyer?sort=totalHigh').set('Authorization', who.buyer.auth);
    const order = [...new Set(res.body.items.map((line: { orderNumber: string }) => line.orderNumber))];

    expect(order).toEqual([large, small, mixed]);
  });
});

// ------------------------------------------------------ moving the status
describe('moving an order along', () => {
  const place = async () => {
    const who = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    const { orderNumber } = (await checkout(who.buyer.auth, [{ bookId: book._id, quantity: 1 }])).body as { orderNumber: string };
    const move = (auth: string, status: string) =>
      request.patch(`/order/status/${orderNumber}`).set('Authorization', auth).send({ status });
    const detail = async (auth: string) => (await request.get(`/order/${orderNumber}`).set('Authorization', auth)).body;
    return { ...who, orderNumber, move, detail };
  };

  it('is forward only for a seller', async () => {
    const { seller, move, detail } = await place();
    await move(seller.auth, 'Shipped');

    expect((await move(seller.auth, 'Processing')).status).toBe(403);
    expect((await detail(seller.auth)).statusOptions).toEqual(['Shipped']);
  });

  it('lets the shop take a delivery back while nothing has been paid or returned, keeping its date', async () => {
    const { admin, orderNumber, move } = await place();
    await move(admin.auth, 'Delivered');
    const deliveredAt = (await Order.findOne({ orderNumber }).lean())?.deliveredAt;

    expect((await move(admin.auth, 'Out for Delivery')).status).toBe(200);
    await move(admin.auth, 'Delivered');

    expect((await Order.findOne({ orderNumber }).lean())?.deliveredAt).toEqual(deliveredAt);
  });

  it('keeps a delivery once the seller has been paid for it', async () => {
    const { admin, orderNumber, move, detail } = await place();
    await move(admin.auth, 'Delivered');
    await Order.updateMany({ orderNumber }, { $set: { sellerPaidAt: new Date() } });

    expect((await move(admin.auth, 'Out for Delivery')).status).toBe(403);
    expect((await detail(admin.auth)).statusOptions).toEqual(['Delivered']);
  });

  it('keeps a delivery once the buyer has asked to return it', async () => {
    const { admin, buyer, orderNumber, move } = await place();
    await move(admin.auth, 'Delivered');
    const line = await Order.findOne({ orderNumber }).lean();
    await ReturnRequest.create({
      orderId: line?._id,
      bookId: line?.bookId,
      userEmail: buyer.user.email,
      sellerEmail: SELLER,
      bookTitle: 'The C++ Programming Language',
      defectDescription: 'Pages missing',
      status: 'pending',
    });

    expect((await move(admin.auth, 'Shipped')).status).toBe(403);
  });
});
