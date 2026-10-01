import { useSearchParams } from 'react-router-dom';

import type { FlaggedReview, FlaggedSellerReview, Id } from '@shared/api.js';

import type { ReviewKind } from '../../hooks/queries.js';

/**
 * Which reviews an admin review page shows: book reviews, or seller ratings
 * with `?of=sellers`, so a notification can open the right one.
 */
export const useReviewKind = (): [ReviewKind, (kind: ReviewKind) => void] => {
  const [params, setParams] = useSearchParams();
  const kind: ReviewKind = params.get('of') === 'sellers' ? 'seller' : 'book';
  const setKind = (next: ReviewKind) => setParams(next === 'seller' ? { of: 'sellers' } : {}, { replace: true });
  return [kind, setKind];
};

/** What a review is about: a book, or a seller. */
export interface ReviewSubject {
  /** "on" a book, "about" a seller. */
  prefix: string;
  label: string;
  /** Where it is read, and what that page is called. */
  to: string;
  page: string;
  /** The id its removal is filed under. */
  targetId: Id;
}

export const reviewSubject = (review: FlaggedReview | FlaggedSellerReview): ReviewSubject =>
  'bookTitle' in review
    ? {
        prefix: 'on',
        label: `“${review.bookTitle}”`,
        to: `/book/${review.book}#reviews`,
        page: 'the book page',
        targetId: review.book,
      }
    : {
        prefix: 'about the seller',
        label: review.sellerName,
        to: `/shop/${encodeURIComponent(review.sellerName)}#ratings`,
        page: 'the shop page',
        targetId: review.seller,
      };
