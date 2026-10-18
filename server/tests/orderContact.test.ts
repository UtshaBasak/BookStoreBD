/**
 * The e-mail given at checkout is where that order's e-mails go, and placing
 * an order takes only what was ordered out of the cart.
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
import Order from '../models/Order.model.js';

const { sendMail } = vi.hoisted(() => {
  process.env.SMTP_USER = 'tests@example.com';
  process.env.SMTP_PASS = 'test-password';
  return { sendMail: vi.fn() };
});
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(async () => {
  await clearDatabase();
  sendMail.mockClear();
});

const BUYER = 'buyer@test.com';
const SELLER = 'seller@test.com';

const outbox = async () => {
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await shopMailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string });
};

const checkout = (auth: string, bookIds: unknown[], extra: Record<string, unknown> = {}) =>
  request
    .post('/order/decrease-stock')
    .set('Authorization', auth)
    .send({ ...CHECKOUT, items: bookIds.map((bookId) => ({ bookId: String(bookId), quantity: 1 })), ...extra });

describe('the e-mail given at checkout', () => {
  it('is kept on the order, and the confirmation goes there', async () => {
    const buyer = await createUserWithToken({ email: BUYER, bkashMerchant: null });
    await createUserWithToken({ email: SELLER });
    const book = await createBook({ sellerEmail: SELLER, stock: 3 });

    const res = await checkout(buyer.auth, [book._id], { contactEmail: 'gift@test.com' });

    expect(res.status).toBe(200);
    expect((await Order.findOne({ orderNumber: res.body.orderNumber }).lean())?.contactEmail).toBe('gift@test.com');
    const toBuyer = (await outbox()).filter((mail) => /confirmed/i.test(mail.subject) && mail.to !== SELLER);
    expect(toBuyer.map((mail) => mail.to)).toEqual(['gift@test.com']);
  });

  it("is the account's own when none is given", async () => {
    const buyer = await createUserWithToken({ email: BUYER, bkashMerchant: null });
    const book = await createBook({ sellerEmail: SELLER, stock: 3 });

    const res = await checkout(buyer.auth, [book._id]);

    expect((await Order.findOne({ orderNumber: res.body.orderNumber }).lean())?.contactEmail).toBe(BUYER);
  });

  it('is refused when it is not an e-mail address', async () => {
    const buyer = await createUserWithToken({ email: BUYER, bkashMerchant: null });
    const book = await createBook({ sellerEmail: SELLER, stock: 3 });

    expect((await checkout(buyer.auth, [book._id], { contactEmail: 'not-an-address' })).status).toBe(400);
    expect((await AddBook.findById(book._id).lean())?.stock).toBe(3);
  });
});

describe('the cart after an order', () => {
  it('loses what was ordered and keeps a book that was left out', async () => {
    const buyer = await createUserWithToken({ email: BUYER, bkashMerchant: null });
    const ordered = await createBook({ sellerEmail: SELLER, stock: 3, title: 'Ordered' });
    const soldOut = await createBook({ sellerEmail: SELLER, stock: 1, title: 'Sold out' });
    await request.post(`/cart/add/${String(ordered._id)}`).set('Authorization', buyer.auth);
    await request.post(`/cart/add/${String(soldOut._id)}`).set('Authorization', buyer.auth);
    await AddBook.updateOne({ _id: soldOut._id }, { $set: { stock: 0 } });

    const res = await checkout(buyer.auth, [ordered._id, soldOut._id]);

    expect(res.status).toBe(200);
    const left = await Cart.find({ user: buyer.user._id }).lean();
    expect(left.map((entry) => String(entry.book))).toEqual([String(soldOut._id)]);
  });
});
