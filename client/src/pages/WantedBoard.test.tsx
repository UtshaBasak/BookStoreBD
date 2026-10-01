import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';

import WantedBoard from './WantedBoard.js';

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), off: vi.fn(), emit: vi.fn(), disconnect: vi.fn() }) }));

const PAGE = {
  items: [
    { _id: 'w1', title: 'Chander Pahar', author: 'Bibhutibhushan', isbn: '', details: '', count: 3, wantedByMe: false, status: 'open', foundBook: null, createdAt: '2026-01-01T00:00:00.000Z', foundAt: null },
  ],
  total: 1,
  page: 1,
  pageSize: 20,
  pageCount: 1,
};

const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

const show = (answer: unknown) => {
  const fetchMock = vi.fn<typeof fetch>((input, init) => {
    const url = String(input);
    if (init?.method === 'POST' && url.endsWith('/wanted')) return json(answer);
    if (url.includes('/wanted')) return json(PAGE);
    return json({ items: [], unread: 0, total: 0, page: 1, pageSize: 5, pageCount: 1 });
  });
  vi.stubGlobal('fetch', fetchMock);
  localStorage.setItem('authToken', 'header.eyJlbWFpbCI6ImFAYi5jIiwicm9sZSI6InVzZXIifQ.sig');
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SnackbarProvider>
        <MemoryRouter>
          <WantedBoard />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('the Wanted board', () => {
  it('lists what readers want, with a way to join and a way to list it', async () => {
    show({});
    expect(await screen.findByRole('heading', { name: 'Chander Pahar' })).toBeInTheDocument();
    expect(screen.getByLabelText('3 readers want this')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /have it\? list it/i })).toHaveAttribute('href', '/add-book?title=Chander+Pahar&author=Bibhutibhushan');
  });

  it('points to the listing when the book is in the shop already', async () => {
    show({ result: 'listed', message: 'In the shop', book: { _id: 'b1', title: 'Deyal' } });
    await userEvent.type(await screen.findByRole('textbox', { name: /title/i }), 'Deyal');
    await userEvent.click(screen.getByRole('button', { name: /ask for this book/i }));
    expect(await screen.findByRole('link', { name: 'See it' })).toHaveAttribute('href', '/book/b1');
  });
});
