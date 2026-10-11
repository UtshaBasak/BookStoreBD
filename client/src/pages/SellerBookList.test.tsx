/**
 * "Save All Changes" sends each new price and stock separately. It used to
 * report success whatever the server answered; a refused change now stays in
 * the table, and the seller is told.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';

import SellerBookList from './SellerBookList.js';
import { setSession } from '../utils/auth.js';

const BOOK = {
  _id: 'book-1',
  title: 'Pather Panchali',
  author: 'Bibhutibhushan Bandyopadhyay',
  category: ['Novels'],
  bookType: 'old',
  condition: 'good',
  pages: 352,
  price: 450,
  salePrice: 450,
  stock: 2,
  sellerEmail: 'seller@test.com',
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const stubFetch = (stockStatus: number) => {
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/book/update-stock/')) return Promise.resolve(json({ message: 'Stock must be 0 or more' }, stockStatus));
      if (url.includes('/book/update-price/')) return Promise.resolve(json({ message: 'Price updated', book: BOOK }));
      if (url.includes('/book/requests/mine')) return Promise.resolve(json({}));
      if (url.includes('/book/seller/')) return Promise.resolve(json([BOOK]));
      return Promise.resolve(json({}));
    })
  );
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter>
          <SellerBookList />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
};

const editAndSave = async () => {
  await screen.findAllByText('Pather Panchali');
  await userEvent.type(screen.getByLabelText('New price for Pather Panchali'), '400');
  await userEvent.type(screen.getByLabelText('New stock for Pather Panchali'), '3');
  await userEvent.click(screen.getByRole('button', { name: /save all changes/i }));
};

beforeEach(() => {
  setSession({ token: 'a-token', user: { email: 'seller@test.com' } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('saving prices and stock', () => {
  it('says so when everything was saved', async () => {
    stubFetch(200);
    renderPage();

    await editAndSave();

    expect(await screen.findByText('All changes saved.')).toBeInTheDocument();
  });

  it('keeps what the server refused, and says how many books need another look', async () => {
    stubFetch(400);
    renderPage();

    await editAndSave();

    expect(await screen.findByText('1 book could not be saved. Check the values and try again.')).toBeInTheDocument();
    expect(screen.queryByText('All changes saved.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('New stock for Pather Panchali')).toHaveValue(3);
  });
});
