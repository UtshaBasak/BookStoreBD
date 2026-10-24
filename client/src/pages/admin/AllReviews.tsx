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
import { formatDate, formatNumber, t } from '../../utils/language.js';
import '../AdminPanel.css';

const PAGE_SIZE = 25;

const SORTS = () => [
  { value: 'newest', label: t('Newest first', 'নতুন আগে') },
  { value: 'oldest', label: t('Oldest first', 'পুরোনো আগে') },
  { value: 'ratingHigh', label: t('Highest rating', 'সর্বোচ্চ রেটিং আগে') },
  { value: 'ratingLow', label: t('Lowest rating', 'সর্বনিম্ন রেটিং আগে') },
  { value: 'mostReported', label: t('Most reported', 'সবচেয়ে বেশি রিপোর্ট') },
];
const STARS = () => [
  { value: '', label: t('Any stars', 'যেকোনো তারা') },
  ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${'★'.repeat(n)} (${formatNumber(n)})` })),
];
const YES_NO = (any: string, yes: string, no: string) => [
  { value: '', label: any },
  { value: 'yes', label: yes },
  { value: 'no', label: no },
];

const when = (value?: string): string =>
  value ? formatDate(value, { dateStyle: 'medium' }) : '';

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
    const question = t(
      `Remove this review? It no longer counts towards ${whose} score.`,
      `রিভিউটি সরাবেন? এটি আর ${kind === 'seller' ? 'বিক্রেতার' : 'বইয়ের'} রেটিংয়ে গোনা হবে না।`
    );
    // eslint-disable-next-line no-alert -- removing somebody's words needs a yes
    if (!window.confirm(question)) return;
    try {
      toast.success((await remove({ targetId, reviewerEmail })).message);
    } catch (err) {
      toast.error(messageOf(err) || t('Could not remove that review.', 'রিভিউটি সরানো যায়নি।'));
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
            {t('Reviews', 'রিভিউ')}
          </h2>
          <p className="admin-lede">
            {t(
              'Every review buyers have written. Reported ones are also in Reported Reviews.',
              'ক্রেতাদের লেখা সব রিভিউ। রিপোর্ট করাগুলো রিপোর্ট করা রিভিউতেও আছে।'
            )}
          </p>
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
            placeholder={t(
              `Search words, reviewer or ${kind === 'seller' ? 'seller' : 'book'}...`,
              `শব্দ, রিভিউদাতা বা ${kind === 'seller' ? 'বিক্রেতা' : 'বই'} দিয়ে খুঁজুন...`
            )}
            aria-label={t('Search reviews', 'রিভিউ খুঁজুন')}
            value={search}
            onChange={(e) => change(setSearch)(e.target.value)}
          />
        </div>
        <FilterSelect name="sort" label={t('Sort', 'সাজান')} value={sort} onChange={change(setSort)} options={SORTS()} />
        <FilterSelect name="rating" label={t('Stars', 'তারা')} value={rating} onChange={change(setRating)} options={STARS()} />
        <FilterSelect
          name="replied"
          label={t('Seller reply', 'বিক্রেতার উত্তর')}
          value={replied}
          onChange={change(setReplied)}
          options={YES_NO(t('Any', 'যেকোনো'), t('Answered', 'উত্তর দেওয়া হয়েছে'), t('Not answered', 'উত্তর দেওয়া হয়নি'))}
        />
        <FilterSelect
          name="reported"
          label={t('Reports', 'রিপোর্ট')}
          value={reported}
          onChange={change(setReported)}
          options={YES_NO(t('Any', 'যেকোনো'), t('Reported', 'রিপোর্ট করা'), t('Not reported', 'রিপোর্ট করা হয়নি'))}
        />
      </div>

      {isPending ? (
        <div className="admin-loading">{t('Loading...', 'লোড হচ্ছে...')}</div>
      ) : error ? (
        <div className="admin-alert">{t('Error:', 'ত্রুটি:')} {error.message}</div>
      ) : reviews.length === 0 ? (
        <div className="admin-card admin-empty">
          <span className="admin-empty-mark" aria-hidden="true">
            ⭐
          </span>
          <p>
            {settled || rating || replied || reported
              ? t('No review matches.', 'মেলে এমন কোনো রিভিউ নেই।')
              : t('No reviews yet.', 'এখনো কোনো রিভিউ নেই।')}
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
                  {(review.flagCount ?? 0) > 0 && (
                    <span className="badge admin-status is-bad">
                      <FaFlag aria-hidden="true" />
                      {t(
                      `${review.flagCount} report${review.flagCount === 1 ? '' : 's'}`,
                      `${formatNumber(review.flagCount ?? 0)}টি রিপোর্ট`
                    )}
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
                      <FaReply aria-hidden="true" /> {t(`${review.reply.byName} replied:`, `${review.reply.byName}-এর উত্তর:`)}
                    </strong>
                    <p style={{ margin: '4px 0 0', whiteSpace: 'pre-line' }}>{review.reply.body}</p>
                  </div>
                )}

                <div className="admin-review-actions">
                  <Link to={subject.to} className="btn btn-ghost">
                    {subject.view}
                  </Link>
                  <button type="button" className="btn btn-danger" onClick={() => void deleteReview(subject.targetId, review.reviewerEmail)}>
                    <FaTrashAlt aria-hidden="true" />
                    {t('Remove the review', 'রিভিউটি সরান')}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {data && (
        <div className="admin-pager">
          <Pager page={data.page} pageCount={data.pageCount} pageSize={PAGE_SIZE} total={data.total} onPage={setPage} noun={t('reviews', 'রিভিউ')} />
        </div>
      )}
    </div>
  );
}
