/**
 * The browse page used to fetch every listing in the database and filter, sort
 * and paginate them in the browser. These pin that the work is the API's now:
 * what matters is not that the right books appear - a stubbed response can say
 * anything - but that the page asks the right question.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';

import type { Book, CataloguePage } from '@shared/api.js';

import BookFilter from './Filter.js';

const BOOK = {
  _id: 'book-1',
  title: 'Pather Panchali',
  author: 'Bibhutibhushan Bandyopadhyay',
  price: 450,
  stock: 2,
  bookType: 'old',
  condition: 'fair',
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Book;

const page = (overrides: Partial<CataloguePage> = {}): CataloguePage => ({
  items: [BOOK],
  total: 1,
  page: 1,
  pageSize: 12,
  pageCount: 1,
  ...overrides,
});

/** Every catalogue request the page has made, newest last. */
let asked: string[];

const stubFetch = (body: CataloguePage = page()) => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/filter/booklist')) asked.push(url);

    return Promise.resolve(
      new Response(JSON.stringify(url.includes('/filter/booklist') ? body : []), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderAt = (search = '') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={[`/filter${search}`]}>
          <BookFilter />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
};

/** The most recent catalogue request, once one carrying `expected` arrives. */
const askedFor = async (expected: string): Promise<string> => {
  await waitFor(() => expect(asked.some((url) => url.includes(expected))).toBe(true));
  return asked.filter((url) => url.includes(expected)).at(-1) ?? '';
};

beforeEach(() => {
  asked = [];
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('what the page asks the API for', () => {
  it('a page, not the whole catalogue', async () => {
    stubFetch();
    renderAt();

    const url = await askedFor('/filter/booklist');

    expect(url).toContain('pageSize=12');
    // This is the whole point: the request is bounded.
    expect(url).not.toContain('pageSize=1000');
  });

  it('the search from the URL, so a search can be linked to', async () => {
    stubFetch();
    renderAt('?search=panchali');

    expect(await askedFor('search=panchali')).toContain('search=panchali');
  });

  it('a book type when one is chosen', async () => {
    stubFetch();
    renderAt();
    await screen.findByText('Pather Panchali');

    await userEvent.click(screen.getByRole('button', { name: 'OLD' }));

    expect(await askedFor('bookType=old')).toContain('bookType=old');
  });

  it('an order when one is chosen', async () => {
    stubFetch();
    renderAt();
    await screen.findByText('Pather Panchali');

    await userEvent.selectOptions(screen.getByTitle('Sort books'), 'priceLowHigh');

    expect(await askedFor('sort=priceLowHigh')).toContain('sort=priceLowHigh');
  });

  it('the next page when the pager is used', async () => {
    stubFetch(page({ total: 20, pageCount: 2 }));
    renderAt();
    await screen.findByText('Pather Panchali');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await askedFor('page=2')).toContain('page=2');
  });

  it('the first page again when a filter changes, not the page being viewed', async () => {
    stubFetch(page({ total: 20, pageCount: 2 }));
    renderAt();
    await screen.findByText('Pather Panchali');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    await askedFor('page=2');

    await userEvent.click(screen.getByRole('button', { name: 'OLD' }));

    // Page 2 of a filter nobody was using is a dead end, and often empty.
    const url = await askedFor('bookType=old');
    expect(url).not.toContain('page=2');
  });
});

describe('what it shows', () => {
  it('the count the API reported, not the number of cards on screen', async () => {
    stubFetch(page({ total: 20, pageCount: 2 }));
    renderAt();

    // One card is rendered; twenty books matched.
    expect(await screen.findByText(/of 20/)).toBeInTheDocument();
  });

  it('says so when nothing matched', async () => {
    stubFetch(page({ items: [], total: 0, pageCount: 1 }));
    renderAt();

    expect(await screen.findByText(/no book or author found/i)).toBeInTheDocument();
  });
});
