/**
 * The contract between the Add Book form and this endpoint.
 *
 * "No. of Pages" carries no asterisk, and the form sends nothing at all when
 * it is left blank - but the schema required it, so every listing without a
 * page count came back 400 "Validation failed". The form promised one thing
 * and the API demanded another, and the only account of the disagreement was
 * a field path in a response body nobody displayed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

/** Every field the form sends for a new book, minus whatever a test omits. */
const listing = (overrides: Record<string, string> = {}) => ({
  title: 'Sicrets of Jainism',
  author: 'A Writer',
  // The form substitutes 'N/A' for the text fields left blank.
  publisher: 'N/A',
  country: 'N/A',
  language: 'N/A',
  isbn: 'N/A',
  desc: 'N/A',
  price: '300',
  bookType: 'new',
  category: 'Fiction',
  ...overrides,
});

const post = async (fields: Record<string, string>, auth: string) => {
  let req = request.post('/user/add-book').set('Authorization', auth);
  for (const [key, value] of Object.entries(fields)) req = req.field(key, value);
  return req;
};

describe('a listing with no page count', () => {
  it('is accepted, because the form does not ask for one', async () => {
    const { auth } = await createSignedInUser(request, { email: 'seller@test.com' });

    const res = await post(listing(), auth);

    expect(res.status).toBe(201);
    expect(res.body.book.title).toBe('Sicrets of Jainism');
    expect(res.body.book.pages).toBeUndefined();
  });

  it('keeps the count when one is given', async () => {
    const { auth } = await createSignedInUser(request, { email: 'seller@test.com' });

    const res = await post(listing({ pages: '272' }), auth);

    expect(res.status).toBe(201);
    expect(res.body.book.pages).toBe(272);
  });
});

describe('what is still refused', () => {
  it('a page count that is not a number', async () => {
    const { auth } = await createSignedInUser(request, { email: 'seller@test.com' });

    const res = await post(listing({ pages: 'about three hundred' }), auth);

    expect(res.status).toBe(400);
  });

  it('a listing with no title, and it says which field', async () => {
    const { auth } = await createSignedInUser(request, { email: 'seller@test.com' });

    const withoutTitle = Object.fromEntries(
      Object.entries(listing()).filter(([field]) => field !== 'title')
    ) as Record<string, string>;
    const res = await post(withoutTitle, auth);

    expect(res.status).toBe(400);
    // The page has no way to tell anyone what to fix unless this is here.
    expect(res.body.errors).toContainEqual(
      expect.objectContaining({ path: 'body.title' })
    );
  });
});
