/**
 * Closing an account - by its owner or an administrator - without leaving
 * open orders, returns or payouts with nobody behind them; keeping a payout
 * number while it is needed; confirming changes on an account made through
 * Google; and moving an account to a new e-mail address.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createUserWithToken, CHECKOUT, PASSWORD } from './helpers/factories.js';
import AddBook from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import Chat from '../models/Chat.model.js';
import Notification from '../models/Notification.model.js';
import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Review from '../models/Review.model.js';
import SellerReview from '../models/SellerReview.model.js';
import User from '../models/user.model.js';

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

const outbox = async (): Promise<{ to: string; subject: string; text: string }[]> => {
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await shopMailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });
};

const lastCodeTo = async (to: string): Promise<string> => {
  const mail = (await outbox()).filter((sent) => sent.to === to).at(-1);
  const code = /\b(\d{6})\b/.exec(mail?.text ?? '')?.[1];
  if (!code) throw new Error(`no code was sent to ${to}`);
  return code;
};

const people = async () => ({
  buyer: await createUserWithToken({ email: BUYER, username: 'reader', bkashMerchant: null }),
  seller: await createUserWithToken({ email: SELLER, username: 'bookshop' }),
  admin: await createUserWithToken({ email: 'admin@test.com', username: 'admin', role: 'admin' }),
});

const placeOrder = async (buyerAuth: string, stock = 5) => {
  const book = await createBook({ sellerEmail: SELLER, stock });
  const res = await request
    .post('/order/decrease-stock')
    .set('Authorization', buyerAuth)
    .send({ ...CHECKOUT, items: [{ bookId: String(book._id), quantity: 1 }] });
  return { book, orderNumber: res.body.orderNumber as string };
};

const moveTo = (orderNumber: string, status: string, extra: Record<string, unknown> = {}) =>
  Order.updateMany({ orderNumber }, { $set: { status, ...extra } });

const closeOwn = (auth: string, body: Record<string, unknown> = { password: PASSWORD }) =>
  request.delete('/user/me').set('Authorization', auth).send(body);

// ------------------------------------------------------- closing an account
describe('closing your own account', () => {
  it('cancels an order not yet started, puts the stock back, and tells the seller', async () => {
    const { buyer } = await people();
    const { book, orderNumber } = await placeOrder(buyer.auth);

    const res = await closeOwn(buyer.auth);

    expect(res.status).toBe(200);
    expect(await User.exists({ email: BUYER })).toBeNull();
    const line = await Order.findOne({ orderNumber }).lean();
    expect(line).toMatchObject({ status: 'Cancelled', cancelReason: 'The buyer closed their account.', contactName: '' });
    expect((await AddBook.findById(book._id).lean())?.stock).toBe(5);
    expect(await Notification.countDocuments({ recipient: SELLER, type: 'order-cancelled' })).toBe(1);
  });

  it('waits while an order is on its way, and says so without changing anything', async () => {
    const { buyer } = await people();
    const { orderNumber } = await placeOrder(buyer.auth);
    await moveTo(orderNumber, 'Shipped');

    const res = await closeOwn(buyer.auth);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('account-has-open-business');
    expect(res.body.blockers[0]).toContain(orderNumber);
    expect(await User.exists({ email: BUYER })).not.toBeNull();
    expect(await Order.findOne({ orderNumber }).lean()).toMatchObject({ status: 'Shipped', contactName: CHECKOUT.contactName });
  });

  it("cancels a seller's books not yet shipped, and closes the shop", async () => {
    const { buyer, seller } = await people();
    const { orderNumber } = await placeOrder(buyer.auth);
    await moveTo(orderNumber, 'Processing');

    const res = await closeOwn(seller.auth);

    expect(res.status).toBe(200);
    expect((await Order.findOne({ orderNumber }).lean())?.status).toBe('Cancelled');
    expect(await AddBook.countDocuments({ sellerEmail: SELLER })).toBe(0);
    expect(await Notification.countDocuments({ recipient: BUYER, type: 'order-cancelled' })).toBe(1);
  });

  it('waits while a seller is still owed for a sale, and says from when', async () => {
    const { buyer, seller } = await people();
    const { orderNumber } = await placeOrder(buyer.auth);
    await moveTo(orderNumber, 'Delivered', { deliveredAt: new Date() });

    const res = await closeOwn(seller.auth);

    expect(res.status).toBe(409);
    expect(res.body.blockers[0]).toMatch(/We still owe you for order .* payable from/);
    expect(await AddBook.countDocuments({ sellerEmail: SELLER })).toBe(1);
  });

  it('waits while a return is being decided', async () => {
    const { buyer } = await people();
    const { orderNumber, book } = await placeOrder(buyer.auth);
    await moveTo(orderNumber, 'Delivered', { deliveredAt: new Date() });
    const line = await Order.findOne({ orderNumber }).lean();
    await ReturnRequest.create({
      orderId: line?._id,
      orderNumber,
      bookId: book._id,
      bookTitle: book.title,
      userEmail: BUYER,
      sellerEmail: SELLER,
      defectDescription: 'Pages missing',
    });

    const res = await closeOwn(buyer.auth);

    expect(res.status).toBe(409);
    expect(res.body.blockers.join(' ')).toMatch(/still being decided/);
  });
});

describe('an administrator deleting an account', () => {
  it('cleans up as closing it would: orders cancelled, listings, cart and ratings gone, details stripped', async () => {
    const { buyer, seller, admin } = await people();
    const { book, orderNumber } = await placeOrder(buyer.auth);
    await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth);
    await Chat.create({ sender: SELLER, receiver: BUYER, message: 'Thanks for the order' });

    const res = await request.delete(`/user/${String(seller.user._id)}`).set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(await User.exists({ email: SELLER })).toBeNull();
    expect(await AddBook.countDocuments({ sellerEmail: SELLER })).toBe(0);
    const line = await Order.findOne({ orderNumber }).lean();
    expect(line?.status).toBe('Cancelled');
    expect(line?.sellerEmail).not.toBe(SELLER);
    expect(await Chat.countDocuments({ sender: SELLER })).toBe(0);
    // The buyer's cart held the seller's book; the listing is gone, and so is the cart entry.
    expect(await Cart.countDocuments({ book: book._id })).toBe(0);
  });

  it('is refused while the member has an order on its way', async () => {
    const { buyer, admin } = await people();
    const { orderNumber } = await placeOrder(buyer.auth);
    await moveTo(orderNumber, 'Out for Delivery');

    const res = await request.delete(`/user/${String(buyer.user._id)}`).set('Authorization', admin.auth);

    expect(res.status).toBe(409);
    expect(res.body.blockers).toHaveLength(1);
    expect(await User.exists({ email: BUYER })).not.toBeNull();
  });
});

// ------------------------------------------------------- the payout number
describe('removing the bKash number', () => {
  const remove = (auth: string) =>
    request.put('/user/profile').set('Authorization', auth).field('bkashMerchant', '').field('currentPassword', PASSWORD);

  it('is refused while books are on sale', async () => {
    const { seller } = await people();
    await createBook({ sellerEmail: SELLER, stock: 2 });

    const res = await remove(seller.auth);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('payout-number-in-use');
    expect((await User.findOne({ email: SELLER }))?.bkashMerchant).toBeTruthy();
  });

  it('is refused while a sale is still to be paid out', async () => {
    const { buyer, seller } = await people();
    const { orderNumber, book } = await placeOrder(buyer.auth, 1);
    await AddBook.updateOne({ _id: book._id }, { $set: { stock: 0 } });
    await moveTo(orderNumber, 'Delivered', { deliveredAt: new Date() });

    expect((await remove(seller.auth)).status).toBe(409);
  });

  it('is allowed once nothing needs it', async () => {
    const { seller } = await people();
    await createBook({ sellerEmail: SELLER, stock: 0 });

    expect((await remove(seller.auth)).status).toBe(200);
    expect((await User.findOne({ email: SELLER }))?.bkashMerchant).toBeFalsy();
  });
});

// ------------------------------------------- an account made through Google
describe('an account made through Google', () => {
  const googleOnly = async () => {
    const member = await createUserWithToken({ email: 'gmail@test.com', username: 'googler' });
    await User.updateOne({ _id: member.user._id }, { $set: { passwordSet: false, twoFactor: true } });
    return member;
  };

  it('deletes itself with an e-mailed code, not a password it does not have', async () => {
    const member = await googleOnly();

    expect((await closeOwn(member.auth, { password: 'anything' })).status).toBe(403);

    const sent = await request.post('/user/me/confirm-code').set('Authorization', member.auth).send({ action: 'delete-account' });
    expect(sent.status).toBe(200);
    const code = await lastCodeTo('gmail@test.com');

    expect((await closeOwn(member.auth, { code: '000000' === code ? '111111' : '000000' })).status).toBe(403);
    expect((await closeOwn(member.auth, { code })).status).toBe(200);
    expect(await User.exists({ email: 'gmail@test.com' })).toBeNull();
  });

  it('turns off two-step sign-in with an e-mailed code', async () => {
    const member = await googleOnly();
    await request.post('/user/me/confirm-code').set('Authorization', member.auth).send({ action: 'two-factor-off' });
    const code = await lastCodeTo('gmail@test.com');

    const res = await request.put('/user/me/two-factor').set('Authorization', member.auth).send({ enabled: false, code });

    expect(res.status).toBe(200);
    expect((await User.findById(member.user._id).lean())?.twoFactor).toBe(false);
  });

  it('does not take a code meant for something else', async () => {
    const member = await googleOnly();
    await request.post('/user/me/confirm-code').set('Authorization', member.auth).send({ action: 'two-factor-off' });
    const code = await lastCodeTo('gmail@test.com');

    expect((await closeOwn(member.auth, { code })).status).toBe(403);
  });

  it('has its password marked as set once it resets one', async () => {
    const member = await googleOnly();
    await request.post('/auth/send-otp').send({ email: 'gmail@test.com', purpose: 'reset' });
    const otp = await (async () => {
      const { mailSettled } = await import('../controllers/auth.controller.js');
      await mailSettled();
      const mail = sendMail.mock.calls.map(([sent]) => sent as { to: string; text: string }).filter((sent) => sent.to === 'gmail@test.com').at(-1);
      return /\b(\d{6})\b/.exec(mail?.text ?? '')?.[1] ?? '';
    })();

    const res = await request.post('/auth/reset-password').send({ email: 'gmail@test.com', otp, newPassword: 'Marigold-Harbour-77!' });

    expect(res.status).toBe(200);
    expect((await User.findById(member.user._id).lean())?.passwordSet).toBe(true);
  });

  it('sets a password before changing its e-mail address', async () => {
    const member = await googleOnly();

    const res = await request.post('/user/me/email').set('Authorization', member.auth).send({ newEmail: 'new@test.com', password: 'x' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('password-needed');
  });
});

// ------------------------------------------------------ a new e-mail address
describe('changing the e-mail address', () => {
  const start = (auth: string, newEmail = 'new@test.com', password = PASSWORD) =>
    request.post('/user/me/email').set('Authorization', auth).send({ newEmail, password });

  it('needs the password, and an address no other account uses', async () => {
    const { buyer } = await people();

    expect((await start(buyer.auth, 'new@test.com', 'wrong')).status).toBe(403);
    expect((await start(buyer.auth, SELLER)).status).toBe(409);
  });

  it('moves the account and everything that names it once the code sent to the new address is given', async () => {
    const { buyer, seller } = await people();
    const { book, orderNumber } = await placeOrder(buyer.auth);
    await moveTo(orderNumber, 'Delivered', { deliveredAt: new Date() });
    await request.post(`/review/${String(book._id)}`).set('Authorization', buyer.auth).send({ rating: 5 });
    await request.post(`/seller-review/${String(seller.user._id)}`).set('Authorization', buyer.auth).send({ rating: 4 });
    await Chat.create({ sender: BUYER, receiver: SELLER, message: 'Hello' });

    const started = await start(buyer.auth);
    expect(started.body.pendingEmail).toBe('new@test.com');
    // Nothing has moved yet.
    expect((await User.findById(buyer.user._id).lean())?.email).toBe(BUYER);

    const code = await lastCodeTo('new@test.com');
    const done = await request.post('/user/me/email/confirm').set('Authorization', buyer.auth).send({ code });

    expect(done.status).toBe(200);
    expect((await User.findById(buyer.user._id).lean())).toMatchObject({ email: 'new@test.com', pendingEmail: null });
    expect(await Order.countDocuments({ buyerEmail: 'new@test.com' })).toBe(1);
    expect(await Review.countDocuments({ reviewerEmail: 'new@test.com' })).toBe(1);
    expect(await SellerReview.countDocuments({ reviewerEmail: 'new@test.com' })).toBe(1);
    expect(await Chat.countDocuments({ sender: 'new@test.com' })).toBe(1);
    // The old address is told; the session carries on under the new one.
    expect((await outbox()).some((mail) => mail.to === BUYER && /was changed/.test(mail.subject))).toBe(true);
    expect((await request.get('/order/buyer').set('Authorization', buyer.auth)).body.items).toHaveLength(1);
  });

  it('moves a seller with their listings and sales', async () => {
    const { buyer, seller } = await people();
    const { orderNumber } = await placeOrder(buyer.auth);

    await start(seller.auth, 'shop@test.com');
    const code = await lastCodeTo('shop@test.com');
    await request.post('/user/me/email/confirm').set('Authorization', seller.auth).send({ code });

    expect(await AddBook.countDocuments({ sellerEmail: 'shop@test.com' })).toBe(1);
    expect((await Order.findOne({ orderNumber }).lean())?.sellerEmail).toBe('shop@test.com');
  });

  it('refuses a wrong code and moves nothing', async () => {
    const { buyer } = await people();
    await start(buyer.auth);
    const code = await lastCodeTo('new@test.com');

    const res = await request
      .post('/user/me/email/confirm')
      .set('Authorization', buyer.auth)
      .send({ code: code === '123456' ? '654321' : '123456' });

    expect(res.status).toBe(400);
    expect((await User.findById(buyer.user._id).lean())?.email).toBe(BUYER);
  });
});
