import type { Id } from '@shared/api.js';

import Reviews from './Reviews.js';

/** A book's reviews, and the form for writing one. */
export default function BookReviews({ bookId }: { bookId: Id | undefined }) {
  return <Reviews kind="book" id={bookId} />;
}
