/**
 * An administrator can delete users and change any order's status, and nothing
 * recorded who did it. The request log captures the call, but it rotates and
 * cannot be queried - it is not where you answer "who deleted this account".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser, PASSWORD } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const trail = async () => (await import('../models/AuditLog.model.js')).default;

describe('what gets recorded', () => {
  it('an administrator deleting a user', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const victim = await createUser({ email: 'victim@test.com' });
    const AuditLog = await trail();

    await request.delete(`/user/${String(victim._id)}`).set('Authorization', admin.auth);

    const entry = await AuditLog.findOne({ action: 'user.delete' });
    expect(entry).not.toBeNull();
    expect(entry?.actorEmail).toBe('admin@test.com');
    expect(entry?.actorRole).toBe('admin');
    expect(entry?.targetId).toBe(String(victim._id));
    // The address is copied in, because the row has to still make sense once
    // the account it names no longer exists.
    expect((entry?.details as { email?: string })?.email).toBe('victim@test.com');
  });

  it('an order moving to a new status, and what it moved from', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const buyer = await createSignedInUser(request, { email: 'buyer@test.com' });
    const book = await createBook({ stock: 5 });
    const AuditLog = await trail();

    const created = await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .send({ items: [{ bookId: String(book._id), quantity: 1 }] });

    await request
      .patch(`/order/status/${created.body.orderNumber}`)
      .set('Authorization', admin.auth)
      .send({ status: 'Shipped' });

    const entry = await AuditLog.findOne({ action: 'order.status' });
    expect(entry?.actorEmail).toBe('admin@test.com');
    expect(entry?.targetId).toBe(created.body.orderNumber);
    expect(entry?.details).toMatchObject({ to: 'Shipped' });
  });

  it('somebody closing their own account', async () => {
    const user = await createSignedInUser(request, { email: 'leaving@test.com' });
    const AuditLog = await trail();

    await request.delete('/user/me').set('Authorization', user.auth).send({ password: PASSWORD });

    const entry = await AuditLog.findOne({ action: 'account.delete' });
    expect(entry?.actorEmail).toBe('leaving@test.com');
    // Written while there was still an actor to name, and it outlives them.
    expect(await AuditLog.countDocuments({})).toBe(1);
  });

  it('ties a row back to the request that caused it', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const victim = await createUser();
    const AuditLog = await trail();

    await request.delete(`/user/${String(victim._id)}`).set('Authorization', admin.auth);

    const entry = await AuditLog.findOne({});
    expect(entry?.requestId).toEqual(expect.any(String));
  });
});

describe('GET /audit', () => {
  it('is for administrators only', async () => {
    const user = await createSignedInUser(request);

    const res = await request.get('/audit').set('Authorization', user.auth);

    // It names who did what, which is exactly what should not be public.
    expect(res.status).toBe(403);
  });

  it('needs an account at all', async () => {
    expect((await request.get('/audit')).status).toBe(401);
  });

  it('returns the trail newest first', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    const first = await createUser({ email: 'first@test.com' });
    const second = await createUser({ email: 'second@test.com' });

    await request.delete(`/user/${String(first._id)}`).set('Authorization', admin.auth);
    await request.delete(`/user/${String(second._id)}`).set('Authorization', admin.auth);

    const res = await request.get('/audit').set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(2);
    expect((res.body.entries[0].details as { email: string }).email).toBe('second@test.com');
  });

  it('can be narrowed and paged', async () => {
    const admin = await createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });
    for (const email of ['a@test.com', 'b@test.com', 'c@test.com']) {
      const victim = await createUser({ email });
      await request.delete(`/user/${String(victim._id)}`).set('Authorization', admin.auth);
    }

    const page = await request
      .get('/audit?action=user.delete&limit=2&skip=1')
      .set('Authorization', admin.auth);

    expect(page.body.total).toBe(3);
    expect(page.body.entries).toHaveLength(2);
  });
});
