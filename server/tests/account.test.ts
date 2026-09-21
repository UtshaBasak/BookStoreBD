/**
 * A user could not delete their own account and could not get a copy of their
 * data: articles 15 and 17 of the GDPR, and a plain trust signal anywhere else.
 * `DELETE /user/:id` existed but was administrator-only.
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

describe('GET /user/me/export', () => {
  it('hands back everything the account holds', async () => {
    const buyer = await createSignedInUser(request, { email: 'buyer@test.com' });
    const book = await createBook({ stock: 5 });
    await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth);
    await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .send({ items: [{ bookId: String(book._id), quantity: 1 }] });

    const res = await request.get('/user/me/export').set('Authorization', buyer.auth);

    expect(res.status).toBe(200);
    expect(res.body.account.email).toBe('buyer@test.com');
    expect(res.body.ordersPlaced).toHaveLength(1);
    expect(res.body.cart).toHaveLength(1);
    expect(res.body.exportedAt).toEqual(expect.any(String));
  });

  it('never includes the password hash', async () => {
    const user = await createSignedInUser(request);

    const res = await request.get('/user/me/export').set('Authorization', user.auth);

    expect(res.body.account.password).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('$2');
  });

  it('is a file to keep, not a page to read', async () => {
    const user = await createSignedInUser(request);

    const res = await request.get('/user/me/export').set('Authorization', user.auth);

    expect(res.headers['content-disposition']).toMatch(/attachment; filename="bookstorebd-export-/);
  });

  it('is the caller’s own data and nobody else’s', async () => {
    const alice = await createSignedInUser(request, { email: 'alice@test.com' });
    await createSignedInUser(request, { email: 'bob@test.com' });

    const res = await request.get('/user/me/export').set('Authorization', alice.auth);

    expect(res.body.account.email).toBe('alice@test.com');
    expect(JSON.stringify(res.body)).not.toContain('bob@test.com');
  });

  it('needs an account', async () => {
    const res = await request.get('/user/me/export');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /user/me', () => {
  it('asks for the password again', async () => {
    const user = await createSignedInUser(request);
    const User = (await import('../models/user.model.js')).default;

    const res = await request
      .delete('/user/me')
      .set('Authorization', user.auth)
      .send({ password: 'not-the-password' });

    // An access token lifted from a borrowed laptop should not be enough to
    // erase somebody's account. 403 rather than 401: the client reads a 401 as
    // an expired session and signs the caller out, and a typed password is not
    // a reason to end somebody's session.
    expect(res.status).toBe(403);
    expect(await User.countDocuments({})).toBe(1);
  });

  it('deletes the account when the password is right', async () => {
    const user = await createSignedInUser(request);
    const User = (await import('../models/user.model.js')).default;

    const res = await request
      .delete('/user/me')
      .set('Authorization', user.auth)
      .send({ password: PASSWORD });

    expect(res.status).toBe(200);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('takes the cart, the wishlist and the listings with it', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const book = await createBook({ sellerEmail: 'seller@test.com' });
    const other = await createBook({ sellerEmail: 'someone-else@test.com' });
    await request.post(`/cart/add/${String(other._id)}`).set('Authorization', seller.auth);
    await request.post(`/wishlist/add/${String(other._id)}`).set('Authorization', seller.auth);

    const AddBook = (await import('../models/AddBook.model.js')).default;
    const Cart = (await import('../models/Cart.model.js')).default;
    const Wishlist = (await import('../models/Wishlist.model.js')).default;

    await request.delete('/user/me').set('Authorization', seller.auth).send({ password: PASSWORD });

    expect(await Cart.countDocuments({})).toBe(0);
    expect(await Wishlist.countDocuments({})).toBe(0);
    // Their own listing goes; somebody else's is untouched.
    expect(await AddBook.findById(book._id)).toBeNull();
    expect(await AddBook.findById(other._id)).not.toBeNull();
  });

  it('keeps the orders and strips the person out of them', async () => {
    const buyer = await createSignedInUser(request, { email: 'buyer@test.com' });
    const book = await createBook({ stock: 5 });
    await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .send({
        items: [{ bookId: String(book._id), quantity: 1 }],
        contactName: 'A Buyer',
        contactPhone: '01711112222',
        deliveryAddress: '12 Test Road',
      });

    const Order = (await import('../models/Order.model.js')).default;

    await request.delete('/user/me').set('Authorization', buyer.auth).send({ password: PASSWORD });

    // The sale is an accounting record and the other side of it is somebody
    // else's history, so it stays - with every personal detail gone.
    const orders = await Order.find({});
    expect(orders).toHaveLength(1);
    expect(orders[0].buyerEmail).not.toBe('buyer@test.com');
    expect(orders[0].buyerEmail).toMatch(/@removed\.invalid$/);
    expect(orders[0].contactName).toBe('');
    expect(orders[0].contactPhone).toBe('');
    expect(orders[0].deliveryAddress).toBe('');
    // What was sold, and for how much, survives.
    expect(orders[0].title).toBe(book.title);
  });

  it('ends every session it had', async () => {
    const user = await createSignedInUser(request);
    const RefreshToken = (await import('../models/RefreshToken.model.js')).default;

    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBeGreaterThan(0);

    await request.delete('/user/me').set('Authorization', user.auth).send({ password: PASSWORD });

    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(0);
  });

  it('leaves no way back in', async () => {
    const user = await createSignedInUser(request, { email: 'gone@test.com' });

    await request.delete('/user/me').set('Authorization', user.auth).send({ password: PASSWORD });

    const res = await request.post('/auth/signin').send({ email: 'gone@test.com', password: PASSWORD });
    expect(res.status).toBe(401);
  });

  it('needs an account', async () => {
    const res = await request.delete('/user/me').send({ password: PASSWORD });
    expect(res.status).toBe(401);
  });
});
