/**
 * The returns table used to download every photograph of every defect - they
 * are stored as base64 on the document - to draw a "View Images" button that
 * had no onClick and opened nothing.
 *
 * The pictures are addresses now, and the button works. It cannot be a plain
 * link: the endpoint is only open to an administrator or the buyer who
 * uploaded the photograph, and the session is in localStorage, so a new tab
 * would arrive without it.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';

import type { Page, ReturnRequest } from '@shared/api.js';

import ReturnManagement from './ReturnManagement.js';

const IMAGE_URL = '/api/return/requests/req-1/image/0';

const REQUEST = {
  _id: 'req-1',
  bookId: 'book-1',
  bookTitle: 'Pather Panchali',
  userEmail: 'buyer@test.com',
  sellerEmail: 'seller@test.com',
  defectDescription: 'Pages loose at the spine',
  images: [IMAGE_URL],
  status: 'pending',
  createdAt: '2026-01-01T00:00:00.000Z',
} as unknown as ReturnRequest;

const answer = (overrides: Partial<Page<ReturnRequest>> = {}): Page<ReturnRequest> => ({
  items: [REQUEST],
  total: 1,
  page: 1,
  pageSize: 25,
  pageCount: 1,
  ...overrides,
});

let asked: string[];

const stubFetch = (body: Page<ReturnRequest> = answer()) => {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    asked.push(url);

    if (url.includes('/image/')) {
      return Promise.resolve(
        new Response('png-bytes', { status: 200, headers: { 'Content-Type': 'image/png' } })
      );
    }
    return Promise.resolve(
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const renderPage = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <ReturnManagement />
      </SnackbarProvider>
    </QueryClientProvider>
  );
};

beforeEach(() => {
  asked = [];
  localStorage.setItem('authToken', 'a-token');
  vi.stubGlobal('open', vi.fn());
  URL.createObjectURL = vi.fn(() => 'blob:fake');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('what it asks for', () => {
  it('a page of requests, not all of them', async () => {
    stubFetch();
    renderPage();

    await waitFor(() => expect(asked.some((url) => url.includes('pageSize=25'))).toBe(true));
  });

  it('the search, once the typing settles', async () => {
    stubFetch();
    renderPage();
    await screen.findByText('Pather Panchali');

    await userEvent.type(screen.getByPlaceholderText(/search by book/i), 'panchali');

    await waitFor(() => expect(asked.some((url) => url.includes('search=panchali'))).toBe(true));
  });

  it('no photographs with the table', async () => {
    stubFetch();
    renderPage();
    await screen.findByText('Pather Panchali');

    expect(asked.some((url) => url.includes('/image/'))).toBe(false);
  });
});

describe('opening a photograph', () => {
  it('fetches it with the session rather than linking to it', async () => {
    stubFetch();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'View 1' }));

    // A plain <a href> would open a tab with no Authorization header, and the
    // endpoint would refuse it.
    await waitFor(() => expect(asked).toContain(IMAGE_URL));
    await waitFor(() =>
      expect(window.open).toHaveBeenCalledWith('blob:fake', '_blank', 'noopener')
    );
  });

  it('says so when it cannot be loaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/image/')) {
          return Promise.resolve(new Response('no', { status: 403 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify(answer()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        );
      })
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'View 1' }));

    expect(await screen.findByText(/could not load that image/i)).toBeInTheDocument();
    expect(window.open).not.toHaveBeenCalled();
  });
});

describe('what it shows', () => {
  it('the count the API reported', async () => {
    stubFetch(answer({ total: 120, pageCount: 5 }));
    renderPage();

    expect(await screen.findByText(/of 120 requests/)).toBeInTheDocument();
  });

  it('and says when a request has no photographs', async () => {
    stubFetch(answer({ items: [{ ...REQUEST, images: [] }] }));
    renderPage();

    expect(await screen.findByText('No images')).toBeInTheDocument();
  });
});
