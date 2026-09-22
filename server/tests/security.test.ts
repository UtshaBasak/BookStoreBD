import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser, PASSWORD } from './helpers/factories.js';

let request: PrefixedRequest;

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

  it('cannot smuggle an operator into a catalogue filter', async () => {
    await createBook({ author: 'Bjarne Stroustrup', title: 'The C++ Programming Language' });

    // Bracket notation is the usual way to build an object in a query string.
    // Express 5 parses queries with `querystring`, not `qs`, so this arrives
    // as a key literally named "search[$ne]" - an unknown parameter, which the
    // schema drops. The search is ignored rather than executed.
    const res = await request.get('/filter/booklist?search[$ne]=null');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('rejects an array where one value is expected', async () => {
    // The other way to get something that is not a string into a query
    // parameter: repeat it. `?search=a&search=b` is an array.
    const res = await request.get('/filter/booklist?search=a&search=b');

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors[0].path).toBe('query.search');
  });

  it('has no parameter that names a field to query', async () => {
    await createBook({ title: 'Some Book' });

    // The pair this replaced took `filter_key`, which put a document path in
    // the caller's hands and needed a whitelist to stay safe. Every filter is
    // its own named parameter now, so an unknown one is simply not a filter.
    const res = await request.get('/filter/booklist?$where=1%20%3D%3D%201&sellerEmail=x@y.z');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
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

    const res = await request.get('/filter/booklist?search=C%2B%2B');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('does not let a crafted pattern match everything', async () => {
    await createBook({ title: 'Some Book' });

    const res = await request.get('/filter/booklist?search=.*');

    expect(res.body.items).toHaveLength(0);
  });
});

describe('prototype pollution', () => {
  // otpStore was a plain object keyed by a request-supplied e-mail, so
  // verifying an OTP for "__proto__" assigned straight onto Object.prototype.
  it('a __proto__ e-mail cannot reach Object.prototype', async () => {
    const res = await request.post('/auth/verify-otp').send({ email: '__proto__', code: '123456' });

    expect(res.status).toBe(400);
    // Read through an index signature: the whole point is that these keys
    // should not exist, which is exactly what the declarations already say.
    expect(({} as Record<string, unknown>).verified).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).verified).toBeUndefined();
  });

  it('a constructor key in a body is stripped before it reaches a handler', async () => {
    const res = await request
      .post('/auth/signin')
      .send({ email: 'x@test.com', password: PASSWORD, __proto__: { polluted: true } });

    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    // 401 rather than 404: sign-in answers the same whether or not the address
    // is known here.
    expect(res.status).toBe(401);
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
