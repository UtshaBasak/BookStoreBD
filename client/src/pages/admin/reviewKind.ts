import { useSearchParams } from 'react-router-dom';

import type { FlaggedReview, FlaggedSellerReview, Id } from '@shared/api.js';

import type { ReviewKind } from '../../hooks/queries.js';
import { t } from '../../utils/language.js';

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
  /** Where it is read, and the link that goes there ("View on the book page"). */
  to: string;
  view: string;
  /** The id its removal is filed under. */
  targetId: Id;
}

export const reviewSubject = (review: FlaggedReview | FlaggedSellerReview): ReviewSubject =>
  'bookTitle' in review
    ? {
        prefix: t('on', 'বই:'),
        label: `“${review.bookTitle}”`,
        to: `/book/${review.book}#reviews`,
        view: t('View on the book page', 'বইয়ের পাতায় দেখুন'),
        targetId: review.book,
      }
    : {
        prefix: t('about the seller', 'বিক্রেতা:'),
        label: review.sellerName,
        to: `/shop/${encodeURIComponent(review.sellerName)}#ratings`,
        view: t('View on the shop page', 'শপের পাতায় দেখুন'),
        targetId: review.seller,
      };
