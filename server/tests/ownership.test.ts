import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser, signIn } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('listing ownership', () => {
  const setup = async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const intruder = await createSignedInUser(request, { email: 'intruder@test.com' });
    const book = await createBook({ sellerEmail: 'seller@test.com' });
    return { seller, intruder, book };
  };

  it('the owner can change the price', async () => {
    const { seller, book } = await setup();

    const res = await request
      .put(`/book/update-price/${book._id}`)
      .set('Authorization', seller.auth)
      .send({ price: 999 });

    expect(res.status).toBe(200);
    expect(res.body.book.price).toBe(999);
  });

  it('another seller cannot change the price', async () => {
    const { intruder, book } = await setup();

    const res = await request
      .put(`/book/update-price/${book._id}`)
      .set('Authorization', intruder.auth)
      .send({ price: 1 });

    expect(res.status).toBe(403);
  });

  it('another seller cannot change the stock', async () => {
    const { intruder, book } = await setup();

    const res = await request
      .put(`/book/update-stock/${book._id}`)
      .set('Authorization', intruder.auth)
      .send({ stock: 0 });

    expect(res.status).toBe(403);
  });

  it('another seller cannot delete the listing', async () => {
    const { intruder, book } = await setup();

    const res = await request.delete(`/book/${book._id}`).set('Authorization', intruder.auth);

    expect(res.status).toBe(403);
  });

  it('an admin can manage any listing', async () => {
    const { book } = await setup();
    await createUser({ email: 'admin@test.com' });
    const token = await signIn(request, 'admin@test.com');

    const res = await request
      .put(`/book/update-price/${book._id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 500 });

    expect(res.status).toBe(200);
  });

  it('a new listing is attributed to the signed-in seller, not the body', async () => {
    const { seller } = await setup();

    const res = await request
      .post('/user/add-book')
      .set('Authorization', seller.auth)
      .field('title', 'Spoofed')
      .field('author', 'A')
      .field('publisher', 'P')
      .field('country', 'BD')
      .field('language', 'en')
      .field('isbn', '123')
      .field('pages', '10')
      .field('price', '10')
      .field('desc', 'd')
      .field('category', 'tech')
      .field('bookType', 'new')
      .field('sellerEmail', 'victim@test.com');

    expect(res.status).toBe(201);
    expect(res.body.book.sellerEmail).toBe('seller@test.com');
  });
});

describe('order access', () => {
  const placeOrder = async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const buyer = await createSignedInUser(request, { email: 'buyer@test.com' });
    const outsider = await createSignedInUser(request, { email: 'outsider@test.com' });
    const book = await createBook({ sellerEmail: 'seller@test.com', stock: 5 });

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .send({ items: [{ bookId: String(book._id), quantity: 1 }] });

    return { seller, buyer, outsider, orderNumber: res.body.orderNumber };
  };

  it('the buyer can read their order', async () => {
    const { buyer, orderNumber } = await placeOrder();
    const res = await request.get(`/order/${orderNumber}`).set('Authorization', buyer.auth);
    expect(res.status).toBe(200);
  });

  it('the seller can read the order', async () => {
    const { seller, orderNumber } = await placeOrder();
    const res = await request.get(`/order/${orderNumber}`).set('Authorization', seller.auth);
    expect(res.status).toBe(200);
  });

  it('an unrelated user cannot read it', async () => {
    const { outsider, orderNumber } = await placeOrder();
    const res = await request.get(`/order/${orderNumber}`).set('Authorization', outsider.auth);
    expect(res.status).toBe(403);
  });

  it('an unrelated user cannot change its status', async () => {
    const { outsider, orderNumber } = await placeOrder();

    const res = await request
      .patch(`/order/status/${orderNumber}`)
      .set('Authorization', outsider.auth)
      .send({ status: 'Delivered' });

    expect(res.status).toBe(403);
  });

  it('an admin can read any order', async () => {
    const { orderNumber } = await placeOrder();
    await createUser({ email: 'admin@test.com' });
    const token = await signIn(request, 'admin@test.com');

    const res = await request.get(`/order/${orderNumber}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
  });
});

describe('conversation privacy', () => {
  it('a non-participant cannot read a thread', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    const snoop = await createSignedInUser(request, { email: 'snoop@test.com' });
    await createUser({ email: 'bob@test.com' });

    await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', 'bob@test.com')
      .field('message', 'private');

    const res = await request
      .get('/chat/messages')
      .query({ sender: 'alice@test.com', receiver: 'bob@test.com' })
      .set('Authorization', snoop.auth);

    expect(res.status).toBe(403);
  });

  it('a non-participant cannot delete a thread', async () => {
    const snoop = await createSignedInUser(request, { email: 'snoop@test.com' });

    const res = await request
      .delete('/chat/delete')
      .set('Authorization', snoop.auth)
      .send({ user1: 'alice@test.com', user2: 'bob@test.com' });

    expect(res.status).toBe(403);
  });

  it('a participant can read their own thread', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    await createUser({ email: 'bob@test.com' });

    await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', 'bob@test.com')
      .field('message', 'hello');

    const res = await request
      .get('/chat/messages')
      .query({ sender: 'alice@test.com', receiver: 'bob@test.com' })
      .set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(1);
  });

  it('the sender is the signed-in user, not the body field', async () => {
    const mallory = await createSignedInUser(request, { email: 'mallory@test.com' });
    await createUser({ email: 'bob@test.com' });

    const res = await request
      .post('/chat/message')
      .set('Authorization', mallory.auth)
      .field('sender', 'alice@test.com')
      .field('receiver', 'bob@test.com')
      .field('message', 'impersonation');

    expect(res.status).toBe(201);
    expect(res.body.sender).toBe('mallory@test.com');
  });
});
