/**
 * Two things a review section needs and this one did not have: a seller who can
 * answer, and a reader who can report.
 *
 * Without a reply, a seller's only response to an unfair review is to delete
 * it - which they cannot do, and should not be able to. Without a report,
 * nothing routes abuse to anybody.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createSignedInUser } from './helpers/factories.js';
import Order from '../models/Order.model.js';
import Review from '../models/Review.model.js';
import User from '../models/user.model.js';
import ReviewFlag from '../models/ReviewFlag.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const SELLER = 'seller@test.com';
const BUYER = 'buyer@test.com';

/** A book, an order for it, and the buyer's review of it. */
const reviewed = async () => {
  const book = await createBook({ sellerEmail: SELLER });
  await Order.create({
    orderNumber: 'ORDERAAAAAAAAAAA',
    status: 'Delivered',
    buyerEmail: BUYER,
    sellerEmail: SELLER,
    bookId: book._id,
    title: book.title,
    price: 100,
    quantity: 1,
  });

  const buyer = await createSignedInUser(request, { email: BUYER, username: 'A Buyer' });
  await request
    .post(`/review/${String(book._id)}`)
    .set('Authorization', buyer.auth)
    .send({ rating: 2, title: 'Not as described', body: 'The spine was split.' });

  const review = await Review.findOne({ book: book._id }).lean();
  return { book, buyer, review: review! };
};

describe("the seller's reply", () => {
  it('appears under the review it answers', async () => {
    const { book, review } = await reviewed();
    const seller = await createSignedInUser(request, { email: SELLER, username: 'The Shop' });

    const res = await request
      .post(`/review/${String(review._id)}/reply`)
      .set('Authorization', seller.auth)
      .send({ body: 'Sorry about that - we have refunded you in full.' });

    expect(res.status).toBe(200);

    const listed = await request.get(`/review/${String(book._id)}`);
    expect(listed.body.reviews[0].reply.body).toMatch(/refunded you in full/);
    // The name is copied in, like the reviewer's, so it survives the account.
    expect(listed.body.reviews[0].reply.byName).toBe('The Shop');
  });

  it('is only for the seller of that book', async () => {
    const { review } = await reviewed();
    const stranger = await createSignedInUser(request, { email: 'stranger@test.com' });

    const res = await request
      .post(`/review/${String(review._id)}/reply`)
      .set('Authorization', stranger.auth)
      .send({ body: 'Nothing to do with me' });

    expect(res.status).toBe(403);
  });

  it('not even for an administrator, who would be signing the shop’s name', async () => {
    const { review } = await reviewed();
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

    const res = await request
      .post(`/review/${String(review._id)}/reply`)
      .set('Authorization', admin.auth)
      .send({ body: 'On behalf of the seller' });

    expect(res.status).toBe(403);
  });

  it('replaces itself rather than stacking', async () => {
    const { book, review } = await reviewed();
    const seller = await createSignedInUser(request, { email: SELLER });

    for (const body of ['First go', 'Second, better go']) {
      await request
        .post(`/review/${String(review._id)}/reply`)
        .set('Authorization', seller.auth)
        .send({ body });
    }

    const listed = await request.get(`/review/${String(book._id)}`);
    // One reply, the latest: a thread would let the last word bury the review.
    expect(listed.body.reviews[0].reply.body).toBe('Second, better go');
  });

  it('can be withdrawn by the seller', async () => {
    const { book, review } = await reviewed();
    const seller = await createSignedInUser(request, { email: SELLER });

    await request
      .post(`/review/${String(review._id)}/reply`)
      .set('Authorization', seller.auth)
      .send({ body: 'Said in haste' });

    const res = await request
      .delete(`/review/${String(review._id)}/reply`)
      .set('Authorization', seller.auth);

    expect(res.status).toBe(200);
    const listed = await request.get(`/review/${String(book._id)}`);
    expect(listed.body.reviews[0].reply).toBeUndefined();
  });

  it('and the page is told who may write one', async () => {
    const { book } = await reviewed();
    const seller = await createSignedInUser(request, { email: SELLER });

    const asSeller = await request
      .get(`/review/${String(book._id)}`)
      .set('Authorization', seller.auth);
    const asVisitor = await request.get(`/review/${String(book._id)}`);

    expect(asSeller.body.isSeller).toBe(true);
    expect(asVisitor.body.isSeller).toBe(false);
  });
});

describe('reporting a review', () => {
  it('records it and counts it', async () => {
    const { review } = await reviewed();
    const reader = await createSignedInUser(request, { email: 'reader@test.com' });

    const res = await request
      .post(`/review/${String(review._id)}/flag`)
      .set('Authorization', reader.auth)
      .send({ reason: 'Abusive language' });

    expect(res.status).toBe(200);
    expect((await Review.findById(review._id).lean())?.flagCount).toBe(1);
  });

  it('but the review stays where it is, and keeps counting', async () => {
    const { book, review } = await reviewed();
    const reader = await createSignedInUser(request, { email: 'reader@test.com' });

    await request
      .post(`/review/${String(review._id)}/flag`)
      .set('Authorization', reader.auth)
      .send({ reason: 'I disagree with it' });

    const listed = await request.get(`/review/${String(book._id)}`);
    // Hiding on report would make this a button for removing an inconvenient
    // review, which is the opposite of what it is for.
    expect(listed.body.reviews).toHaveLength(1);
    expect(listed.body.count).toBe(1);
  });

  it('counts one person once, however many times they press it', async () => {
    const { review } = await reviewed();
    const reader = await createSignedInUser(request, { email: 'reader@test.com' });

    for (let i = 0; i < 4; i += 1) {
      await request
        .post(`/review/${String(review._id)}/flag`)
        .set('Authorization', reader.auth)
        .send({ reason: 'Again' });
    }

    expect((await Review.findById(review._id).lean())?.flagCount).toBe(1);
    expect(await ReviewFlag.countDocuments({ review: review._id })).toBe(1);
  });

  it('refuses to let somebody report their own', async () => {
    const { buyer, review } = await reviewed();

    const res = await request
      .post(`/review/${String(review._id)}/flag`)
      .set('Authorization', buyer.auth)
      .send({});

    expect(res.status).toBe(400);
  });

  it('and not at all when signed out', async () => {
    const { review } = await reviewed();

    expect((await request.post(`/review/${String(review._id)}/flag`).send({})).status).toBe(401);
  });
});

describe("the administrator's queue", () => {
  const reportedOnce = async () => {
    const made = await reviewed();
    const reader = await createSignedInUser(request, { email: 'reader@test.com' });
    await request
      .post(`/review/${String(made.review._id)}/flag`)
      .set('Authorization', reader.auth)
      .send({ reason: 'Abusive language' });
    return made;
  };

  it('lists what has been reported, with the book and the reasons', async () => {
    await reportedOnce();
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

    const res = await request.get('/review/flagged').set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].bookTitle).toBeTruthy();
    expect(res.body.items[0].reasons).toEqual(['Abusive language']);
  });

  it('and nothing that has not been', async () => {
    await reviewed();
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

    expect((await request.get('/review/flagged').set('Authorization', admin.auth)).body.total).toBe(
      0
    );
  });

  it('is closed to everyone else', async () => {
    const seller = await createSignedInUser(request, { email: SELLER });

    expect((await request.get('/review/flagged')).status).toBe(401);
    expect(
      (await request.get('/review/flagged').set('Authorization', seller.auth)).status
    ).toBe(403);
  });

  it('clears the reports and leaves the review alone', async () => {
    const { review } = await reportedOnce();
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

    const res = await request
      .delete(`/review/${String(review._id)}/flags`)
      .set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(await Review.countDocuments({ _id: review._id })).toBe(1);
    expect((await Review.findById(review._id).lean())?.flagCount).toBe(0);
    expect(await ReviewFlag.countDocuments({ review: review._id })).toBe(0);
  });

  it('and removing the review takes its reports with it', async () => {
    const { book, review } = await reportedOnce();
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

    await request
      .delete(`/review/${String(book._id)}?email=${encodeURIComponent(BUYER)}`)
      .set('Authorization', admin.auth);

    expect(await Review.countDocuments({ _id: review._id })).toBe(0);
    // Reports about a review that no longer exists describe nothing.
    expect(await ReviewFlag.countDocuments({ review: review._id })).toBe(0);
  });

  it('and the score on the book is rewritten when one goes', async () => {
    const { book } = await reportedOnce();
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

    await request
      .delete(`/review/${String(book._id)}?email=${encodeURIComponent(BUYER)}`)
      .set('Authorization', admin.auth);

    const listed = await request.get(`/review/${String(book._id)}`);
    expect(listed.body.average).toBe(0);
    expect(listed.body.count).toBe(0);
  });
});

describe('what a reply leaves behind', () => {
  it('still reads correctly after the seller’s account is gone', async () => {
    const { book, review } = await reviewed();
    const seller = await createSignedInUser(request, { email: SELLER, username: 'The Shop' });

    await request
      .post(`/review/${String(review._id)}/reply`)
      .set('Authorization', seller.auth)
      .send({ body: 'We have refunded you.' });

    // The account goes; the name was copied in, for the same reason the
    // reviewer's is, so the reply does not become anonymous.
    await User.deleteOne({ email: SELLER });

    const listed = await request.get(`/review/${String(book._id)}`);
    expect(listed.body.reviews[0].reply.byName).toBe('The Shop');
    expect(listed.body.reviews[0].reply.body).toMatch(/refunded/);
  });
});
