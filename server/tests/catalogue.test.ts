/**
 * The browse page used to fetch every listing in the database and then filter,
 * sort and paginate them in the browser. It worked, in the sense that a shop
 * with six books works: every visitor downloaded the whole catalogue to look
 * at twelve of it, and the bill grew with each book added.
 *
 * These pin the filtering, ordering and paging now that MongoDB does it.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook } from './helpers/factories.js';
import AddBook from '../models/AddBook.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

/** Distinct enough to tell apart in an assertion. */
const book = (title: string, overrides = {}) =>
  createBook({ title, isbn: title, ...overrides });

const titles = (body: { items: { title: string }[] }): string[] =>
  body.items.map((item) => item.title);

describe('a page of the catalogue', () => {
  it('sends one page, and says how many there are', async () => {
    for (let i = 0; i < 15; i += 1) await book(`Book ${String(i).padStart(2, '0')}`);

    const res = await request.get('/filter/booklist?pageSize=10');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(10);
    expect(res.body.total).toBe(15);
    expect(res.body.pageCount).toBe(2);
    expect(res.body.page).toBe(1);
  });

  it('sends the rest on the next one, with no book on both', async () => {
    for (let i = 0; i < 15; i += 1) await book(`Book ${String(i).padStart(2, '0')}`);

    const first = await request.get('/filter/booklist?pageSize=10&page=1');
    const second = await request.get('/filter/booklist?pageSize=10&page=2');

    expect(second.body.items).toHaveLength(5);
    // Ties in the sort field are broken by `_id`, or a book could appear on
    // both pages while another appeared on neither.
    expect(new Set([...titles(first.body), ...titles(second.body)]).size).toBe(15);
  });

  it('is empty rather than an error past the last page', async () => {
    await book('Only One');

    const res = await request.get('/filter/booklist?page=9');

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(0);
    expect(res.body.total).toBe(1);
  });
});

describe('what it filters on', () => {
  it('a search, across title and author', async () => {
    await book('Pather Panchali', { author: 'Bibhutibhushan' });
    await book('Something Else', { author: 'Pather Nobody' });
    await book('Unrelated', { author: 'Nobody' });

    const res = await request.get('/filter/booklist?search=pather');

    // Somebody typing one word into one box means either field.
    expect(res.body.total).toBe(2);
  });

  it('book type', async () => {
    await book('A New One', { bookType: 'new' });
    await book('A Used One', { bookType: 'old', condition: 'good' });

    const res = await request.get('/filter/booklist?bookType=old');

    expect(titles(res.body)).toEqual(['A Used One']);
  });

  it('category, whatever case it was stored in', async () => {
    // The seed writes 'fiction'; the Add Book form writes 'Fiction'. The page
    // used to lower-case both sides in the browser, and filtering here has to
    // match that or half the catalogue disappears.
    await book('Lower', { category: ['fiction'] });
    await book('Upper', { category: ['Fiction'] });
    await book('Other', { category: ['science'] });

    const res = await request.get('/filter/booklist?category=FICTION');

    expect(res.body.total).toBe(2);
  });

  it('several categories at once, as an or', async () => {
    await book('One', { category: ['fiction'] });
    await book('Two', { category: ['science'] });
    await book('Three', { category: ['history'] });

    const res = await request.get('/filter/booklist?category=fiction&category=science');

    expect(res.body.total).toBe(2);
  });

  it('a price range', async () => {
    await book('Cheap', { price: 100 });
    await book('Middling', { price: 500 });
    await book('Dear', { price: 2000 });

    const res = await request.get('/filter/booklist?minPrice=200&maxPrice=1000');

    expect(titles(res.body)).toEqual(['Middling']);
  });

  it('a rating floor, not an exact score', async () => {
    await book('Loved', { ratingAverage: 4.8, ratingCount: 9 });
    await book('Fine', { ratingAverage: 4.0, ratingCount: 3 });
    await book('Poor', { ratingAverage: 2.5, ratingCount: 2 });

    const res = await request.get('/filter/booklist?rating=4');

    // Ticking four stars means "four and up", not "exactly four".
    expect(res.body.total).toBe(2);
  });

  it('stock, when asked', async () => {
    await book('In Stock', { stock: 3 });
    await book('Sold Out', { stock: 0 });

    expect((await request.get('/filter/booklist?inStock=1')).body.total).toBe(1);
    expect((await request.get('/filter/booklist')).body.total).toBe(2);
  });

  it('several filters together', async () => {
    await book('Wanted', { bookType: 'old', condition: 'good', price: 300, stock: 2 });
    await book('Too dear', { bookType: 'old', condition: 'good', price: 3000, stock: 2 });
    await book('Wrong type', { bookType: 'new', price: 300, stock: 2 });

    const res = await request.get('/filter/booklist?bookType=old&condition=good&maxPrice=1000&inStock=1');

    expect(titles(res.body)).toEqual(['Wanted']);
  });
});

describe('how it orders', () => {
  const stocked = async () => {
    await book('Cheapest', { price: 100, ratingAverage: 3, ratingCount: 40 });
    await book('Middle', { price: 500, ratingAverage: 5, ratingCount: 1 });
    await book('Dearest', { price: 900, ratingAverage: 4.5, ratingCount: 12 });
  };

  it('newest first by default', async () => {
    await stocked();

    const res = await request.get('/filter/booklist');

    expect(titles(res.body)[0]).toBe('Dearest');
  });

  it('price, both ways', async () => {
    await stocked();

    expect(titles((await request.get('/filter/booklist?sort=priceLowHigh')).body)[0]).toBe('Cheapest');
    expect(titles((await request.get('/filter/booklist?sort=priceHighLow')).body)[0]).toBe('Dearest');
  });

  it('rating, with the review count breaking the tie', async () => {
    await book('One five-star review', { ratingAverage: 5, ratingCount: 1 });
    await book('Forty five-star reviews', { ratingAverage: 5, ratingCount: 40 });

    const res = await request.get('/filter/booklist?sort=rated');

    // One five-star review is not a better recommendation than forty.
    expect(titles(res.body)[0]).toBe('Forty five-star reviews');
  });

  it('refuses an order it does not have', async () => {
    expect((await request.get('/filter/booklist?sort=cheapestSeller')).status).toBe(400);
  });
});

describe('the homepage strip', () => {
  it('shows a title once, however many sellers list it', async () => {
    await book('Common Textbook', { sellerEmail: 'a@test.com' });
    await book('Common Textbook', { sellerEmail: 'b@test.com', isbn: 'Common Textbook 2' });
    await book('Something Else', { sellerEmail: 'c@test.com' });

    const res = await request.get('/filter/featured');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
  });

  it('counts a new and a second-hand copy as different books', async () => {
    // They are: different price, different condition, different decision.
    await book('Same Title', { bookType: 'new' });
    await book('Same Title', { bookType: 'old', condition: 'good', isbn: 'Same Title 2' });

    expect((await request.get('/filter/featured')).body).toHaveLength(2);
  });

  it('sends only as many as asked for', async () => {
    for (let i = 0; i < 12; i += 1) await book(`Book ${String(i)}`);

    expect((await request.get('/filter/featured?limit=4')).body).toHaveLength(4);
  });

  it('carries cover addresses, not the bytes', async () => {
    const created = await book('Illustrated');

    const res = await request.get('/filter/featured');

    expect(res.body[0].images[0]).toBe(`/api/book/${String(created._id)}/cover/0`);
    expect(JSON.stringify(res.body)).not.toContain('base64');
  });
});

/**
 * Paging is only worth having if the database is paging too.
 *
 * The first version of these indexes left `_id` off the end. The catalogue
 * sorts by `{ <field>, _id }` so that books which tie cannot shuffle between
 * pages, and a sort is only served by an index when it is a prefix of that
 * index's keys - so every query scanned the whole collection and sorted the
 * lot in memory. Every test still passed, because the answers were right.
 */
describe('how the database answers', () => {
  const plan = async (filter: Record<string, unknown>, sort: Record<string, 1 | -1>) => {
    await AddBook.syncIndexes();

    const explained = (await AddBook.find(filter)
      .sort(sort)
      .limit(12)
      .explain('executionStats')) as unknown as {
      queryPlanner: { winningPlan: unknown };
      executionStats: { totalDocsExamined: number };
    };

    const winning = JSON.stringify(explained.queryPlanner.winningPlan);
    return {
      index: /"indexName":"([^"]+)"/.exec(winning)?.[1] ?? null,
      sortedInMemory: winning.includes('"stage":"SORT"'),
      examined: explained.executionStats.totalDocsExamined,
    };
  };

  const fill = async () => {
    for (let i = 0; i < 60; i += 1) {
      await book(`Book ${String(i).padStart(3, '0')}`, {
        price: 100 + i,
        ratingAverage: (i % 5) + 1,
        ratingCount: i,
        bookType: i % 2 === 0 ? 'new' : 'old',
        condition: i % 2 === 0 ? undefined : 'good',
      });
    }
  };

  it('reads a page, not the collection, for every order the page offers', async () => {
    await fill();

    const orders: Record<string, 1 | -1>[] = [
      { createdAt: -1, _id: -1 },
      { price: 1, _id: -1 },
      { ratingAverage: -1, ratingCount: -1, _id: -1 },
    ];

    for (const sort of orders) {
      const result = await plan({}, sort);

      expect(result.index).not.toBeNull();
      expect(result.sortedInMemory).toBe(false);
      // Twelve, give or take: never the sixty that are there.
      expect(result.examined).toBeLessThanOrEqual(20);
    }
  });

  it('and for the one filter narrow enough to be indexed with it', async () => {
    await fill();

    const result = await plan({ bookType: 'old' }, { createdAt: -1, _id: -1 });

    expect(result.index).toBe('bookType_1_createdAt_-1__id_-1');
    expect(result.sortedInMemory).toBe(false);
  });
});
