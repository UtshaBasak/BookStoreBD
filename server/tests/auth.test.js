import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import { createUser, createSignedInUser, signIn, PASSWORD } from './helpers/factories.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('POST /auth/signin', () => {
  it('returns a token and the user for valid credentials', async () => {
    const user = await createUser({ email: 'alice@test.com' });

    const res = await request.post('/auth/signin').send({ email: user.email, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ email: 'alice@test.com', role: 'user' });
  });

  it('never returns the password hash', async () => {
    await createUser({ email: 'alice@test.com' });

    const res = await request.post('/auth/signin').send({ email: 'alice@test.com', password: PASSWORD });

    expect(JSON.stringify(res.body)).not.toContain('$2');
    expect(res.body.user.password).toBeUndefined();
  });

  it('rejects a wrong password', async () => {
    await createUser({ email: 'alice@test.com' });

    const res = await request.post('/auth/signin').send({ email: 'alice@test.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('rejects an unknown account', async () => {
    const res = await request.post('/auth/signin').send({ email: 'nobody@test.com', password: PASSWORD });

    expect(res.status).toBe(404);
  });

  it('promotes an account listed in ADMIN_EMAILS', async () => {
    await createUser({ email: 'admin@test.com' });

    const res = await request.post('/auth/signin').send({ email: 'admin@test.com', password: PASSWORD });

    expect(res.body.user.role).toBe('admin');
  });
});

describe('authentication is required', () => {
  // Each of these was reachable with no credentials at all before tokens
  // existed: the API trusted whatever identity the caller supplied.
  const protectedRoutes = [
    ['get', '/user', 'list every user'],
    ['get', '/order/admin/all', 'read every order'],
    ['get', '/cart', 'read a cart'],
    ['post', '/cart/clear', 'empty a cart'],
    ['get', '/wishlist', 'read a wishlist'],
    ['get', '/order/buyer', 'read order history'],
    ['get', '/chat/history/victim@test.com', 'read a conversation list'],
    ['post', '/order/decrease-stock', 'place an order'],
    ['put', '/user/profile', 'change a profile'],
  ];

  it.each(protectedRoutes)('%s %s -> 401 (%s)', async (method, path) => {
    const res = await request[method](path).send({});
    expect(res.status).toBe(401);
  });

  it('rejects a forged token', async () => {
    const res = await request.get('/cart').set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });

  it('rejects a token for an account that has since been deleted', async () => {
    const { user, auth } = await createSignedInUser(request);
    expect((await request.get('/cart').set('Authorization', auth)).status).toBe(200);

    const User = (await import('../models/user.model.js')).default;
    await User.findByIdAndDelete(user._id);

    expect((await request.get('/cart').set('Authorization', auth)).status).toBe(401);
  });
});

describe('public routes stay open', () => {
  const publicRoutes = ['/health', '/book', '/filter/booklist'];

  it.each(publicRoutes)('%s is reachable signed out', async (path) => {
    expect((await request.get(path)).status).toBe(200);
  });
});

describe('role enforcement', () => {
  it('a normal user cannot list users', async () => {
    const { auth } = await createSignedInUser(request);
    const res = await request.get('/user').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('a normal user cannot read every order', async () => {
    const { auth } = await createSignedInUser(request);
    const res = await request.get('/order/admin/all').set('Authorization', auth);
    expect(res.status).toBe(403);
  });

  it('an admin can list users', async () => {
    await createUser({ email: 'admin@test.com' });
    const token = await signIn(request, 'admin@test.com');
    const res = await request.get('/user').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  it('an admin cannot delete their own account', async () => {
    const admin = await createUser({ email: 'admin@test.com' });
    const token = await signIn(request, 'admin@test.com');

    const res = await request.delete(`/user/${admin._id}`).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
  });
});
