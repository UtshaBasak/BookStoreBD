import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaFlag, FaReply, FaSearch, FaStar, FaTrashAlt } from 'react-icons/fa';

import type { Id } from '@shared/api.js';

import { useAllReviews, useRemoveReview, type ReviewKind } from '../../hooks/queries.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { useToast } from '../../hooks/useToast.js';
import { messageOf } from '../../utils/apiError.js';
import Pager from '../../components/Pager.js';
import { Stars } from '../../components/Stars.js';
import { FilterSelect, RefreshButton, ReviewKindTabs } from './AdminControls.js';
import { reviewSubject, useReviewKind } from './reviewKind.js';
import '../AdminPanel.css';

const PAGE_SIZE = 25;

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
  { value: 'ratingHigh', label: 'Highest rating' },
  { value: 'ratingLow', label: 'Lowest rating' },
  { value: 'mostReported', label: 'Most reported' },
];
const STARS = [
  { value: '', label: 'Any stars' },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${'★'.repeat(n)} (${n})` })),
];
const YES_NO = (any: string, yes: string, no: string) => [
  { value: '', label: any },
  { value: 'yes', label: yes },
  { value: 'no', label: no },
];

const when = (value?: string): string =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

/**
 * Every review in the shop, for the administrator.
 *
 * Reported Reviews is the queue of what somebody objected to; this is the
 * rest of the picture - what buyers are saying about which books and sellers,
 * whether sellers answer, and the reviews nobody has reported yet.
 */
export default function AllReviews() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('newest');
  const [rating, setRating] = useState('');
  const [replied, setReplied] = useState('');
  const [reported, setReported] = useState('');
  const [page, setPage] = useState(1);
  const settled = useDebounced(search);
  const [kind, setKind] = useReviewKind();

  const { data, isPending, isFetching, error, refetch } = useAllReviews<ReviewKind>(
    {
      search: settled || undefined,
      page,
      pageSize: PAGE_SIZE,
      filters: { sort, rating, replied, reported },
    },
    {},
    kind
  );
  const { mutateAsync: remove } = useRemoveReview(kind);

  // Any change but the page starts again from the first one.
  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };

  const deleteReview = async (targetId: Id, reviewerEmail: string) => {
    const whose = kind === 'seller' ? "the seller's" : "the book's";
    // eslint-disable-next-line no-alert -- removing somebody's words needs a yes
    if (!window.confirm(`Remove this review? It no longer counts towards ${whose} score.`)) return;
    try {
      toast.success((await remove({ targetId, reviewerEmail })).message);
    } catch (err) {
      toast.error(messageOf(err) || 'Could not remove that review.');
    }
  };

  const reviews = data?.items ?? [];

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaStar />
            </span>
            Reviews
          </h2>
          <p className="admin-lede">Every review buyers have written. Reported ones are also in Reported Reviews.</p>
        </div>
        <RefreshButton onClick={() => void refetch()} busy={isFetching} />
      </header>

      <div className="admin-toolbar">
        <ReviewKindTabs
          kind={kind}
          onChange={(next) => {
            setKind(next);
            setPage(1);
          }}
        />
        <div className="admin-search">
          <FaSearch className="admin-search-icon" aria-hidden="true" />
          <input
            name="q"
            type="text"
            className="field"
            placeholder={`Search words, reviewer or ${kind === 'seller' ? 'seller' : 'book'}...`}
            aria-label="Search reviews"
            value={search}
            onChange={(e) => change(setSearch)(e.target.value)}
          />
        </div>
        <FilterSelect name="sort" label="Sort" value={sort} onChange={change(setSort)} options={SORTS} />
        <FilterSelect name="rating" label="Stars" value={rating} onChange={change(setRating)} options={STARS} />
        <FilterSelect
          name="replied"
          label="Seller reply"
          value={replied}
          onChange={change(setReplied)}
          options={YES_NO('Any', 'Answered', 'Not answered')}
        />
        <FilterSelect
          name="reported"
          label="Reports"
          value={reported}
          onChange={change(setReported)}
          options={YES_NO('Any', 'Reported', 'Not reported')}
        />
      </div>

      {isPending ? (
        <div className="admin-loading">Loading...</div>
      ) : error ? (
        <div className="admin-alert">Error: {error.message}</div>
      ) : reviews.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">
            ⭐
          </span>
          <p>{settled || rating || replied || reported ? 'No review matches.' : 'No reviews yet.'}</p>
        </div>
      ) : (
        <ul className="admin-reviews">
          {reviews.map((review) => {
            const subject = reviewSubject(review);
            return (
              <li key={review._id} className="admin-card admin-review">
                <div className="admin-review-head">
                  <span className="admin-avatar" aria-hidden="true">
                    {review.reviewerName ? review.reviewerName.charAt(0) : '?'}
                  </span>
                  <div style={{ minWidth: 0, flex: '1 1 180px' }}>
                    <strong style={{ color: 'var(--color-ink)' }}>{review.reviewerName}</strong>
                    <div className="admin-cell-muted" style={{ overflowWrap: 'anywhere' }}>
                      <span>{review.reviewerEmail}</span>
                      {' · '}
                      <span className="admin-nowrap">{when(review.createdAt)}</span>
                    </div>
                  </div>
                  <Stars value={review.rating} size={14} />
                  {(review.flagCount ?? 0) > 0 && (
                    <span className="badge admin-status is-bad">
                      <FaFlag aria-hidden="true" />
                      {review.flagCount} report{review.flagCount === 1 ? '' : 's'}
                    </span>
                  )}
                </div>

                <div className="admin-review-quote">
                  <p className="admin-cell-muted" style={{ margin: '0 0 4px' }}>
                    {subject.prefix} <Link to={subject.to}>{subject.label}</Link>
                  </p>
                  {review.title && <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--color-ink)' }}>{review.title}</p>}
                  {review.body && <p style={{ margin: 0, whiteSpace: 'pre-line', color: 'var(--color-ink-soft)' }}>{review.body}</p>}
                </div>

                {review.reply && (
                  <div className="admin-reasons">
                    <strong>
                      <FaReply aria-hidden="true" /> {review.reply.byName} replied:
                    </strong>
                    <p style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>{review.reply.body}</p>
                  </div>
                )}

                <div className="admin-review-actions">
                  <Link to={subject.to} className="btn btn-ghost">
                    View on {subject.page}
                  </Link>
                  <button type="button" className="btn btn-danger" onClick={() => void deleteReview(subject.targetId, review.reviewerEmail)}>
                    <FaTrashAlt aria-hidden="true" />
                    Remove the review
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && (
        <div className="admin-pager">
          <Pager page={data.page} pageCount={data.pageCount} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} noun="reviews" />
        </div>
      )}
    </div>
  );
}
