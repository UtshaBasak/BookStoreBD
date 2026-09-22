/**
 * Ratings.
 *
 * The client used to read `book.rating` and `book.numReviews`, which no
 * endpoint returned and no model stored - a star filter that matched nothing
 * and a "most popular" sort that sorted nothing. This is the data those
 * controls were pretending to have.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createSignedInUser, PASSWORD } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

/** A buyer who has actually bought the book, which is what earns a review. */
const buyerOf = async (bookId: string, email = 'buyer@test.com') => {
  const buyer = await createSignedInUser(request, { email });
  await request
    .post('/order/decrease-stock')
    .set('Authorization', buyer.auth)
    .send({ items: [{ bookId, quantity: 1 }] });
  return buyer;
};

describe('writing a review', () => {
  it('is allowed for somebody who bought the book', async () => {
    const book = await createBook({ stock: 5, sellerEmail: 'seller@test.com' });
    const buyer = await buyerOf(String(book._id));

    const res = await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 5, title: 'Excellent', body: 'Arrived in two days and in good shape.' });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ rating: 5, title: 'Excellent' });
  });

  it('is refused for somebody who has not', async () => {
    const book = await createBook({ stock: 5 });
    const stranger = await createSignedInUser(request, { email: 'stranger@test.com' });

    const res = await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', stranger.auth)
      .send({ rating: 5 });

    // Otherwise a seller rates their own books from three accounts and a
    // competitor rates them down from three more.
    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/bought/i);
  });

  it('is refused for the seller of the book', async () => {
    const book = await createBook({ stock: 5, sellerEmail: 'seller@test.com' });
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    // Even having bought a copy of their own listing.
    await request
      .post('/order/decrease-stock')
      .set('Authorization', seller.auth)
      .send({ items: [{ bookId: String(book._id), quantity: 1 }] });

    const res = await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', seller.auth)
      .send({ rating: 5 });

    expect(res.status).toBe(403);
    expect(res.body.message).toMatch(/own listing/i);
  });

  it('needs an account', async () => {
    const book = await createBook({ stock: 5 });
    expect((await request.post(`/review/${String(book._id)}`).send({ rating: 5 })).status).toBe(401);
  });

  it('takes a star on its own, without prose', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));

    const res = await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 4 });

    expect(res.status).toBe(200);
  });

  it('refuses a score outside one to five', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));

    for (const rating of [0, 6, -1]) {
      const res = await request
        .post(`/review/${String(book._id)}`)
        .set('Authorization', buyer.auth)
        .send({ rating });
      expect(res.status).toBe(400);
    }
  });

  it('replaces an earlier review rather than stacking one on it', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));

    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 2, body: 'Slow delivery.' });
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 4, body: 'It turned up. Changing my mind.' });

    const res = await request.get(`/review/${String(book._id)}`);

    // Nobody weights a score by writing the same opinion twice.
    expect(res.body.count).toBe(1);
    expect(res.body.average).toBe(4);
  });
});

describe('the score on the book', () => {
  it('is the average of its reviews, to one decimal', async () => {
    const book = await createBook({ stock: 9 });
    const AddBook = (await import('../models/AddBook.model.js')).default;

    const scores: Array<[string, number]> = [
      ['a@test.com', 5],
      ['b@test.com', 4],
      ['c@test.com', 4],
    ];
    for (const [email, rating] of scores) {
      const buyer = await buyerOf(String(book._id), email);
      await request
        .post(`/review/${String(book._id)}`)
        .set('Authorization', buyer.auth)
        .send({ rating });
    }

    const updated = await AddBook.findById(book._id);
    // 13/3 is 4.333..., which is not more informative than 4.3.
    expect(updated?.ratingAverage).toBe(4.3);
    expect(updated?.ratingCount).toBe(3);
  });

  it('is zero for a book nobody has reviewed', async () => {
    const book = await createBook();
    const AddBook = (await import('../models/AddBook.model.js')).default;

    const fresh = await AddBook.findById(book._id);
    expect(fresh?.ratingAverage).toBe(0);
    expect(fresh?.ratingCount).toBe(0);
  });

  it('follows the catalogue, so the list can sort on it', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 5 });

    const catalogue = await request.get('/filter/booklist');
    const listed = catalogue.body.items.find((b: { _id: string }) => b._id === String(book._id));

    expect(listed.ratingAverage).toBe(5);
    expect(listed.ratingCount).toBe(1);
  });
});

describe('reading reviews', () => {
  it('is public, because that is who the score is for', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 5, body: 'Worth it.' });

    const res = await request.get(`/review/${String(book._id)}`);

    expect(res.status).toBe(200);
    expect(res.body.reviews).toHaveLength(1);
    expect(res.body.reviews[0].body).toBe('Worth it.');
    // A signed-out reader is told why the form is not there.
    expect(res.body.canReview).toBe(false);
    expect(res.body.reason).toBe('sign-in');
  });

  it('tells a signed-in caller whether they may write one, and what they wrote', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 3, title: 'Fine' });

    const res = await request.get(`/review/${String(book._id)}`).set('Authorization', buyer.auth);

    expect(res.body.canReview).toBe(true);
    expect(res.body.mine).toMatchObject({ rating: 3, title: 'Fine' });
  });

  it('says why somebody who has not bought it cannot write one', async () => {
    const book = await createBook({ stock: 5 });
    const stranger = await createSignedInUser(request, { email: 'stranger@test.com' });

    const res = await request.get(`/review/${String(book._id)}`).set('Authorization', stranger.auth);

    expect(res.body.canReview).toBe(false);
    expect(res.body.reason).toBe('not-purchased');
  });

  it('shows how the stars are spread, not only the average', async () => {
    const book = await createBook({ stock: 9 });
    const scores: Array<[string, number]> = [
      ['a@test.com', 1],
      ['b@test.com', 5],
      ['c@test.com', 5],
    ];
    for (const [email, rating] of scores) {
      const buyer = await buyerOf(String(book._id), email);
      await request
        .post(`/review/${String(book._id)}`)
        .set('Authorization', buyer.auth)
        .send({ rating });
    }

    const res = await request.get(`/review/${String(book._id)}`);

    // An average of 3.7 hides that a third of buyers hated it.
    expect(res.body.distribution).toEqual([1, 0, 0, 0, 2]);
  });

  it('404s for a book that does not exist', async () => {
    const res = await request.get('/review/64b7f9c2e4b0a1c2d3e4f5a6');
    expect(res.status).toBe(404);
  });
});

describe('removing a review', () => {
  it('lets the author take their own down', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 5 });

    const res = await request.delete(`/review/${String(book._id)}`).set('Authorization', buyer.auth);

    expect(res.status).toBe(200);

    const after = await request.get(`/review/${String(book._id)}`);
    expect(after.body.count).toBe(0);
    expect(after.body.average).toBe(0);
  });

  it('does not let one person delete another one', async () => {
    const book = await createBook({ stock: 9 });
    const author = await buyerOf(String(book._id), 'author@test.com');
    const other = await buyerOf(String(book._id), 'other@test.com');
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', author.auth)
      .send({ rating: 5 });

    const res = await request.delete(`/review/${String(book._id)}`).set('Authorization', other.auth);

    expect(res.status).toBe(404);
    expect((await request.get(`/review/${String(book._id)}`)).body.count).toBe(1);
  });

  it('lets an administrator remove one, and records that they did', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id));
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 1, body: 'Nonsense.' });
    const AuditLog = (await import('../models/AuditLog.model.js')).default;

    const res = await request
      .delete(`/review/${String(book._id)}?email=buyer@test.com`)
      .set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    const entry = await AuditLog.findOne({ action: 'review.delete' });
    expect(entry?.actorEmail).toBe('admin@test.com');
  });
});

describe('when the reviewer closes their account', () => {
  it('the review stays, under a stand-in name', async () => {
    const book = await createBook({ stock: 5 });
    const buyer = await buyerOf(String(book._id), 'leaving@test.com');
    await request
      .post(`/review/${String(book._id)}`)
      .set('Authorization', buyer.auth)
      .send({ rating: 5, body: 'Good seller.' });

    await request.delete('/user/me').set('Authorization', buyer.auth).send({ password: PASSWORD });

    const res = await request.get(`/review/${String(book._id)}`);

    // The next buyer's decision rests on these, and a score that fell every
    // time somebody closed an account would be worth nothing.
    expect(res.body.count).toBe(1);
    expect(res.body.average).toBe(5);
    expect(res.body.reviews[0].reviewerName).toBe('Deleted user');
    expect(res.body.reviews[0].reviewerEmail).not.toBe('leaving@test.com');
  });
});
