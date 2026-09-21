/**
 * The catalogue used to show "Rating: N/A" on every card and a star filter
 * that matched nothing, because no rating existed anywhere. These pin the
 * section that replaced it: who is offered the form, what a reader sees, and
 * that the badge only appears on a review somebody earned.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { SnackbarProvider } from 'notistack';

import type { ReviewSummary } from '@shared/api.js';

import BookReviews from './BookReviews.js';

const BOOK_ID = 'book-1';

const review = (overrides: Partial<ReviewSummary['reviews'][number]> = {}) => ({
  _id: 'r1',
  book: BOOK_ID,
  reviewerEmail: 'buyer@test.com',
  reviewerName: 'A Buyer',
  rating: 5,
  title: 'Excellent',
  body: 'Arrived quickly.',
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const summary = (overrides: Partial<ReviewSummary> = {}): ReviewSummary => ({
  average: 0,
  count: 0,
  distribution: [0, 0, 0, 0, 0],
  reviews: [],
  mine: null,
  canReview: false,
  reason: 'sign-in',
  ...overrides,
});

const show = (body: ReviewSummary) => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  );
  vi.stubGlobal('fetch', fetchMock);

  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SnackbarProvider>
        <MemoryRouter>
          <BookReviews bookId={BOOK_ID} />
        </MemoryRouter>
      </SnackbarProvider>
    </QueryClientProvider>
  );
  return fetchMock;
};

beforeEach(() => {
  localStorage.setItem('authToken', 'a-token');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a book with no reviews', () => {
  it('says so rather than showing an empty average', async () => {
    show(summary());

    // "Rating: N/A" under every price was the old answer to this.
    expect(await screen.findByText(/no reviews yet/i)).toBeInTheDocument();
  });
});

describe('a book with reviews', () => {
  it('shows the score, the count and the spread', async () => {
    show(
      summary({
        average: 4.3,
        count: 3,
        distribution: [0, 0, 1, 0, 2],
        reviews: [
          review(),
          review({ _id: 'r2', rating: 3, title: 'Good enough', reviewerName: 'Someone Else' }),
        ],
      })
    );

    expect(await screen.findByText('4.3')).toBeInTheDocument();
    expect(screen.getByText('3 reviews')).toBeInTheDocument();
    expect(screen.getByText('Excellent')).toBeInTheDocument();
    expect(screen.getByText('A Buyer')).toBeInTheDocument();
  });

  it('marks every review as a verified purchase', async () => {
    show(summary({ average: 5, count: 1, reviews: [review()] }));

    // The badge is the point of only letting buyers write one.
    expect(await screen.findByText(/verified purchase/i)).toBeInTheDocument();
  });
});

describe('who is offered the form', () => {
  it('nobody signed out, with a way to sign in', async () => {
    show(summary({ reason: 'sign-in' }));

    expect(await screen.findByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post review/i })).not.toBeInTheDocument();
  });

  it('not the seller of the book, and it says why', async () => {
    show(summary({ canReview: false, reason: 'own-listing' }));

    expect(await screen.findByText(/cannot review your own listing/i)).toBeInTheDocument();
  });

  it('not somebody who has not bought it, and it says why', async () => {
    show(summary({ canReview: false, reason: 'not-purchased' }));

    expect(await screen.findByText(/only somebody who has bought this book/i)).toBeInTheDocument();
  });

  it('a buyer who has not reviewed it yet', async () => {
    show(summary({ canReview: true, reason: null }));

    expect(await screen.findByRole('button', { name: /post review/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /your rating/i })).toBeInTheDocument();
  });
});

describe('writing one', () => {
  it('will not post without a star, and says so', async () => {
    const fetchMock = show(summary({ canReview: true, reason: null }));
    await screen.findByRole('button', { name: /post review/i });

    await userEvent.click(screen.getByRole('button', { name: /post review/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a star rating/i);
    // Nothing was sent.
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit)?.method === 'POST')).toHaveLength(0);
  });

  it('sends the rating and the words', async () => {
    const fetchMock = show(summary({ canReview: true, reason: null }));
    await screen.findByRole('button', { name: /post review/i });

    await userEvent.click(screen.getByRole('button', { name: '4 stars' }));
    await userEvent.type(screen.getByLabelText(/headline/i), 'Good value');
    await userEvent.click(screen.getByRole('button', { name: /post review/i }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit)?.method === 'POST'
      );
      expect(posts).toHaveLength(1);
      expect(JSON.parse(String((posts[0][1] as RequestInit).body))).toMatchObject({
        rating: 4,
        title: 'Good value',
      });
    });
  });

  it('offers an edit rather than a second review to somebody who already wrote one', async () => {
    show(
      summary({
        average: 3,
        count: 1,
        canReview: true,
        reason: null,
        mine: review({ rating: 3, title: 'It was fine' }),
        reviews: [review({ rating: 3, title: 'It was fine' })],
      })
    );

    expect(await screen.findByRole('button', { name: /edit your review/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /post review/i })).not.toBeInTheDocument();

    // And editing starts from what they said, not from an empty box.
    await userEvent.click(screen.getByRole('button', { name: /edit your review/i }));
    expect(screen.getByLabelText(/headline/i)).toHaveValue('It was fine');
  });
});
