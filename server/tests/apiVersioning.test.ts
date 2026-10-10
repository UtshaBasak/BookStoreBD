/**
 * /api/v1, the versioned API the Android app calls, beside the website's /api.
 *
 * The contract tests pin the fields the app reads from each response. v1 may
 * gain fields; if one of these is renamed or removed, installed apps break, so
 * the change belongs in /api/v2 instead (docs/API-VERSIONING.md).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUser, signIn } from './helpers/factories.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);
afterEach(() => {
  delete process.env.ANDROID_MIN_VERSION_CODE;
});

const BOOK_FIELDS = ['_id', 'title', 'author', 'price', 'images', 'stock', 'sellerEmail', 'bookType', 'category'];

describe('/api/v1', () => {
  it('answers exactly as /api does', async () => {
    const book = await createBook({ sellerEmail: 'seller@test.com' });
    for (const path of ['/filter/booklist?pageSize=20', `/book/${String(book._id)}`, '/filter/sections', '/filter/suggest?q=prog']) {
      const legacy = await request.get(`/api${path}`);
      const v1 = await request.get(`/api/v1${path}`);
      expect(v1.status, path).toBe(legacy.status);
      expect(v1.body, path).toEqual(legacy.body);
    }
  });

  it('leaves unknown paths a 404, under either prefix', async () => {
    expect((await request.get('/api/v1/no-such-thing')).status).toBe(404);
    expect((await request.get('/api/no-such-thing')).status).toBe(404);
  });

  it('does not offer the app endpoints under the unversioned prefix', async () => {
    expect((await request.get('/api/app/config')).status).toBe(404);
  });
});

describe('builds too old to serve', () => {
  it('are asked to update, with a code the app understands', async () => {
    process.env.ANDROID_MIN_VERSION_CODE = '10200';
    const res = await request.get('/api/v1/filter/booklist').set('X-Client', 'android/10105');
    expect(res.status).toBe(426);
    expect(res.body).toMatchObject({ code: 'app-update-required', minVersionCode: 10200 });
  });

  it('can still read the configuration that says where the update is', async () => {
    process.env.ANDROID_MIN_VERSION_CODE = '10200';
    const res = await request.get('/api/v1/app/config').set('X-Client', 'android/10105');
    expect(res.status).toBe(200);
  });

  it('do not include current builds, the website, or anyone while no minimum is set', async () => {
    process.env.ANDROID_MIN_VERSION_CODE = '10200';
    expect((await request.get('/api/v1/filter/booklist').set('X-Client', 'android/10200')).status).toBe(200);
    expect((await request.get('/api/v1/filter/booklist')).status).toBe(200);
    expect((await request.get('/api/filter/booklist').set('X-Client', 'android/1')).status).toBe(200);
    delete process.env.ANDROID_MIN_VERSION_CODE;
    expect((await request.get('/api/v1/filter/booklist').set('X-Client', 'android/1')).status).toBe(200);
  });
});

describe('the v1 contract the app relies on', () => {
  it('catalogue pages', async () => {
    await createBook();
    const { body } = await request.get('/api/v1/filter/booklist');
    expect(Object.keys(body)).toEqual(expect.arrayContaining(['items', 'total', 'page', 'pageSize', 'pageCount']));
    expect(Object.keys(body.items[0])).toEqual(expect.arrayContaining(BOOK_FIELDS));
  });

  it('book details', async () => {
    const book = await createBook();
    const { body } = await request.get(`/api/v1/book/${String(book._id)}`);
    expect(Object.keys(body)).toEqual(expect.arrayContaining([...BOOK_FIELDS, 'desc', 'publisher', 'isbn', 'relatedBooks']));
  });

  it('homepage shelves and search suggestions', async () => {
    await createBook();
    const sections = (await request.get('/api/v1/filter/sections')).body;
    expect(Object.keys(sections)).toEqual(
      expect.arrayContaining(['deals', 'trending', 'popular', 'bestsellers', 'topRated', 'budget', 'discover', 'writers', 'categories'])
    );
    const suggest = (await request.get('/api/v1/filter/suggest?q=prog')).body;
    expect(Object.keys(suggest)).toEqual(expect.arrayContaining(['books', 'sellers', 'authors', 'categories']));
  });

  it('cart, wishlist, orders and notifications', async () => {
    const user = await createUser();
    const token = await signIn(request, user.email);
    const auth = { Authorization: `Bearer ${token}` };

    expect(Array.isArray((await request.get('/api/v1/cart').set(auth)).body)).toBe(true);
    expect(Array.isArray((await request.get('/api/v1/wishlist').set(auth)).body)).toBe(true);
    const orders = (await request.get('/api/v1/order/buyer').set(auth)).body;
    expect(Object.keys(orders)).toEqual(expect.arrayContaining(['items', 'total', 'page', 'pageSize', 'pageCount']));
    const notifications = (await request.get('/api/v1/notification').set(auth)).body;
    expect(Object.keys(notifications)).toEqual(expect.arrayContaining(['items', 'unread', 'total']));
  });

  it('the website session endpoints, which the app does not use, are unchanged under /api', async () => {
    const user = await createUser();
    const res = await request.post('/api/auth/signin').send({ email: user.email, password: 'Tangerine-Lantern-42!' });
    expect(Object.keys(res.body).sort()).toEqual(['token', 'user']);
  });
});
