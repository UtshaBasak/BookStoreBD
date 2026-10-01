import type { Id } from '@shared/api.js';

import Reviews from './Reviews.js';

/** A seller's ratings from their buyers, on their shop page. */
export default function SellerReviews({ sellerId }: { sellerId: Id | undefined }) {
  return <Reviews kind="seller" id={sellerId} />;
}
