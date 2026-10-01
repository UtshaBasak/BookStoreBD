/**
 * Seller ratings: only somebody who has bought from a seller may rate them, the
 * seller hears about it and may answer, and a reported rating reaches an
 * administrator, who clears the reports or removes it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createUserWithToken, PASSWORD } from './helpers/factories.js';
import AuditLog from '../models/AuditLog.model.js';
import Notification from '../models/Notification.model.js';
import Order from '../models/Order.model.js';
import SellerReview from '../models/SellerReview.model.js';
import SellerReviewFlag from '../models/SellerReviewFlag.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const SELLER = 'seller@test.com';
const BUYER = 'buyer@test.com';

const people = async () => ({
  seller: await createUserWithToken({ email: SELLER, username: 'bookshop', bkashMerchant: '01710000001' }),
  buyer: await createUserWithToken({ email: BUYER, username: 'reader' }),
  stranger: await createUserWithToken({ email: 'stranger@test.com', username: 'stranger' }),
  admin: await createUserWithToken({ email: 'admin@test.com', username: 'admin', role: 'admin' }),
});

/** An order from the seller, which is what earns a rating. */
const bought = async (status = 'Order Confirmed', buyerEmail = BUYER) => {
  const book = await createBook({ sellerEmail: SELLER });
  await Order.create({
    orderNumber: `ORDER${Math.random().toString(36).slice(2, 13).toUpperCase()}`,
    status,
    buyerEmail,
    sellerEmail: SELLER,
    bookId: book._id,
    title: book.title,
    price: 100,
    quantity: 1,
  });
};

const noticesOf = (email: string, type: string) => Notification.find({ recipient: email, type }).lean();

describe('rating a seller', () => {
  it('is for somebody who has bought from them, and the seller is told', async () => {
    const { seller, buyer } = await people();
    await bought();

    const res = await request
      .post(`/seller-review/${String(seller.user._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 5, title: 'Quick and careful', body: 'Well packed, arrived in two days.' });
    expect(res.status).toBe(200);

    const notices = await noticesOf(SELLER, 'seller-review');
    expect(notices).toHaveLength(1);
    expect(notices[0].link).toBe('/shop/bookshop#ratings');

    const summary = await request.get(`/seller-review/${String(seller.user._id)}`).set('Authorization', buyer.auth);
    expect(summary.body).toMatchObject({ average: 5, count: 1, canReview: true, reason: null, isSeller: false });
    expect(summary.body.distribution).toEqual([0, 0, 0, 0, 1]);
    expect(summary.body.mine).toMatchObject({ title: 'Quick and careful' });

    const shop = await request.get('/user/shop/bookshop');
    expect(shop.body.sellerRating).toEqual({ average: 5, count: 1 });
    const profile = await request.get(`/user/profile?email=${SELLER}`);
    expect(profile.body.sellerRating).toEqual({ average: 5, count: 1 });
  });

  it('replaces the earlier rating on a second go, without telling the seller again', async () => {
    const { seller, buyer } = await people();
    await bought();
    const url = `/seller-review/${String(seller.user._id)}`;

    await request.post(url).set('Authorization', buyer.auth).send({ rating: 2 });
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await request.post(url).set('Authorization', buyer.auth).send({ rating: 4 });

    expect(await SellerReview.countDocuments()).toBe(1);
    expect((await request.get(url)).body).toMatchObject({ average: 4, count: 1 });
    expect(await noticesOf(SELLER, 'seller-review')).toHaveLength(1);
  });

  it('is refused for somebody who has not bought from them, or only cancelled', async () => {
    const { seller, buyer, stranger } = await people();
    await bought('Cancelled');
    const url = `/seller-review/${String(seller.user._id)}`;

    for (const who of [buyer, stranger]) {
      const res = await request.post(url).set('Authorization', who.auth).send({ rating: 1 });
      expect(res.status).toBe(403);
      expect(res.body.message).toMatch(/bought from this seller/i);
    }
    expect((await request.get(url).set('Authorization', buyer.auth)).body.reason).toBe('not-purchased');
  });

  it('is refused for the seller themself', async () => {
    const { seller } = await people();
    await bought('Order Confirmed', SELLER);
    const url = `/seller-review/${String(seller.user._id)}`;

    const res = await request.post(url).set('Authorization', seller.auth).send({ rating: 5 });
    expect(res.status).toBe(403);
    expect((await request.get(url).set('Authorization', seller.auth)).body).toMatchObject({
      reason: 'own-shop',
      isSeller: true,
    });
  });

  it('asks a visitor to sign in, and answers 404 for an unknown seller', async () => {
    const { seller } = await people();
    expect((await request.get(`/seller-review/${String(seller.user._id)}`)).body.reason).toBe('sign-in');
    expect((await request.get('/seller-review/64b7f0c2a1b2c3d4e5f60718')).status).toBe(404);
  });

  it('can be withdrawn by the buyer who wrote it', async () => {
    const { seller, buyer } = await people();
    await bought();
    const url = `/seller-review/${String(seller.user._id)}`;
    await request.post(url).set('Authorization', buyer.auth).send({ rating: 3 });

    expect((await request.delete(url).set('Authorization', buyer.auth)).status).toBe(200);
    expect((await request.get(url)).body.count).toBe(0);
  });
});

describe('closing an account', () => {
  it("anonymises the buyer's ratings and removes the ratings of a seller's shop", async () => {
    const { seller, buyer } = await people();
    await bought();
    await request.post(`/seller-review/${String(seller.user._id)}`).set('Authorization', buyer.auth).send({ rating: 4 });

    await request.delete('/user/me').set('Authorization', buyer.auth).send({ password: PASSWORD });
    const kept = (await SellerReview.findOne().lean())!;
    expect(kept.reviewerEmail).not.toBe(BUYER);
    expect(kept.reviewerName).not.toBe('reader');

    await request.delete('/user/me').set('Authorization', seller.auth).send({ password: PASSWORD });
    expect(await SellerReview.countDocuments()).toBe(0);
  });
});

describe("the seller's reply", () => {
  it('is for the seller only, and the buyer is told', async () => {
    const { seller, buyer, stranger } = await people();
    await bought();
    await request.post(`/seller-review/${String(seller.user._id)}`).set('Authorization', buyer.auth).send({ rating: 2 });
    const review = (await SellerReview.findOne().lean())!;
    const url = `/seller-review/${String(review._id)}/reply`;

    expect((await request.post(url).set('Authorization', stranger.auth).send({ body: 'Not mine' })).status).toBe(403);

    const res = await request.post(url).set('Authorization', seller.auth).send({ body: 'Sorry - a new copy is on its way.' });
    expect(res.status).toBe(200);
    expect(res.body.reply).toMatchObject({ byName: 'bookshop' });
    expect(await noticesOf(BUYER, 'seller-review-reply')).toHaveLength(1);

    expect((await request.delete(url).set('Authorization', seller.auth)).status).toBe(200);
    expect((await SellerReview.findById(review._id).lean())!.reply).toBeUndefined();
  });
});

describe('reporting a seller rating', () => {
  const reported = async () => {
    const team = await people();
    await bought();
    await request
      .post(`/seller-review/${String(team.seller.user._id)}`)
      .set('Authorization', team.buyer.auth)
      .send({ rating: 1, body: 'Rude and slow.' });
    const review = (await SellerReview.findOne().lean())!;
    await request
      .post(`/seller-review/${String(review._id)}/flag`)
      .set('Authorization', team.seller.auth)
      .send({ reason: 'This buyer never collected the parcel' });
    return { ...team, review };
  };

  it('counts once per person and tells the administrators', async () => {
    const { seller, buyer, review } = await reported();
    await request.post(`/seller-review/${String(review._id)}/flag`).set('Authorization', seller.auth).send({});

    expect((await SellerReview.findById(review._id).lean())!.flagCount).toBe(1);
    const notices = await noticesOf('admin@test.com', 'seller-review-reported');
    expect(notices).toHaveLength(1);
    expect(notices[0].link).toBe('/admin/reviews?of=sellers');

    const own = await request.post(`/seller-review/${String(review._id)}/flag`).set('Authorization', buyer.auth).send({});
    expect(own.status).toBe(400);
  });

  it('puts it in the queue with the reasons, for administrators only', async () => {
    const { buyer, admin } = await reported();

    expect((await request.get('/seller-review/flagged').set('Authorization', buyer.auth)).status).toBe(403);

    const queue = await request.get('/seller-review/flagged').set('Authorization', admin.auth);
    expect(queue.body.total).toBe(1);
    expect(queue.body.items[0]).toMatchObject({
      sellerName: 'bookshop',
      flagCount: 1,
      reasons: ['This buyer never collected the parcel'],
    });

    const all = await request.get('/seller-review/all?search=bookshop').set('Authorization', admin.auth);
    expect(all.body.items).toHaveLength(1);
    expect((await request.get('/seller-review/all?reported=no').set('Authorization', admin.auth)).body.total).toBe(0);
  });

  it('can be cleared, leaving the rating, or the rating removed, with an audit row', async () => {
    const { seller, admin, review } = await reported();

    const cleared = await request.delete(`/seller-review/${String(review._id)}/flags`).set('Authorization', admin.auth);
    expect(cleared.status).toBe(200);
    expect((await SellerReview.findById(review._id).lean())!.flagCount).toBe(0);
    expect(await SellerReviewFlag.countDocuments()).toBe(0);

    const removed = await request
      .delete(`/seller-review/${String(seller.user._id)}?email=${BUYER}`)
      .set('Authorization', admin.auth);
    expect(removed.status).toBe(200);
    expect(await SellerReview.countDocuments()).toBe(0);
    expect(await AuditLog.countDocuments({ action: { $in: ['seller-review.delete', 'seller-review.flags.dismiss'] } })).toBe(2);
  });
});
