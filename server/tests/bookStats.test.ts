/**
 * How wanted a book is: views, once a person a day, and how many wishlists it
 * is on.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUserWithToken } from './helpers/factories.js';
import AddBook from '../models/AddBook.model.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const BROWSER = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36';
const view = (id: string, auth?: string, agent = BROWSER) => {
  const call = request.get(`/book/${id}`).set('User-Agent', agent);
  return auth ? call.set('Authorization', auth) : call;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 150));
const countsOf = async (id: string) => AddBook.findById(id, { viewCount: 1, wishlistCount: 1 }).lean();

describe('a book’s views', () => {
  it('count each reader once, but not the seller or a crawler', async () => {
    const seller = await createUserWithToken({ email: 'seller@test.com' });
    const reader = await createUserWithToken({ email: 'reader@test.com' });
    const id = String((await createBook({ sellerEmail: 'seller@test.com' }))._id);

    await view(id, reader.auth);
    await view(id, reader.auth);
    await view(id);
    await view(id, seller.auth);
    await view(id, undefined, 'Googlebot/2.1 (+http://www.google.com/bot.html)');
    await settle();

    expect((await countsOf(id))?.viewCount).toBe(2);
    expect((await view(id)).body.viewCount).toBe(2);
  });
});

describe('a book’s wishlist count', () => {
  it('follows people adding and removing it', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    const b = await createUserWithToken({ email: 'b@test.com' });
    const id = String((await createBook({ sellerEmail: 'seller@test.com' }))._id);

    await request.post(`/wishlist/add/${id}`).set('Authorization', a.auth);
    await request.post(`/wishlist/add/${id}`).set('Authorization', a.auth);
    await request.post(`/wishlist/add/${id}`).set('Authorization', b.auth);
    expect((await countsOf(id))?.wishlistCount).toBe(2);

    await request.post(`/wishlist/remove/${id}`).set('Authorization', b.auth);
    expect((await countsOf(id))?.wishlistCount).toBe(1);
  });
});
