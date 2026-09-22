/**
 * The user table used to fetch every account and search what it had in the
 * browser. These pin that it asks the API instead.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { AdminUserPage } from '@shared/api.js';

import UserManagement from './UserManagement.js';

const ROW = {
  _id: 'user-1',
  username: 'Ayesha Rahman',
  email: 'ayesha@test.com',
  role: 'user',
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as AdminUserPage['items'][number];

const answer = (overrides: Partial<AdminUserPage> = {}): AdminUserPage => ({
  items: [ROW],
  total: 1,
  page: 1,
  pageSize: 25,
  pageCount: 1,
  ...overrides,
});

let asked: string[];

const stubFetch = (body: AdminUserPage = answer()) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/user')) asked.push(url);
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
      <UserManagement />
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
  it('a page of accounts, not all of them', async () => {
    stubFetch();
    renderPage();

    expect(await askedFor('/user')).toContain('pageSize=25');
  });

  it('the search, once the typing settles', async () => {
    stubFetch();
    renderPage();
    await screen.findByText('Ayesha Rahman');

    await userEvent.type(screen.getByPlaceholderText(/search by username/i), 'ayesha');

    const url = await askedFor('search=ayesha');
    expect(url).toContain('search=ayesha');
    expect(asked.filter((each) => each.includes('search=')).length).toBeLessThan(6);
  });

  it('the next page when the pager is used', async () => {
    stubFetch(answer({ total: 60, pageCount: 3 }));
    renderPage();
    await screen.findByText('Ayesha Rahman');

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(await askedFor('page=2')).toContain('page=2');
  });
});

describe('what it shows', () => {
  it('the count the API reported, not the rows on screen', async () => {
    stubFetch(answer({ total: 60, pageCount: 3 }));
    renderPage();

    expect(await screen.findByText(/of 60/)).toBeInTheDocument();
  });

  it('says so when a search matches nothing', async () => {
    stubFetch(answer({ items: [], total: 0, pageCount: 1 }));
    renderPage();

    expect(await screen.findByText(/no account matches that search/i)).toBeInTheDocument();
  });
});
