import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser, PASSWORD } from './helpers/factories.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('NoSQL injection', () => {
  // `{"email": {"$ne": null}}` used to make findOne match the first user in
  // the collection, which was a complete authentication bypass.
  it('cannot be used to sign in without a password', async () => {
    await createUser({ email: 'alice@test.com' });

    const res = await request
      .post('/auth/signin')
      .send({ email: { $ne: null }, password: { $ne: null } });

    expect(res.status).not.toBe(200);
    expect(res.body.token).toBeUndefined();
  });

  it('is rejected in a query string', async () => {
    const res = await request.get('/cart?email[$ne]=null');
    // No token at all, so authentication rejects it before anything else.
    expect(res.status).toBe(401);
  });

  it('cannot smuggle an operator through a whitelisted filter field', async () => {
    await createBook({ author: 'Bjarne Stroustrup' });

    const res = await request
      .post('/filter/booklist_filter')
      .send({ filter_key: 'author', filter_input: { $ne: null } });

    // Narrowed to a string, so it matches nothing rather than everything.
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(0);
  });

  it('rejects a filter field that is not whitelisted', async () => {
    const res = await request
      .post('/filter/booklist_filter')
      .send({ filter_key: '$where', filter_input: '1 == 1' });

    expect(res.status).toBe(400);
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
});

describe('regex handling in search', () => {
  it('treats metacharacters literally instead of throwing', async () => {
    await createBook({ title: 'The C++ Programming Language' });

    const res = await request.post('/filter/booklist_search').send({ search_input: 'C++' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
  });

  it('does not let a crafted pattern match everything', async () => {
    await createBook({ title: 'Some Book' });

    const res = await request.post('/filter/booklist_search').send({ search_input: '.*' });

    expect(res.body).toHaveLength(0);
  });
});

describe('prototype pollution', () => {
  // otpStore was a plain object keyed by a request-supplied e-mail, so
  // verifying an OTP for "__proto__" assigned straight onto Object.prototype.
  it('a __proto__ e-mail cannot reach Object.prototype', async () => {
    const res = await request.post('/auth/verify-otp').send({ email: '__proto__', code: '123456' });

    expect(res.status).toBe(400);
    expect({}.verified).toBeUndefined();
    expect(Object.prototype.verified).toBeUndefined();
  });

  it('a constructor key in a body is stripped before it reaches a handler', async () => {
    const res = await request
      .post('/auth/signin')
      .send({ email: 'x@test.com', password: PASSWORD, __proto__: { polluted: true } });

    expect({}.polluted).toBeUndefined();
    expect(res.status).toBe(404);
  });
});

describe('error responses', () => {
  it('do not leak a stack trace', async () => {
    const res = await request.get('/book/not-a-valid-object-id');

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(JSON.stringify(res.body)).not.toMatch(/at .*\.js:\d+/);
  });

  it('return a consistent shape for an unknown route', async () => {
    const res = await request.get('/no-such-route');

    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, statusCode: 404 });
  });
});

describe('user listing', () => {
  it('never includes password hashes', async () => {
    await createUser({ email: 'admin@test.com', role: 'admin' });
    const adminRes = await request
      .post('/auth/signin')
      .send({ email: 'admin@test.com', password: PASSWORD });

    const res = await request.get('/user').set('Authorization', `Bearer ${adminRes.body.token}`);

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('$2');
    for (const user of res.body) {
      expect(user.password).toBeUndefined();
    }
  });
});
