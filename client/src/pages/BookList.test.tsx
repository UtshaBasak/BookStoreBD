/**
 * The administrator's table used to fetch every listing and every user
 * account, then search what it had in the browser. These pin that it asks the
 * API instead, and that the seller's name arrives with the row.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { AdminBookPage } from '@shared/api.js';

import BookList from './BookList.js';

const ROW = {
  _id: 'book-1',
  title: 'Pather Panchali',
  author: 'Bibhutibhushan Bandyopadhyay',
  category: ['fiction'],
  bookType: 'old',
  condition: 'fair',
  pages: 352,
  price: 450,
  stock: 1,
  sellerEmail: 'shop@test.com',
  sellerName: 'Corner Shop',
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as AdminBookPage['items'][number];

const answer = (overrides: Partial<AdminBookPage> = {}): AdminBookPage => ({
  items: [ROW],
  total: 1,
  page: 1,
  pageSize: 25,
  pageCount: 1,
  ...overrides,
});

let asked: string[];

const stubFetch = (body: AdminBookPage = answer()) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/book/admin')) asked.push(url);
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    })
  );
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BookList />
    </QueryClientProvider>
  );
};

const askedFor = async (expected: string): Promise<string> => {
  await waitFor(() => expect(asked.some((url) => url.includes(expected))).toBe(true));
  return asked.filter((url) => url.includes(expected)).at(-1) ?? '';
};

beforeEach(() => {
  asked = [];
  localStorage.setItem('authToken', 'a-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('what it asks for', () => {
  it('a page of listings, not all of them', async () => {
    stubFetch();
    renderPage();

    expect(await askedFor('/book/admin')).toContain('pageSize=25');
  });

  it('nothing at all from the user list', async () => {
    stubFetch();
    renderPage();
    await screen.findByText('Pather Panchali');

    const calls = vi.mocked(fetch).mock.calls.map(([input]) => String(input));

    // The "Owner" column used to be filled by downloading every account.
    expect(calls.some((url) => url.includes('/user'))).toBe(false);
  });

  it('the search, once the typing settles', async () => {
    stubFetch();
    renderPage();
    await screen.findByText('Pather Panchali');

    await userEvent.type(screen.getByPlaceholderText(/search by title/i), 'panchali');

    const url = await askedFor('search=panchali');
    expect(url).toContain('search=panchali');
    // Debounced: eight keystrokes are not eight requests.
    expect(asked.filter((each) => each.includes('search=')).length).toBeLessThan(8);
  });

  it('the next page when the pager is used', async () => {
    stubFetch(answer({ total: 60, pageCount: 3 }));
    renderPage();
    await screen.findByText('Pather Panchali');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await askedFor('page=2')).toContain('page=2');
  });
});

describe('what it shows', () => {
  it("the seller's name that came with the row", async () => {
    stubFetch();
    renderPage();

    expect(await screen.findByText('Corner Shop')).toBeInTheDocument();
    expect(screen.queryByText('shop@test.com')).not.toBeInTheDocument();
  });

  it('the count the API reported', async () => {
    stubFetch(answer({ total: 60, pageCount: 3 }));
    renderPage();

    expect(await screen.findByText(/of 60/)).toBeInTheDocument();
  });

  it('says so when a search matches nothing', async () => {
    stubFetch(answer({ items: [], total: 0, pageCount: 1 }));
    renderPage();

    expect(await screen.findByText(/no listing matches that search/i)).toBeInTheDocument();
  });
});
