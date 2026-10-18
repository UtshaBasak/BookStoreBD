/** Bought books: an empty search says nothing matched, not that nothing was bought. */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import BuyerBookList from './BuyerBookList.js';
import { setSession } from '../utils/auth.js';

beforeEach(() => {
  setSession({ token: 'a-token', user: { email: 'buyer@test.com', role: 'user' } });
  vi.stubGlobal(
    'fetch',
    vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 10, pageCount: 1 }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    )
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('bought books', () => {
  it('says a search matched nothing, rather than that nothing was bought', async () => {
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter>
          <BuyerBookList />
        </MemoryRouter>
      </QueryClientProvider>
    );
    expect(await screen.findByText('No books purchased yet.')).toBeInTheDocument();

    await userEvent.type(screen.getByPlaceholderText('Search by title, author, or seller...'), 'Aranyak');

    expect(await screen.findByText('No bought books match "Aranyak".', {}, { timeout: 3000 })).toBeInTheDocument();
  });
});
