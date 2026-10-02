import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';

import type { ShopAnalytics as Stats } from '@shared/api.js';

import ShopAnalytics from './ShopAnalytics.js';

const busyHours = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
busyHours[4][21] = 6; // Friday, 9 pm

const STATS: Stats = {
  range: '30d',
  bucket: 'day',
  from: '2026-09-01T00:00:00.000Z',
  to: '2026-09-30T12:00:00.000Z',
  feePercent: 5,
  kpis: {
    revenue: { value: 12500, previous: 10000 },
    orders: { value: 25, previous: 25 },
    averageOrder: { value: 500, previous: 400 },
    copiesSold: { value: 31, previous: 40 },
    feesEarned: { value: 512.5, previous: 400 },
    feesPending: 40,
    newUsers: { value: 9, previous: 0 },
    newListings: { value: 14, previous: 10 },
  },
  series: [
    { date: '2026-09-29', revenue: 2000, orders: 4, signups: 1, listings: 2 },
    { date: '2026-09-30', revenue: 3000, orders: 5, signups: 2, listings: 1 },
  ],
  categories: [{ name: 'Fiction', revenue: 8000, copies: 20 }],
  busyHours,
  statuses: [{ status: 'Delivered', count: 20 }],
  bookTypes: [
    { type: 'new', revenue: 9000, copies: 20 },
    { type: 'old', revenue: 3500, copies: 11 },
  ],
  regions: [{ division: 'Dhaka', orders: 18 }],
  topBooks: [{ id: 'b1', title: 'Gitanjali', author: 'Rabindranath Tagore', copies: 7, revenue: 2100 }],
  topSellers: [{ email: 's@test.com', username: 'rahim_books', revenue: 6000, orders: 12 }],
  rates: { cancelled: 0.04, returned: 0.02, promo: 0.3 },
  searches: { total: 120, top: [{ term: 'tagore', count: 30 }], unmet: [{ term: 'rare atlas', count: 4 }] },
  wanted: { open: 3, foundInRange: 1, top: [{ id: 'w1', title: 'Rare Atlas', author: '', requesterCount: 5 }] },
  catalogue: { listings: 80, inStock: 70, views: 900, wishlists: 45, mostViewed: [] },
  people: { buyers: 50, sellers: 12 },
};

const show = () => {
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(STATS), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  );
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('authToken', 'a-token');
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/admin/analytics']}>
        <ShopAnalytics />
      </MemoryRouter>
    </QueryClientProvider>
  );
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the shop analytics', () => {
  it('shows the headline figures beside the period before', async () => {
    show();
    const sales = (await screen.findByText('Sales', { selector: '.sa-tile-label' })).closest('.sa-tile') as HTMLElement;
    expect(within(sales).getByText('৳12,500')).toBeInTheDocument();
    expect(within(sales).getByText(/Up 25% on the period before/)).toBeInTheDocument();
    expect(screen.getByText(/Fees earned \(5%\)/)).toBeInTheDocument();
    expect(screen.getByText('৳512.50')).toBeInTheDocument();
  });

  it('says what the figures mean', async () => {
    show();
    expect(await screen.findByText(/busiest hour is Friday at 9 pm/)).toBeInTheDocument();
    expect(screen.getByText(/“rare atlas” most often/)).toBeInTheDocument();
    expect(screen.getByText(/5 readers are waiting for “Rare Atlas”/)).toBeInTheDocument();
  });

  it('asks for another period when one is chosen', async () => {
    const fetchMock = show();
    await screen.findByText(/busiest hour/);
    await userEvent.click(screen.getByRole('radio', { name: '7 days' }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('range=7d'))).toBe(true));
  });

  it('keeps the numbers in a table as well as a chart', async () => {
    show();
    await userEvent.click(await screen.findByText('Show the numbers'));
    const table = screen.getByRole('table');
    expect(within(table).getByText('30 Sept')).toBeInTheDocument();
    expect(within(table).getByText('৳3,000')).toBeInTheDocument();
  });
});
