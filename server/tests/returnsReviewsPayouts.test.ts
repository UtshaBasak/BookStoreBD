/**
 * After delivery: a return request that counts only once it is approved and
 * is decided once, reviews and ratings that need a delivered book, and a
 * payout recorded once however often it is sent.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createUserWithToken, CHECKOUT, PNG_PIXEL } from './helpers/factories.js';
import AuditLog from '../models/AuditLog.model.js';
import Notification from '../models/Notification.model.js';
import Order from '../models/Order.model.js';
import Review from '../models/Review.model.js';
import SellerReview from '../models/SellerReview.model.js';
import User from '../models/user.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import { orderDeliveredBuyerEmail } from '../utils/shopMail.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const BUYER = 'buyer@test.com';
const SELLER = 'seller@test.com';
const DAY = 24 * 60 * 60 * 1000;

const people = async () => ({
  buyer: await createUserWithToken({ email: BUYER, username: 'reader', bkashMerchant: null }),
  seller: await createUserWithToken({ email: SELLER, username: 'bookshop' }),
  admin: await createUserWithToken({ email: 'admin@test.com', username: 'admin', role: 'admin' }),
});

/** An order of one book, placed through checkout and, unless told otherwise, delivered. */
const order = async (buyerAuth: string, { delivered = true, daysAgo = 1 } = {}) => {
  const book = await createBook({ sellerEmail: SELLER, stock: 5 });
  const res = await request
    .post('/order/decrease-stock')
    .set('Authorization', buyerAuth)
    .send({ ...CHECKOUT, items: [{ bookId: String(book._id), quantity: 1 }] });
  const orderNumber = res.body.orderNumber as string;
  if (delivered) {
    await Order.updateMany({ orderNumber }, { $set: { status: 'Delivered', deliveredAt: new Date(Date.now() - daysAgo * DAY) } });
  }
  const line = await Order.findOne({ orderNumber }).lean();
  return { book, orderNumber, line: line! };
};

const askToReturn = (auth: string, lineId: unknown) =>
  request
    .post('/return')
    .set('Authorization', auth)
    .field('orderId', String(lineId))
    .field('refundBkash', '01712345678')
    .field('defectDescription', 'Pages loose at the spine')
    .attach('images', PNG_PIXEL, 'damage.png');

const decide = (auth: string, id: unknown, status: string) =>
  request.patch(`/return/requests/${String(id)}`).set('Authorization', auth).send({ status });

// ---------------------------------------------------------------- returns
describe('a return request', () => {
  it('leaves the sale counted until it is approved', async () => {
    const { buyer, admin } = await people();
    const { line } = await order(buyer.auth);

    expect((await askToReturn(buyer.auth, line._id)).status).toBe(200);
    expect((await Order.findById(line._id).lean())?.isReturned).toBe(0);

    const request_ = await ReturnRequest.findOne({ orderId: line._id }).lean();
    expect((await decide(admin.auth, request_?._id, 'approved')).status).toBe(200);
    expect((await Order.findById(line._id).lean())?.isReturned).toBe(1);
  });

  it('turned down leaves the sale as it was', async () => {
    const { buyer, admin } = await people();
    const { line } = await order(buyer.auth);
    await askToReturn(buyer.auth, line._id);
    const pending = await ReturnRequest.findOne({ orderId: line._id }).lean();

    await decide(admin.auth, pending?._id, 'rejected');

    expect((await Order.findById(line._id).lean())?.isReturned).toBe(0);
  });

  it('is decided once: a second decision is refused and sends nothing', async () => {
    const { buyer, admin } = await people();
    const { line } = await order(buyer.auth);
    await askToReturn(buyer.auth, line._id);
    const pending = await ReturnRequest.findOne({ orderId: line._id }).lean();

    await decide(admin.auth, pending?._id, 'rejected');
    const again = await decide(admin.auth, pending?._id, 'approved');

    expect(again.status).toBe(409);
    expect((await ReturnRequest.findById(pending?._id).lean())).toMatchObject({ status: 'rejected', decidedBy: 'admin@test.com' });
    expect(await Notification.countDocuments({ recipient: BUYER, type: 'return-decided' })).toBe(1);
    expect((await Order.findById(line._id).lean())?.isReturned).toBe(0);
  });

  it('decided twice at once is decided once', async () => {
    const { buyer, admin } = await people();
    const { line } = await order(buyer.auth);
    await askToReturn(buyer.auth, line._id);
    const pending = await ReturnRequest.findOne({ orderId: line._id }).lean();

    const results = await Promise.all([
      decide(admin.auth, pending?._id, 'approved'),
      decide(admin.auth, pending?._id, 'rejected'),
    ]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await Notification.countDocuments({ recipient: SELLER, type: 'return-decided' })).toBe(1);
  });

  it('cannot be put back to pending', async () => {
    const { buyer, admin } = await people();
    const { line } = await order(buyer.auth);
    await askToReturn(buyer.auth, line._id);
    const pending = await ReturnRequest.findOne({ orderId: line._id }).lean();

    expect((await decide(admin.auth, pending?._id, 'pending')).status).toBe(400);
  });

  it('sent twice at once makes one request, and the second is told so', async () => {
    const { buyer } = await people();
    const { line } = await order(buyer.auth);

    const results = await Promise.all([askToReturn(buyer.auth, line._id), askToReturn(buyer.auth, line._id)]);

    expect(results.map((res) => res.status).sort()).toEqual([200, 409]);
    expect(await ReturnRequest.countDocuments({ orderId: line._id })).toBe(1);
  });

  it('is refused for a sale already paid out', async () => {
    const { buyer } = await people();
    const { line } = await order(buyer.auth);
    await Order.updateOne({ _id: line._id }, { $set: { sellerPaidAt: new Date() } });

    expect((await askToReturn(buyer.auth, line._id)).status).toBe(409);
  });

  it("shows on the order's books, so a seller's slip can leave it out", async () => {
    const { buyer, seller, admin } = await people();
    const { line, orderNumber } = await order(buyer.auth);
    await askToReturn(buyer.auth, line._id);
    const pending = await ReturnRequest.findOne({ orderId: line._id }).lean();
    await decide(admin.auth, pending?._id, 'approved');

    const detail = await request.get(`/order/${orderNumber}`).set('Authorization', seller.auth);

    expect(detail.body.books[0].returnStatus).toBe('approved');
  });
});

// ---------------------------------------------------------------- reviews
describe('reviews and ratings', () => {
  const review = (auth: string, bookId: unknown) =>
    request.post(`/review/${String(bookId)}`).set('Authorization', auth).send({ rating: 5, body: 'Lovely copy' });
  const rate = async (auth: string) => {
    const seller = await User.findOne({ email: SELLER }).lean();
    return request.post(`/seller-review/${String(seller?._id)}`).set('Authorization', auth).send({ rating: 4, body: 'Well packed' });
  };

  it('wait for the book to be delivered, and say so', async () => {
    const { buyer } = await people();
    const { book } = await order(buyer.auth, { delivered: false });

    const res = await review(buyer.auth, book._id);
    const summary = await request.get(`/review/${String(book._id)}`).set('Authorization', buyer.auth);

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/once it has been delivered/);
    expect(summary.body).toMatchObject({ canReview: false, reason: 'not-delivered' });
  });

  it('are open once it has been delivered', async () => {
    const { buyer } = await people();
    const { book } = await order(buyer.auth);

    expect((await review(buyer.auth, book._id)).status).toBe(200);
    expect((await rate(buyer.auth)).status).toBe(200);
  });

  it('go when the only order behind them is cancelled', async () => {
    const { buyer, admin } = await people();
    const { book, orderNumber } = await order(buyer.auth);
    await review(buyer.auth, book._id);
    await rate(buyer.auth);

    // The shop takes the delivery back (nothing paid, no return), then cancels.
    await request.patch(`/order/status/${orderNumber}`).set('Authorization', admin.auth).send({ status: 'Out for Delivery' });
    await request.post(`/order/${orderNumber}/cancel`).set('Authorization', admin.auth).send({});

    expect(await Review.countDocuments({ reviewerEmail: BUYER })).toBe(0);
    expect(await SellerReview.countDocuments({ reviewerEmail: BUYER })).toBe(0);
    const summary = await request.get(`/review/${String(book._id)}`);
    expect(summary.body).toMatchObject({ count: 0, average: 0 });
  });
});

// ---------------------------------------------------------------- payouts
describe('recording a payout', () => {
  it('twice at once pays once, tells the seller once, and audits once', async () => {
    const { buyer, admin } = await people();
    const { orderNumber } = await order(buyer.auth, { daysAgo: 10 });
    const pay = () =>
      request
        .post('/order/admin/payouts/paid')
        .set('Authorization', admin.auth)
        .send({ orderNumber, sellerEmail: SELLER, reference: '8N7A2B3C4D' });

    const results = await Promise.all([pay(), pay(), pay()]);

    expect(results.filter((res) => res.status === 200)).toHaveLength(1);
    expect(await Notification.countDocuments({ recipient: SELLER, type: 'payout' })).toBe(1);
    expect(await AuditLog.countDocuments({ action: 'payout.paid' })).toBe(1);
  });
});

// --------------------------------------------------------------- e-mails
describe('the "delivered" e-mail', () => {
  beforeEach(() => {
    process.env.PUBLIC_SITE_URL = 'https://shop.example';
  });
  afterEach(() => {
    delete process.env.PUBLIC_SITE_URL;
  });

  it("sends one book's buyer to its review form", () => {
    const mail = orderDeliveredBuyerEmail({ orderNumber: 'ABC' }, [{ bookId: 'b1', title: 'Deyal', quantity: 1, price: 300 }])('en');

    expect(mail.text).toContain('/book/b1#reviews');
  });

  it('sends a buyer of several books to their orders, where each has a review link', () => {
    const mail = orderDeliveredBuyerEmail({ orderNumber: 'ABC' }, [
      { bookId: 'b1', title: 'Deyal', quantity: 1, price: 300 },
      { bookId: 'b2', title: 'Sapiens', quantity: 1, price: 500 },
    ])('en');

    expect(mail.text).toContain('/buyer/orders');
    expect(mail.text).not.toContain('/order-tracking/');
  });
});
