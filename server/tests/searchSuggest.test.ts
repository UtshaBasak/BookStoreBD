/**
 * The search box's suggestions: authors and categories beside the books, and
 * what people search for most before anything is typed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook } from './helpers/factories.js';
import SearchLog from '../models/SearchLog.model.js';
import { forgetCategoryCache } from '../controllers/filter.controller.js';
import { forgetPopularSearches } from '../utils/searchLog.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(async () => {
  await clearDatabase();
  forgetCategoryCache();
  forgetPopularSearches();
});

describe('search suggestions', () => {
  it('include matching authors and categories, with how many books each has', async () => {
    await createBook({ title: 'Deyal', author: 'Humayun Ahmed', category: ['Novels'], isbn: 'A1' });
    await createBook({ title: 'Himu', author: 'Humayun Ahmed', category: ['Novels'], isbn: 'A2' });
    await createBook({ title: 'Python Crash Course', author: 'Eric Matthes', category: ['Programming'], isbn: 'A3' });

    const authors = await request.get('/filter/suggest?q=humayun');
    expect(authors.body.authors).toEqual([{ name: 'Humayun Ahmed', books: 2 }]);

    const categories = await request.get('/filter/suggest?q=nov');
    expect(categories.body.categories).toEqual([{ name: 'Novels', books: 2 }]);
  });
});

describe('popular searches', () => {
  it('count catalogue searches that found something, most searched first', async () => {
    await createBook({ title: 'Deyal', author: 'Humayun Ahmed', isbn: 'B1' });
    for (const term of ['Deyal', 'deyal ', 'Humayun', 'nothing at all like this']) {
      await request.get(`/filter/booklist?search=${encodeURIComponent(term)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(await SearchLog.countDocuments({ term: 'deyal' })).toBe(2);
    const popular = await request.get('/filter/popular-searches');
    expect(popular.body.terms).toEqual(['deyal', 'humayun']);
  });
});
