/**
 * Sellers are paid by bKash, to a merchant number they give on their profile.
 *
 * Checkout takes the buyer's money (cash, to the courier); these pin the
 * record of what each seller is owed, where to send it, and whether it has
 * been sent.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser, createUser, PNG_PIXEL } from './helpers/factories.js';
import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import User from '../models/user.model.js';
import { payoutStateFor, sellerFeeFor, sellerPayoutFor } from '../config/commerce.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const DAY = 24 * 60 * 60 * 1000;
const SELLER = 'seller@test.com';
const orderNumber = (n: number) => `PAYOUT${String(n).padStart(10, '0')}`;

/** An order line of `price` taka, delivered `daysAgo` days ago (or not at all). */
const line = (n: number, { price = 400, daysAgo = 10 as number | null, seller = SELLER } = {}) =>
  Order.create({
    orderNumber: orderNumber(n),
    status: daysAgo === null ? 'Shipped' : 'Delivered',
    deliveredAt: daysAgo === null ? null : new Date(Date.now() - daysAgo * DAY),
    buyerEmail: 'buyer@test.com',
    sellerEmail: seller,
    bookId: new mongoose.Types.ObjectId(),
    title: `Book ${String(n)}`,
    price,
    quantity: 1,
  });

const admin = () => createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

describe('a seller must be payable before listing', () => {
  const list = (auth: string) =>
    request
      .post('/user/add-book')
      .set('Authorization', auth)
      .field('title', 'A Book')
      .field('author', 'An Author')
      .field('publisher', 'N/A')
      .field('country', 'N/A')
      .field('language', 'N/A')
      .field('isbn', 'N/A')
      .field('desc', 'N/A')
      .field('price', '300')
      .field('bookType', 'new')
      .field('category', 'Fiction')
      .attach('images', PNG_PIXEL, 'cover.png');

  it('is refused without a bKash merchant number, and told what to do', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER, bkashMerchant: null });

    const res = await list(auth);

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('payout-number-required');
    expect(res.body.message).toMatch(/bKash merchant number/);
  });

  it('can list once one is on the profile', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER, bkashMerchant: null });

    const set = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .field('bkashMerchant', '+880 1812-345678');
    expect(set.status).toBe(200);

    expect((await list(auth)).status).toBe(201);
    // Kept in the one form bKash uses, however it was typed.
    expect((await User.findOne({ email: SELLER }).lean())?.bkashMerchant).toBe('01812345678');
  });

  it('is saved from the profile form as the page sends it, blanks and all', async () => {
    // The form sends every field, so a blank gender must be accepted, or
    // anyone without one could not save their profile - or add this number.
    const { auth } = await createSignedInUser(request, { email: SELLER, bkashMerchant: null });

    const res = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .field('username', 'rahim')
      .field('address', '')
      .field('phone', '')
      .field('bkashMerchant', '01812345678')
      .field('dateOfBirth', '')
      .field('gender', '');

    expect(res.status).toBe(200);
    expect((await User.findOne({ email: SELLER }).lean())?.bkashMerchant).toBe('01812345678');
    // The answer must not carry the whole account, password hash included.
    expect(res.body.user.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toMatch(/\$2[aby]\$/);
  });

  it('will not take a number that is not one', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER });

    const res = await request.put('/user/profile').set('Authorization', auth).field('bkashMerchant', '12345');

    expect(res.status).toBe(400);
  });
});

describe('the merchant number is private', () => {
  it('is shown to its owner', async () => {
    const { auth } = await createSignedInUser(request, { email: SELLER, bkashMerchant: '01812345678' });

    const res = await request.get('/user/profile').set('Authorization', auth);

    expect(res.body.bkashMerchant).toBe('01812345678');
  });

  it('and not to a buyer looking at the seller of a listing', async () => {
    await createUser({ email: SELLER, bkashMerchant: '01812345678' });
    const buyer = await createSignedInUser(request, { email: 'buyer@test.com' });

    const res = await request
      .get(`/user/profile?email=${encodeURIComponent(SELLER)}`)
      .set('Authorization', buyer.auth);

    expect(res.body.bkashMerchant).toBeUndefined();
  });
});

describe('when a sale becomes payable', () => {
  const now = Date.now();
  const delivered = (daysAgo: number) => ({ status: 'Delivered', deliveredAt: new Date(now - daysAgo * DAY) });

  it('not before delivery', () => {
    expect(payoutStateFor({ status: 'Shipped' }, null, now)).toBe('awaiting-delivery');
  });

  it('not while the buyer can still send it back', () => {
    expect(payoutStateFor(delivered(3), null, now)).toBe('in-return-window');
  });

  it('once the return window has closed', () => {
    expect(payoutStateFor(delivered(8), null, now)).toBe('due');
  });

  it('not while a return is being decided, and never once one is approved', () => {
    expect(payoutStateFor(delivered(8), 'pending', now)).toBe('return-in-progress');
    expect(payoutStateFor(delivered(8), 'approved', now)).toBe('returned');
    // A rejected return leaves the sale standing.
    expect(payoutStateFor(delivered(8), 'rejected', now)).toBe('due');
  });

  it('keeps 5% of the book total and pays the rest', () => {
    expect(sellerFeeFor(850)).toBe(42.5);
    expect(sellerPayoutFor(850)).toBe(807.5);
    expect(sellerFeeFor(333)).toBe(16.65);
  });
});

describe('the payouts page', () => {
  it('lists what is due: one row per seller per order, with where to send it', async () => {
    const { auth } = await admin();
    await createUser({ email: SELLER, username: 'rahim', bkashMerchant: '01812345678' });
    // Two of the seller's books in one order, and one of somebody else's.
    await line(1, { price: 300 });
    await line(1, { price: 500 });
    await createUser({ email: 'other@test.com' });
    await line(1, { price: 999, seller: 'other@test.com' });

    const res = await request.get('/order/admin/payouts').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    const row = res.body.items.find((r: { sellerEmail: string }) => r.sellerEmail === SELLER);
    expect(row).toMatchObject({
      orderNumber: orderNumber(1),
      sellerName: 'rahim',
      bkashMerchant: '01812345678',
      booksTotal: 800,
      fee: 40,
      payout: 760,
    });
  });

  it('leaves out what is not payable yet', async () => {
    const { auth } = await admin();
    await createUser({ email: SELLER });
    await line(1, { daysAgo: 2 }); // still inside the return window
    await line(2, { daysAgo: null }); // not delivered
    const heldBack = await line(3);
    await ReturnRequest.create({
      orderId: heldBack._id,
      orderNumber: orderNumber(3),
      bookId: heldBack.bookId,
      bookTitle: 'Book 3',
      userEmail: 'buyer@test.com',
      sellerEmail: SELLER,
      defectDescription: 'Torn',
      status: 'pending',
    });
    await line(4);

    const res = await request.get('/order/admin/payouts').set('Authorization', auth);

    expect(res.body.items.map((row: { orderNumber: string }) => row.orderNumber)).toEqual([orderNumber(4)]);
  });

  it('says so when a seller has not given a number', async () => {
    const { auth } = await admin();
    await createUser({ email: SELLER, bkashMerchant: null });
    await line(1);

    const res = await request.get('/order/admin/payouts').set('Authorization', auth);

    expect(res.body.items[0].bkashMerchant).toBeNull();
  });

  it('is for administrators only', async () => {
    const seller = await createSignedInUser(request, { email: SELLER });

    expect((await request.get('/order/admin/payouts').set('Authorization', seller.auth)).status).toBe(403);
  });
});

describe('recording a payment', () => {
  const pay = (auth: string, reference = '8n7a2b3c4d', n = 1) =>
    request
      .post('/order/admin/payouts/paid')
      .set('Authorization', auth)
      .send({ orderNumber: orderNumber(n), sellerEmail: SELLER, reference });

  it('moves the order from due to paid, with the bKash transaction ID', async () => {
    const { auth } = await admin();
    await createUser({ email: SELLER });
    await line(1, { price: 1000 });

    const res = await pay(auth);

    expect(res.status).toBe(200);
    expect(res.body.amount).toBe(950);

    const due = await request.get('/order/admin/payouts').set('Authorization', auth);
    const paid = await request.get('/order/admin/payouts?state=paid').set('Authorization', auth);
    expect(due.body.total).toBe(0);
    expect(paid.body.items[0]).toMatchObject({ reference: '8N7A2B3C4D', payout: 950 });
  });

  it('cannot pay the same order twice', async () => {
    const { auth } = await admin();
    await createUser({ email: SELLER });
    await line(1);

    expect((await pay(auth)).status).toBe(200);
    expect((await pay(auth)).status).toBe(409);
  });

  it('cannot pay what is not due yet', async () => {
    const { auth } = await admin();
    await createUser({ email: SELLER });
    await line(1, { daysAgo: 2 });

    expect((await pay(auth)).status).toBe(409);
  });

  it('asks for a transaction ID that looks like one', async () => {
    const { auth } = await admin();
    await createUser({ email: SELLER });
    await line(1);

    expect((await pay(auth, 'no')).status).toBe(400);
  });

  it('is shown to the seller on their orders', async () => {
    const { auth } = await admin();
    const seller = await createSignedInUser(request, { email: SELLER });
    await line(1);
    await line(2, { daysAgo: 2 });
    await pay(auth);

    const res = await request.get('/order/seller').set('Authorization', seller.auth);
    const states = Object.fromEntries(
      (res.body.items as { orderNumber: string; payoutState: string }[]).map((row) => [
        row.orderNumber,
        row.payoutState,
      ])
    );

    expect(states).toEqual({ [orderNumber(1)]: 'paid', [orderNumber(2)]: 'in-return-window' });
  });
});
