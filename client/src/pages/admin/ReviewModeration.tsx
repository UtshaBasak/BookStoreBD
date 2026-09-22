import { useState } from 'react';

import type { Id } from '@shared/api.js';

import { useDismissFlags, useFlaggedReviews, useRemoveReview } from '../../hooks/queries.js';
import { useToast } from '../../hooks/useToast.js';
import { messageOf } from '../../utils/apiError.js';
import Pager from '../../components/Pager.js';
import { Stars } from '../../components/Stars.js';

/** Reports per page. */
const PAGE_SIZE = 25;

const when = (value?: string): string =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

/**
 * Reviews somebody has reported.
 *
 * Reporting hides nothing on its own - a review stays where it is and keeps
 * counting towards the score until somebody here decides otherwise. Anything
 * else would make "report" a button for removing an inconvenient review.
 *
 * Two decisions, and they are the whole page: the review is fine, so clear the
 * reports; or it is not, so remove it. Removing writes an audit row, because an
 * administrator deleting somebody's words is exactly what that trail is for.
 */
export default function ReviewModeration() {
  const [page, setPage] = useState(1);
  const toast = useToast();

  const query = useFlaggedReviews({ page, pageSize: PAGE_SIZE });
  const reviews = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = query.data?.pageCount ?? 1;
  const currentPage = query.data?.page ?? page;

  const { mutateAsync: dismiss } = useDismissFlags();
  const { mutateAsync: remove } = useRemoveReview();

  const clearReports = async (reviewId: Id) => {
    try {
      toast.success((await dismiss(reviewId)).message);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not clear those reports.');
    }
  };

  const deleteReview = async (bookId: Id, reviewerEmail: string) => {
    try {
      toast.success((await remove({ bookId, reviewerEmail })).message);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not remove that review.');
    }
  };

  if (query.isPending) return <div className="p-4">Loading...</div>;
  if (query.error) return <div className="p-4">Error: {query.error.message}</div>;

  return (
    <div className="admin-panel p-4">
      <h2 className="mb-4 text-2xl font-bold">Reported Reviews</h2>

      {reviews.length === 0 ? (
        <p>Nothing has been reported.</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {reviews.map((review) => (
            <li
              key={review._id}
              className="mb-4 rounded border p-4"
              style={{ borderColor: '#ddd', background: '#fff' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Stars value={review.rating} size={14} />
                <strong>{review.reviewerName}</strong>
                <span className="text-sm text-[#666]">{review.reviewerEmail}</span>
                <span className="text-sm text-[#888]">{when(review.createdAt)}</span>
                <span
                  className="rounded px-2 py-[2px] text-xs font-semibold"
                  style={{ background: '#ffebee', color: '#c62828' }}
                >
                  {review.flagCount} report{review.flagCount === 1 ? '' : 's'}
                </span>
              </div>

              <p className="mb-1 mt-2 text-sm text-[#555]">on “{review.bookTitle}”</p>
              {review.title && <p className="mb-1 font-semibold">{review.title}</p>}
              {review.body && <p className="m-0 whitespace-pre-line text-[#444]">{review.body}</p>}

              {review.reasons.length > 0 && (
                <div className="mt-2 text-sm">
                  <strong>What the reporters said:</strong>
                  <ul className="m-0 mt-1 pl-5">
                    {review.reasons.map((reason, index) => (
                      <li key={`${String(review._id)}-${String(index)}`}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="rounded px-3 py-2 text-white"
                  style={{ background: '#43a047', minHeight: 40 }}
                  onClick={() => void clearReports(review._id)}
                >
                  It is fine — clear the reports
                </button>
                <button
                  type="button"
                  className="rounded px-3 py-2 text-white"
                  style={{ background: '#c62828', minHeight: 40 }}
                  onClick={() => void deleteReview(review.book, review.reviewerEmail)}
                >
                  Remove the review
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Pager
        page={currentPage}
        pageCount={pageCount}
        pageSize={PAGE_SIZE}
        total={total}
        onPage={setPage}
        noun="reports"
      />
    </div>
  );
}
