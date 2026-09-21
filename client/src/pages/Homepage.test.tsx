/**
 * The most valuable of the toasts, tested through the page that shows it.
 *
 * A visitor who is not signed in taps "Add to Cart" on the homepage. What used
 * to happen was `alert('Please sign in to use cart.')`: a modal box, with no
 * way to sign in, at the exact moment somebody wanted to buy something.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { Book } from '@shared/api.js';

import Homepage from './Homepage.js';
import { keys } from '../hooks/queries.js';

// The page opens a socket on mount to count unread chats. Nothing here is
// about the socket, and a real one would try to reach a server.
vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }),
}));

const BOOK = {
  _id: 'book-1',
  title: 'The C++ Programming Language',
  author: 'Bjarne Stroustrup',
  price: 1200,
  stock: 5,
  bookType: 'new',
  images: [],
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as Book;

const renderHomepage = () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  // Seeded rather than fetched: the request is not what is being tested, and a
  // page with no books has no "Add to Cart" button to click.
  queryClient.setQueryData(keys.books, [BOOK]);

  return render(
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route path="/" element={<Homepage />} />
            <Route path="/sign-in" element={<h1>Sign in page</h1>} />
          </Routes>
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  // Signed out: `setup.ts` clears localStorage, which is where the session
  // lives. Any query that slips through should fail rather than reach out.
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network in tests')));
});

describe('the homepage, signed out', () => {
  it('offers a way to sign in when the cart is used', async () => {
    renderHomepage();

    await userEvent.click(await screen.findByRole('button', { name: 'Add to Cart' }));

    const toast = await screen.findByRole('alert');
    expect(toast).toHaveTextContent('Sign in to use your cart.');
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('takes the visitor there when they accept', async () => {
    renderHomepage();

    await userEvent.click(await screen.findByRole('button', { name: 'Add to Cart' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('heading', { name: 'Sign in page' })).toBeInTheDocument();
  });

  it('leaves the page usable while the message is up', async () => {
    renderHomepage();

    await userEvent.click(await screen.findByRole('button', { name: 'Add to Cart' }));
    await screen.findByRole('alert');

    // The book is still there to be clicked, which is the whole difference
    // between a toast and the modal box this replaced.
    expect(screen.getByText(BOOK.title)).toBeVisible();
  });
});
