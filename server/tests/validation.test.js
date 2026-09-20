import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser, PASSWORD } from './helpers/factories.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('error shape', () => {
  it('reports every problem at once, not just the first', async () => {
    const res = await request.post('/auth/signup').send({ username: 'a', email: 'nope', password: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors.length).toBeGreaterThan(1);
  });

  it('names the field that failed, prefixed with its section', async () => {
    const res = await request.post('/auth/signin').send({ email: 'not-an-email', password: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ path: 'body.email' })
    );
  });

  it('reports a missing body field rather than throwing', async () => {
    const res = await request.post('/auth/signin').send({});

    expect(res.status).toBe(400);
    expect(res.body.errors.map((e) => e.path)).toEqual(
      expect.arrayContaining(['body.email', 'body.password'])
    );
  });
});

describe('parsed values reach the handler', () => {
  /**
   * Express 5 defines req.query as a getter, so a plain assignment to it is
   * silently dropped. If the middleware ever regresses to `req.query = parsed`,
   * validation would still pass but handlers would read raw values — which is
   * exactly the failure this test exists to catch.
   */
  it('uses the parsed query, not the raw one', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    await createUser({ email: 'bob@test.com' });

    await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', 'bob@test.com')
      .field('message', 'hello');

    // Mixed case and padding only match once the schema has trimmed and
    // lower-cased them.
    const res = await request
      .get('/chat/messages')
      .query({ sender: '  ALICE@test.com ', receiver: 'Bob@TEST.com', limit: '5' })
      .set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(5);
    expect(typeof res.body.limit).toBe('number');
    expect(res.body.messages).toHaveLength(1);
  });

  it('uses the parsed body', async () => {
    await createUser({ email: 'alice@test.com' });

    // Sign-in succeeds despite the padding and capitals, because the schema
    // normalises before the lookup.
    const res = await request
      .post('/auth/signin')
      .send({ email: '  ALICE@Test.com  ', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@test.com');
  });

  it('applies a default when a field is omitted', async () => {
    await createBook({ title: 'Some Book' });

    const res = await request.post('/filter/booklist_search').send({});

    expect(res.status).toBe(200);
  });
});

describe('type narrowing blocks injection', () => {
  const operator = { $ne: null };

  it('rejects an operator object where a string is expected', async () => {
    const res = await request.post('/auth/signin').send({ email: operator, password: operator });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
  });

  it('rejects an operator object where a number is expected', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const book = await createBook({ sellerEmail: 'seller@test.com' });

    const res = await request
      .put(`/book/update-stock/${book._id}`)
      .set('Authorization', seller.auth)
      .send({ stock: { $gt: 0 } });

    expect(res.status).toBe(400);
  });

  it('rejects an array where a number is expected', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const book = await createBook({ sellerEmail: 'seller@test.com' });

    // Number([]) is 0, so a bare coercion would have quietly zeroed the stock.
    const res = await request
      .put(`/book/update-stock/${book._id}`)
      .set('Authorization', seller.auth)
      .send({ stock: [] });

    expect(res.status).toBe(400);
  });

  it('rejects a filter field that is not on the whitelist', async () => {
    const res = await request
      .post('/filter/booklist_filter')
      .send({ filter_key: '$where', filter_input: '1 == 1' });

    expect(res.status).toBe(400);
  });
});

describe('identifier formats', () => {
  it('rejects a malformed object id before it reaches Mongoose', async () => {
    const res = await request.get('/book/not-an-object-id');

    expect(res.status).toBe(400);
    expect(res.body.errors[0].path).toBe('params.id');
  });

  it('rejects a malformed order number', async () => {
    const { auth } = await createSignedInUser(request);

    const res = await request.get('/order/lowercase-and-short').set('Authorization', auth);

    expect(res.status).toBe(400);
  });

  it('accepts a well-formed object id', async () => {
    const book = await createBook();

    const res = await request.get(`/book/${book._id}`);

    expect(res.status).toBe(200);
  });
});

describe('unknown fields are stripped', () => {
  it('a body cannot smuggle extra fields into the document', async () => {
    const { user, auth } = await createSignedInUser(request, { email: 'alice@test.com' });

    const res = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .send({ username: 'alice_updated', role: 'admin', _id: '000000000000000000000000' });

    expect(res.status).toBe(200);

    const User = (await import('../models/user.model.js')).default;
    const after = await User.findById(user._id);
    expect(after.username).toBe('alice_updated');
    // The privilege escalation attempt was dropped by the schema.
    expect(after.role).toBe('user');
  });
});

describe('bounds', () => {
  it('caps an oversized page size', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    await createUser({ email: 'bob@test.com' });

    const res = await request
      .get('/chat/messages')
      .query({ sender: 'alice@test.com', receiver: 'bob@test.com', limit: '100000' })
      .set('Authorization', alice.auth);

    expect(res.status).toBe(400);
  });

  it('rejects an empty order', async () => {
    const { auth } = await createSignedInUser(request);

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', auth)
      .send({ items: [] });

    expect(res.status).toBe(400);
  });

  it('rejects a non-positive quantity', async () => {
    const { auth } = await createSignedInUser(request);
    const book = await createBook();

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', auth)
      .send({ items: [{ bookId: String(book._id), quantity: 0 }] });

    expect(res.status).toBe(400);
  });
});
