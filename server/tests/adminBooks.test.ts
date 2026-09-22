/**
 * The administrator's book table used to fetch every listing in the database
 * and, to fill its "Owner" column, every user account as well - two unbounded
 * requests to draw twenty-five rows - and then search what it had in the
 * browser.
 *
 * It is a query now. These pin who may ask, what it searches, and that the
 * seller names come back with the page rather than from a second download.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createSignedInUser, createUser } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const asAdmin = () =>
  createSignedInUser(request, { email: 'admin@test.com', role: 'admin' });

const book = (title: string, overrides = {}) =>
  createBook({ title, isbn: title, ...overrides });

describe('who may read it', () => {
  it('not a visitor', async () => {
    expect((await request.get('/book/admin')).status).toBe(401);
  });

  it('not an ordinary account', async () => {
    const { auth } = await createSignedInUser(request, { email: 'seller@test.com' });

    expect((await request.get('/book/admin').set('Authorization', auth)).status).toBe(403);
  });

  it('an administrator', async () => {
    const { auth } = await asAdmin();

    expect((await request.get('/book/admin').set('Authorization', auth)).status).toBe(200);
  });
});

describe('what it sends', () => {
  it('one page, with the count of everything that matched', async () => {
    const { auth } = await asAdmin();
    for (let i = 0; i < 30; i += 1) await book(`Book ${String(i).padStart(2, '0')}`);

    const res = await request.get('/book/admin?pageSize=25').set('Authorization', auth);

    expect(res.body.items).toHaveLength(25);
    expect(res.body.total).toBe(30);
    expect(res.body.pageCount).toBe(2);
  });

  it('the seller name, resolved for this page', async () => {
    const { auth } = await asAdmin();
    await createUser({ email: 'shop@test.com', username: 'Corner Shop' });
    await book('Sold by the shop', { sellerEmail: 'shop@test.com' });

    const res = await request.get('/book/admin').set('Authorization', auth);

    // The column read a field called `name`, which no account has ever had, so
    // it silently showed the e-mail for everybody.
    expect(res.body.items[0].sellerName).toBe('Corner Shop');
  });

  it('the e-mail when there is no account behind it', async () => {
    const { auth } = await asAdmin();
    await book('Orphaned listing', { sellerEmail: 'gone@test.com' });

    const res = await request.get('/book/admin').set('Authorization', auth);

    expect(res.body.items[0].sellerName).toBe('gone@test.com');
  });

  it('cover addresses rather than the bytes', async () => {
    const { auth } = await asAdmin();
    const created = await book('Illustrated', {
      images: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
    });

    const res = await request.get('/book/admin').set('Authorization', auth);

    expect(res.body.items[0].images).toEqual([`/api/book/${String(created._id)}/cover/0`]);
  });

  it('newest first', async () => {
    const { auth } = await asAdmin();
    await book('Older');
    await book('Newer');

    const res = await request.get('/book/admin').set('Authorization', auth);

    expect(res.body.items[0].title).toBe('Newer');
  });
});

describe('what it searches', () => {
  const stock = async () => {
    await createUser({ email: 'shop@test.com', username: 'Corner Shop' });
    await book('Pather Panchali', { author: 'Bibhutibhushan', sellerEmail: 'shop@test.com' });
    await book('Clean Code', { author: 'Robert Martin', sellerEmail: 'other@test.com' });
  };

  it('the title', async () => {
    const { auth } = await asAdmin();
    await stock();

    const res = await request.get('/book/admin?search=panchali').set('Authorization', auth);

    expect(res.body.total).toBe(1);
  });

  it('the author', async () => {
    const { auth } = await asAdmin();
    await stock();

    const res = await request.get('/book/admin?search=martin').set('Authorization', auth);

    expect(res.body.total).toBe(1);
  });

  it("the seller's e-mail, which a shopper's search deliberately does not", async () => {
    const { auth } = await asAdmin();
    await stock();

    const mine = await request.get('/book/admin?search=shop@test.com').set('Authorization', auth);
    expect(mine.body.total).toBe(1);

    // The same search on the public catalogue finds nothing: "who put this
    // here" is an administrator's question, not a shop's search box.
    const shopper = await request.get('/filter/booklist?search=shop@test.com');
    expect(shopper.body.total).toBe(0);
  });

  it('treats a crafted pattern literally', async () => {
    const { auth } = await asAdmin();
    await stock();

    const res = await request.get('/book/admin?search=.*').set('Authorization', auth);

    expect(res.body.total).toBe(0);
  });
});

describe('what it refuses', () => {
  it('a page size big enough to be the whole database', async () => {
    const { auth } = await asAdmin();

    expect((await request.get('/book/admin?pageSize=5000').set('Authorization', auth)).status).toBe(400);
  });

  it('and "admin" is still read as a route, not as a book id', async () => {
    const { auth } = await asAdmin();

    // `/:id` is registered after this one; the other way round, the schema
    // would reject "admin" as an id and this endpoint would be unreachable.
    const res = await request.get('/book/admin').set('Authorization', auth);

    expect(res.status).toBe(200);
    expect(res.body.items).toBeDefined();
  });
});
