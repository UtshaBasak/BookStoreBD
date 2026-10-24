import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCheck, FaFlag, FaSearch, FaTrashAlt } from 'react-icons/fa';

import type { Id } from '@shared/api.js';

import { useDismissFlags, useFlaggedReviews, useRemoveReview, type ReviewKind } from '../../hooks/queries.js';
import { useToast } from '../../hooks/useToast.js';
import { useDebounced } from '../../hooks/useDebounced.js';
import { FilterSelect, RefreshButton, ReviewKindTabs } from './AdminControls.js';
import { reviewSubject, useReviewKind } from './reviewKind.js';
import { formatDate, formatNumber, t } from '../../utils/language.js';
import { messageOf } from '../../utils/apiError.js';
import Pager from '../../components/Pager.js';
import { Stars } from '../../components/Stars.js';
import '../AdminPanel.css';

/** Reports per page. */
const PAGE_SIZE = 25;

const SORTS = () => [
  { value: 'mostReported', label: t('Most reported', 'সবচেয়ে বেশি রিপোর্ট') },
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'oldest', label: t('Oldest first', 'পুরোনো আগে') },
  { value: 'ratingLow', label: t('Lowest rating', 'সর্বনিম্ন রেটিং আগে') },
  { value: 'ratingHigh', label: t('Highest rating', 'সর্বোচ্চ রেটিং আগে') },
];
const STARS = () => [
  { value: '', label: t('Any stars', 'যেকোনো তারা') },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${'★'.repeat(n)} (${formatNumber(n)})` })),
];

const when = (value?: string): string =>
  value ? formatDate(value, { dateStyle: 'medium' }) : '';

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
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('mostReported');
  const [rating, setRating] = useState('');
  const settled = useDebounced(search);
  const toast = useToast();
  const [kind, setKind] = useReviewKind();

  const query = useFlaggedReviews<ReviewKind>(
    {
      search: settled || undefined,
      page,
      pageSize: PAGE_SIZE,
      filters: { sort, rating },
    },
    {},
    kind
  );
  const change = (set: (value: string) => void) => (value: string) => {
    set(value);
    setPage(1);
  };
  const reviews = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const pageCount = query.data?.pageCount ?? 1;
  const currentPage = query.data?.page ?? page;

  const { mutateAsync: dismiss } = useDismissFlags(kind);
  const { mutateAsync: remove } = useRemoveReview(kind);

  const clearReports = async (reviewId: Id) => {
    try {
      toast.success((await dismiss(reviewId)).message);
    } catch (error) {
      toast.error(messageOf(error) || t('Could not clear those reports.', 'রিপোর্টগুলো মোছা যায়নি।'));
    }
  };

  const deleteReview = async (targetId: Id, reviewerEmail: string) => {
    try {
      toast.success((await remove({ targetId, reviewerEmail })).message);
    } catch (error) {
      toast.error(messageOf(error) || t('Could not remove that review.', 'রিভিউটি সরানো যায়নি।'));
    }
  };


  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaFlag />
            </span>
            {t('Reported Reviews', 'রিপোর্ট করা রিভিউ')}
          </h2>
          <p className="admin-lede">
            {t(
              'A reported review stays up until you decide. Clear the reports if it is fair, or remove it if it breaks the rules.',
              'আপনি সিদ্ধান্ত না নেওয়া পর্যন্ত রিপোর্ট করা রিভিউ দেখা যাবে। ঠিক থাকলে রিপোর্টগুলো মুছে দিন, নিয়ম ভাঙলে রিভিউটি সরান।'
            )}
          </p>
        </div>
        <RefreshButton onClick={() => void query.refetch()} busy={query.isFetching} />
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
            placeholder={t(
              `Search words, reviewer or ${kind === 'seller' ? 'seller' : 'book'}...`,
              `শব্দ, রিভিউদাতা বা ${kind === 'seller' ? 'বিক্রেতা' : 'বই'} দিয়ে খুঁজুন...`
            )}
            aria-label={t('Search reported reviews', 'রিপোর্ট করা রিভিউ খুঁজুন')}
            value={search}
            onChange={(e) => change(setSearch)(e.target.value)}
          />
        </div>
        <FilterSelect name="sort" label={t('Sort', 'সাজান')} value={sort} onChange={change(setSort)} options={SORTS()} />
        <FilterSelect name="rating" label={t('Stars', 'তারা')} value={rating} onChange={change(setRating)} options={STARS()} />
      </div>

      {query.isPending ? (
        <div className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</div>
      ) : query.error ? (
        <div className="admin-alert">{t('Error:', 'ত্রুটি:')} {query.error.message}</div>
      ) : reviews.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">
            ✨
          </span>
          <p>
            {settled || rating
              ? t('No reported review matches.', 'মেলে এমন কোনো রিপোর্ট করা রিভিউ নেই।')
              : t('Nothing has been reported.', 'কিছুই রিপোর্ট করা হয়নি।')}
          </p>
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
                  <span className="badge admin-status is-bad">
                    <FaFlag aria-hidden="true" />
                    {t(
                      `${review.flagCount} report${review.flagCount === 1 ? '' : 's'}`,
                      `${formatNumber(review.flagCount ?? 0)}টি রিপোর্ট`
                    )}
                  </span>
                </div>

                <div className="admin-review-quote">
                  <p className="admin-cell-muted" style={{ margin: '0 0 4px' }}>
                    {subject.prefix} <Link to={subject.to}>{subject.label}</Link>
                  </p>
                  {review.title && <p style={{ margin: '0 0 4px', fontWeight: 700, color: 'var(--color-ink)' }}>{review.title}</p>}
                  {review.body && <p style={{ margin: 0, whiteSpace: 'pre-line', color: 'var(--color-ink-soft)' }}>{review.body}</p>}
                </div>

                {review.reasons.length > 0 && (
                  <div className="admin-reasons">
                    <strong>{t('What the reporters said:', 'রিপোর্টকারীরা যা বলেছেন:')}</strong>
                    <ul>
                      {review.reasons.map((reason, index) => (
                        <li key={`${String(review._id)}-${String(index)}`}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="admin-review-actions">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => void clearReports(review._id)}
                  >
                    <FaCheck aria-hidden="true" />
                    {t('It is fine — clear the reports', 'ঠিক আছে — রিপোর্টগুলো মুছে দিন')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => void deleteReview(subject.targetId, review.reviewerEmail)}
                  >
                    <FaTrashAlt aria-hidden="true" />
                    {t('Remove the review', 'রিভিউটি সরান')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="admin-pager">
        <Pager
          page={currentPage}
          pageCount={pageCount}
          pageSize={PAGE_SIZE}
          total={total}
          onPage={setPage}
          noun={t('reports', 'রিপোর্ট')}
        />
      </div>
    </div>
  );
}
