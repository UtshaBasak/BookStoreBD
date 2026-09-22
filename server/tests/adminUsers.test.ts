/**
 * The administrator's user table asked for every account with every field but
 * the password - and `profilePicture` is stored as a base64 data URI, so the
 * response carried every user's photograph, their address and their phone
 * number, to draw three columns: name, e-mail, and the date they joined.
 *
 * These pin the page it sends now, and that it sends nothing else.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser, createUser } from './helpers/factories.js';
import User from '../models/user.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const asAdmin = () => createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

const shopper = (n: number) =>
  createUser({ email: `user${String(n).padStart(2, '0')}@test.com`, username: `User ${String(n).padStart(2, '0')}` });

describe('who may read it', () => {
  it('not a visitor', async () => {
    expect((await request.get('/user')).status).toBe(401);
  });

  it('not an ordinary account', async () => {
    const { auth } = await createSignedInUser(request, { email: 'shopper@test.com' });

    expect((await request.get('/user').set('Authorization', auth)).status).toBe(403);
  });
});

describe('what it sends', () => {
  it('one page, with the count of everything that matched', async () => {
    const { auth } = await asAdmin();
    for (let i = 0; i < 30; i += 1) await shopper(i);

    const res = await request.get('/user?pageSize=25').set('Authorization', auth);

    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
    expect(res.body.pageCount).toBe(2);
  });

  it('the rest on the next page, with nobody on both', async () => {
    const { auth } = await asAdmin();
    for (let i = 0; i < 30; i += 1) await shopper(i);

    const first = await request.get('/user?pageSize=25&page=1').set('Authorization', auth);
    const second = await request.get('/user?pageSize=25&page=2').set('Authorization', auth);

    expect(second.body.items).toHaveLength(5);
    const emails = [...first.body.items, ...second.body.items].map((u: { email: string }) => u.email);
    expect(new Set(emails).size).toBe(30);
  });

  it('only the three columns the table draws', async () => {
    const { auth } = await asAdmin();
    await createUser({
      email: 'photographed@test.com',
      username: 'Has A Photo',
      profilePicture: 'data:image/png;base64,AAAAAAAAAAAAAAAAAAAA',
      address: '14 New Market, Dhaka',
      phone: '01710000001',
    });

    const res = await request.get('/user').set('Authorization', auth);
    const [row] = res.body.items;

    expect(row.username).toBe('Has A Photo');
    expect(row.email).toBe('photographed@test.com');
    expect(row.createdAt).toBeDefined();
    expect(row.profilePicture).toBeUndefined();
    expect(row.address).toBeUndefined();
    expect(row.phone).toBeUndefined();
    expect(row.password).toBeUndefined();
  });

  it('no administrators, because the only action here is Delete', async () => {
    const { auth } = await asAdmin();
    await createUser({ email: 'other-admin@test.com', role: 'admin' });
    await shopper(1);

    const res = await request.get('/user').set('Authorization', auth);

    // Filtered in the database rather than in the browser, so the count is the
    // count of what is actually shown.
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].email).toBe('user01@test.com');
  });
});

describe('what it searches', () => {
  const stock = async () => {
    await createUser({ email: 'ayesha@test.com', username: 'Ayesha Rahman' });
    await createUser({ email: 'rakib@example.org', username: 'Rakib Hasan' });
  };

  it('the username', async () => {
    const { auth } = await asAdmin();
    await stock();

    const res = await request.get('/user?search=ayesha').set('Authorization', auth);

    expect(res.body.total).toBe(1);
  });

  it('the e-mail, including the domain', async () => {
    const { auth } = await asAdmin();
    await stock();

    const res = await request.get('/user?search=example.org').set('Authorization', auth);

    // A search that reaches the database finds an account that is not on the
    // page being looked at, which the old in-browser filter could not.
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].username).toBe('Rakib Hasan');
  });

  it('treats a crafted pattern literally', async () => {
    const { auth } = await asAdmin();
    await stock();

    expect((await request.get('/user?search=.*').set('Authorization', auth)).body.total).toBe(0);
  });
});

describe('what it refuses', () => {
  it('a page size big enough to be every account there is', async () => {
    const { auth } = await asAdmin();

    expect((await request.get('/user?pageSize=9000').set('Authorization', auth)).status).toBe(400);
  });
});

/**
 * The first version of this filtered with `role: { $ne: 'admin' }`. An
 * inequality on the leading field of an index means the fields after it are no
 * longer in order, so the sort became a blocking one - `explain()` read every
 * key in the collection and sorted them in memory, while every test passed
 * because the answers were right.
 */
describe('how the database answers', () => {
  it('reads a page, not every account', async () => {
    await asAdmin();
    for (let i = 0; i < 60; i += 1) await shopper(i);
    await User.syncIndexes();

    const explained = (await User.find({ role: 'user' }, { username: 1, email: 1, createdAt: 1 })
      .sort({ createdAt: -1, _id: -1 })
      .limit(25)
      .explain('executionStats')) as unknown as {
      queryPlanner: { winningPlan: unknown };
      executionStats: { totalKeysExamined: number };
    };

    const winning = JSON.stringify(explained.queryPlanner.winningPlan);

    expect(/"indexName":"([^"]+)"/.exec(winning)?.[1]).toBe('role_1_createdAt_-1__id_-1');
    expect(winning.includes('"stage":"SORT"')).toBe(false);
    // Twenty-five, not the sixty that are there.
    expect(explained.executionStats.totalKeysExamined).toBeLessThanOrEqual(30);
  });
});
