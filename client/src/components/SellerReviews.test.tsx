/**
 * A seller's ratings on their shop page: the same section as a book's reviews,
 * worded for a seller and sent to /seller-review.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';

import type { SellerReviewSummary } from '@shared/api.js';

import SellerReviews from './SellerReviews.js';
import { setSession } from '../utils/auth.js';

const SELLER_ID = 'seller-1';

const summary = (overrides: Partial<SellerReviewSummary> = {}): SellerReviewSummary => ({
  average: 0,
  count: 0,
  distribution: [0, 0, 0, 0, 0],
  reviews: [],
  mine: null,
  canReview: false,
  reason: 'sign-in',
  isSeller: false,
  ...overrides,
});

const rating = {
  _id: 'r1',
  seller: SELLER_ID,
  sellerEmail: 'seller@test.com',
  reviewerEmail: 'buyer@test.com',
  reviewerName: 'A Buyer',
  rating: 4,
  title: 'Well packed',
  createdAt: '2026-01-01T00:00:00.000Z',
};

const show = (body: SellerReviewSummary) => {
  const fetchMock = vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  );
  vi.stubGlobal('fetch', fetchMock);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter>
          <SellerReviews sellerId={SELLER_ID} />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
  return fetchMock;
};

beforeEach(() => {
  setSession({ token: 'a-token' });
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a seller's ratings", () => {
  it('reads from /seller-review and shows the score and the buyers', async () => {
    const fetchMock = show(summary({ average: 4, count: 1, distribution: [0, 0, 0, 1, 0], reviews: [rating] }));

    expect(await screen.findByRole('heading', { name: /seller ratings/i })).toBeInTheDocument();
    expect(screen.getByText('1 rating')).toBeInTheDocument();
    expect(screen.getByText(/verified buyer/i)).toBeInTheDocument();
    expect(String(fetchMock.mock.calls[0][0])).toContain('/seller-review/seller-1');
  });

  it('says why the form is missing, in a seller’s terms', async () => {
    show(summary({ reason: 'not-purchased' }));
    expect(await screen.findByText(/only somebody who has bought from this seller/i)).toBeInTheDocument();
  });

  it('does not let a seller rate their own shop', async () => {
    show(summary({ reason: 'own-shop', isSeller: true }));
    expect(await screen.findByText(/cannot rate your own shop/i)).toBeInTheDocument();
  });

  it('lets the seller reply to a rating, or report it', async () => {
    show(summary({ average: 4, count: 1, reviews: [rating], reason: 'own-shop', isSeller: true }));

    expect(await screen.findByRole('button', { name: /^reply$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^report$/i })).toBeInTheDocument();
  });

  it('lets a buyer post a rating', async () => {
    const fetchMock = show(summary({ canReview: true, reason: null }));

    await userEvent.click(await screen.findByRole('button', { name: '5 stars' }));
    await userEvent.click(screen.getByRole('button', { name: /post rating/i }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');
      expect(posts).toHaveLength(1);
      expect(String(posts[0][0])).toContain('/seller-review/seller-1');
      expect(JSON.parse(String(posts[0][1]?.body))).toMatchObject({ rating: 5 });
    });
  });
});
