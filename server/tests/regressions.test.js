/**
 * Every case here corresponds to a defect that actually shipped and was found
 * during the audit, not to a hypothetical. If one of these fails, a real bug
 * has come back.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser, signIn } from './helpers/factories.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('POST /cart/clear', () => {
  // The route was dropped when index.js was split into app.js and index.js.
  // Payment.jsx calls it after checkout, so carts stayed full after paying.
  it('exists and empties the cart', async () => {
    const buyer = await createSignedInUser(request);
    const book = await createBook();
    const Cart = (await import('../models/Cart.model.js')).default;

    await request.post(`/cart/add/${book._id}`).set('Authorization', buyer.auth);
    expect(await Cart.countDocuments({})).toBe(1);

    const res = await request.post('/cart/clear').set('Authorization', buyer.auth);

    expect(res.status).toBe(200);
    expect(await Cart.countDocuments({})).toBe(0);
  });

  it('clears only the caller’s cart', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    const bob = await createSignedInUser(request, { email: 'bob@test.com' });
    const book = await createBook();

    await request.post(`/cart/add/${book._id}`).set('Authorization', alice.auth);
    await request.post(`/cart/add/${book._id}`).set('Authorization', bob.auth);

    await request.post('/cart/clear').set('Authorization', alice.auth);

    const bobCart = await request.get('/cart').set('Authorization', bob.auth);
    expect(bobCart.body).toHaveLength(1);
  });
});

describe('stock reservation', () => {
  // Orders used to be written before stock was reserved, so a race on the
  // last copy could record an order that could never be fulfilled.
  it('decrements stock by the quantity ordered', async () => {
    const buyer = await createSignedInUser(request);
    const book = await createBook({ stock: 5 });
    const AddBook = (await import('../models/AddBook.model.js')).default;

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .send({ items: [{ bookId: String(book._id), quantity: 2 }] });

    expect(res.status).toBe(200);
    expect((await AddBook.findById(book._id)).stock).toBe(3);
  });

  it('refuses to oversell and leaves stock untouched', async () => {
    const buyer = await createSignedInUser(request);
    const book = await createBook({ stock: 1 });
    const AddBook = (await import('../models/AddBook.model.js')).default;

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .send({ items: [{ bookId: String(book._id), quantity: 99 }] });

    expect(res.status).toBe(409);
    expect((await AddBook.findById(book._id)).stock).toBe(1);
  });

  it('never sells the same last copy twice under concurrent orders', async () => {
    const a = await createSignedInUser(request, { email: 'a@test.com' });
    const b = await createSignedInUser(request, { email: 'b@test.com' });
    const book = await createBook({ stock: 1 });
    const AddBook = (await import('../models/AddBook.model.js')).default;

    const order = (auth) =>
      request
        .post('/order/decrease-stock')
        .set('Authorization', auth)
        .send({ items: [{ bookId: String(book._id), quantity: 1 }] });

    const results = await Promise.all([order(a.auth), order(b.auth)]);
    const succeeded = results.filter((r) => r.status === 200);

    expect(succeeded).toHaveLength(1);
    expect((await AddBook.findById(book._id)).stock).toBe(0);
  });
});

describe('profile privacy', () => {
  // Contact details used to be returned for any e-mail, to anyone.
  const seedVictim = () =>
    createUser({
      email: 'victim@test.com',
      address: '12 Secret Road',
      phone: '01700000000',
      gender: 'female',
    });

  it('hides contact details from anonymous callers', async () => {
    await seedVictim();

    const res = await request.get('/user/profile').query({ email: 'victim@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.address).toBeUndefined();
    expect(res.body.phone).toBeUndefined();
    expect(res.body.gender).toBeUndefined();
    // The public fields a listing needs are still returned.
    expect(res.body.email).toBe('victim@test.com');
    expect(res.body.username).toEqual(expect.any(String));
  });

  it('hides contact details from a different signed-in user', async () => {
    await seedVictim();
    const snoop = await createSignedInUser(request, { email: 'snoop@test.com' });

    const res = await request
      .get('/user/profile')
      .query({ email: 'victim@test.com' })
      .set('Authorization', snoop.auth);

    expect(res.body.address).toBeUndefined();
    expect(res.body.phone).toBeUndefined();
  });

  it('returns contact details to the owner', async () => {
    await seedVictim();
    const token = await signIn(request, 'victim@test.com');

    const res = await request
      .get('/user/profile')
      .query({ email: 'victim@test.com' })
      .set('Authorization', `Bearer ${token}`);

    expect(res.body.address).toBe('12 Secret Road');
    expect(res.body.phone).toBe('01700000000');
  });
});

describe('list responses carry one cover, detail carries all', () => {
  // Base64 covers are stored inline, so GET /book used to return every image
  // of every book and the payload grew with the whole catalogue.
  it('list endpoints return a single image', async () => {
    await createBook({ images: ['a', 'b', 'c', 'd', 'e'] });

    for (const path of ['/book', '/filter/booklist']) {
      const res = await request.get(path);
      expect(res.status).toBe(200);
      expect(res.body[0].images).toHaveLength(1);
    }
  });

  it('the detail endpoint returns every image', async () => {
    const book = await createBook({ images: ['a', 'b', 'c', 'd', 'e'] });

    const res = await request.get(`/book/${book._id}`);

    expect(res.body.images).toHaveLength(5);
  });

  it('the thumbnail is still present in a list response', async () => {
    await createBook({ images: ['data:image/png;base64,COVER', 'other'] });

    const res = await request.get('/book');

    expect(res.body[0].images[0]).toBe('data:image/png;base64,COVER');
  });
});

describe('chat endpoints that used to fail outright', () => {
  it('GET /chat/messages returns a thread', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    await createUser({ email: 'bob@test.com' });

    await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', 'bob@test.com')
      .field('message', 'hi');

    const res = await request
      .get('/chat/messages')
      .query({ sender: 'alice@test.com', receiver: 'bob@test.com' })
      .set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.messages[0].message).toBe('hi');
  });

  it('DELETE /chat/delete removes the conversation', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    await createUser({ email: 'bob@test.com' });
    const ChatMessage = (await import('../models/Chat.model.js')).default;

    await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', 'bob@test.com')
      .field('message', 'hi');

    const res = await request
      .delete('/chat/delete')
      .set('Authorization', alice.auth)
      .send({ user1: 'alice@test.com', user2: 'bob@test.com' });

    expect(res.status).toBe(200);
    expect(await ChatMessage.countDocuments({})).toBe(0);
  });
});
