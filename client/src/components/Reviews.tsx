import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { Id } from '@shared/api.js';

import { Stars, StarInput } from './Stars.js';
import {
  useDeleteReply,
  useDeleteReview,
  useFlagReview,
  useReplyToReview,
  useReviews,
  useWriteReview,
  type ReviewKind,
} from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';
import { digits, formatDate, formatNumber, t } from '../utils/language.js';

/**
 * What the section says, for a book's reviews and for a seller's ratings. A
 * function, so it is in the language being shown when it is drawn.
 */
const copyFor = (kind: ReviewKind) =>
  (
    ({
      book: {
        heading: t('Ratings and reviews', 'রেটিং ও রিভিউ'),
        none: t('No reviews yet.', 'এখনো কোনো রিভিউ নেই।'),
        loading: t('Loading reviews…', 'রিভিউ লোড হচ্ছে…'),
        count: (total: number) => t(`${total} ${total === 1 ? 'review' : 'reviews'}`, `${formatNumber(total)}টি রিভিউ`),
        signIn: t('to leave a review.', 'করে রিভিউ লিখুন।'),
        write: t('Write a review', 'রিভিউ লিখুন'),
        edit: t('Edit your review', 'আপনার রিভিউ সম্পাদনা'),
        post: t('Post review', 'রিভিউ প্রকাশ করুন'),
        bodyLabel: t('What should another buyer know? (optional)', 'অন্য ক্রেতাদের কী জানা দরকার? (ঐচ্ছিক)'),
        badge: t('Verified purchase', 'যাচাইকৃত ক্রয়'),
        updated: t('Your review has been updated.', 'আপনার রিভিউ হালনাগাদ হয়েছে।'),
        thanks: t('Thank you for your review.', 'রিভিউ দেওয়ার জন্য ধন্যবাদ।'),
        removed: t('Your review has been removed.', 'আপনার রিভিউ সরানো হয়েছে।'),
        reported: t('Thank you. An administrator will look at this review.', 'ধন্যবাদ। একজন অ্যাডমিন রিভিউটি দেখবেন।'),
        unsaved: t('Could not save your review.', 'আপনার রিভিউ সংরক্ষণ করা যায়নি।'),
      },
      seller: {
        heading: t('Seller ratings', 'বিক্রেতার রেটিং'),
        none: t('No ratings yet.', 'এখনো কোনো রেটিং নেই।'),
        loading: t('Loading ratings…', 'রেটিং লোড হচ্ছে…'),
        count: (total: number) => t(`${total} ${total === 1 ? 'rating' : 'ratings'}`, `${formatNumber(total)}টি রেটিং`),
        signIn: t('to rate this seller.', 'করে এই বিক্রেতাকে রেটিং দিন।'),
        write: t('Rate this seller', 'বিক্রেতাকে রেটিং দিন'),
        edit: t('Edit your rating', 'আপনার রেটিং সম্পাদনা'),
        post: t('Post rating', 'রেটিং প্রকাশ করুন'),
        bodyLabel: t(
          'How was buying from them - packing, delivery, replies? (optional)',
          'তাঁর কাছ থেকে কেনা কেমন ছিল - প্যাকিং, ডেলিভারি, উত্তর? (ঐচ্ছিক)'
        ),
        badge: t('Verified buyer', 'যাচাইকৃত ক্রেতা'),
        updated: t('Your rating has been updated.', 'আপনার রেটিং হালনাগাদ হয়েছে।'),
        thanks: t('Thank you for rating this seller.', 'বিক্রেতাকে রেটিং দেওয়ার জন্য ধন্যবাদ।'),
        removed: t('Your rating has been removed.', 'আপনার রেটিং সরানো হয়েছে।'),
        reported: t('Thank you. An administrator will look at this rating.', 'ধন্যবাদ। একজন অ্যাডমিন রেটিংটি দেখবেন।'),
        unsaved: t('Could not save your rating.', 'আপনার রেটিং সংরক্ষণ করা যায়নি।'),
      },
    }) satisfies Record<ReviewKind, Record<string, string | ((total: number) => string)>>
  )[kind];

/** Why the form is not on offer, said plainly rather than left blank. */
const blockedReason = (reason: string): string | undefined =>
  (
    {
      'own-listing': t('You cannot review your own listing.', 'নিজের বইয়ের রিভিউ লেখা যায় না।'),
      'own-shop': t('You cannot rate your own shop.', 'নিজের শপকে রেটিং দেওয়া যায় না।'),
    } as Record<string, string>
  )[reason];
const notPurchased = (kind: ReviewKind): string =>
  kind === 'book'
    ? t('Only somebody who has bought this book can review it.', 'যিনি বইটি কিনেছেন, শুধু তিনিই রিভিউ লিখতে পারেন।')
    : t(
        'Only somebody who has bought from this seller can rate them.',
        'যিনি এই বিক্রেতার কাছ থেকে কিনেছেন, শুধু তিনিই রেটিং দিতে পারেন।'
      );
const notDelivered = (kind: ReviewKind): string =>
  kind === 'book'
    ? t('You can review this book once it has been delivered.', 'বইটি ডেলিভারি হওয়ার পর আপনি রিভিউ লিখতে পারবেন।')
    : t(
        'You can rate this seller once your order from them has been delivered.',
        'এই বিক্রেতার কাছ থেকে আপনার অর্ডার ডেলিভারি হওয়ার পর আপনি রেটিং দিতে পারবেন।'
      );

/** Reply, Report and the like: words rather than buttons, but a thumb's width. */
const TEXT_BUTTON =
  'inline-flex min-h-10 items-center rounded-full bg-transparent px-3 font-semibold underline hover:bg-brand-tint disabled:no-underline disabled:opacity-70';

const when = (value?: string): string =>
  value ? formatDate(value, { dateStyle: 'medium' }) : '';

/**
 * Reviews of a book, or ratings of a seller, and the form for writing one.
 *
 * The score is what a shopper looks for before anything else, so the summary
 * sits at the top and the form is underneath: somebody reading is not the same
 * person as somebody writing.
 */
export default function Reviews({ kind, id }: { kind: ReviewKind; id: Id | undefined }) {
  const toast = useToast();
  const copy = copyFor(kind);
  const { data, isPending } = useReviews(id, kind);
  const { mutateAsync: writeReview, isPending: saving } = useWriteReview(id, kind);
  const { mutateAsync: removeReview } = useDeleteReview(id, kind);
  const { mutateAsync: sendReply, isPending: replying } = useReplyToReview(id, kind);
  const { mutateAsync: removeReply } = useDeleteReply(id, kind);
  const { mutateAsync: flagReview } = useFlagReview(kind);

  /** Which review's reply box is open, and what is in it. */
  const [replyTo, setReplyTo] = useState<{ id: string; body: string } | null>(null);
  /** Reviews this visitor has reported, so the button can say so. */
  const [reported, setReported] = useState<string[]>([]);

  const submitReply = async (reviewId: string, body: string) => {
    if (!body.trim()) {
      toast.warning(t('Write something before replying.', 'উত্তর দেওয়ার আগে কিছু লিখুন।'));
      return;
    }
    try {
      await sendReply({ reviewId, body: body.trim() });
      setReplyTo(null);
      toast.success(t('Your reply is published.', 'আপনার উত্তর প্রকাশিত হয়েছে।'));
    } catch (error) {
      toast.error(messageOf(error) || t('Could not save that reply.', 'উত্তরটি সংরক্ষণ করা যায়নি।'));
    }
  };

  const report = async (reviewId: string) => {
    try {
      const answer = await flagReview({ reviewId });
      setReported((already) => [...already, reviewId]);
      toast.success(answer.message || copy.reported);
    } catch (error) {
      toast.error(messageOf(error) || t('Could not send that report.', 'রিপোর্টটি পাঠানো যায়নি।'));
    }
  };

  /*
   * The form is derived from the saved review, with an override for what has
   * been typed since, rather than copied into state by an effect - so it never
   * shows a stale copy of a review that has changed.
   */
  const [draft, setDraft] = useState<{ rating: number; title: string; body: string } | null>(null);
  const [editing, setEditing] = useState(false);

  const mine = data?.mine ?? null;
  const form = draft ?? {
    rating: mine?.rating ?? 0,
    title: mine?.title ?? '',
    body: mine?.body ?? '',
  };
  const { rating, title, body } = form;
  const setRating = (value: number) => setDraft({ ...form, rating: value });
  const setTitle = (value: string) => setDraft({ ...form, title: value });
  const setBody = (value: string) => setDraft({ ...form, body: value });

  if (isPending || !data) {
    return <p style={{ color: 'var(--color-ink-muted)' }}>{copy.loading}</p>;
  }

  const submit = async () => {
    if (rating < 1) {
      toast.warning(t('Choose a star rating first.', 'আগে তারা দিয়ে রেটিং বেছে নিন।'));
      return;
    }
    try {
      await writeReview({ rating, title: title.trim(), body: body.trim() });
      setDraft(null);
      setEditing(false);
      toast.success(data.mine ? copy.updated : copy.thanks);
    } catch (error) {
      toast.error(messageOf(error) || copy.unsaved);
    }
  };

  const remove = async () => {
    try {
      await removeReview();
      setDraft(null);
      setEditing(false);
      toast.success(copy.removed);
    } catch (error) {
      toast.error(messageOf(error) || t('Could not remove it.', 'সরানো যায়নি।'));
    }
  };

  const total = data.count;
  const showForm = data.canReview && (editing || !data.mine);
  const field = `${kind}-review`;

  return (
    // A card of its own, like the details above it.
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 text-xl font-extrabold" style={{ color: 'var(--color-ink)' }}>
        {copy.heading}
      </h2>

      {total === 0 ? (
        <p className="mb-4" style={{ color: 'var(--color-ink-muted)' }}>
          {copy.none} {data.canReview ? t('Yours would be the first.', 'প্রথমটি আপনারই হতে পারে।') : ''}
        </p>
      ) : (
        <div
          className="mb-6 flex flex-wrap items-center gap-6 rounded-2xl p-4"
          style={{ background: 'var(--color-page)', border: '1px solid var(--color-line)' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-4xl font-extrabold" style={{ color: 'var(--color-ink)', letterSpacing: '-0.03em' }}>
              {digits(data.average.toFixed(1))}
            </span>
            <div>
              <Stars value={data.average} size={18} />
              <p className="m-0 text-sm" style={{ color: 'var(--color-ink-muted)' }}>
                {copy.count(total)}
              </p>
            </div>
          </div>

          {/* The spread, because an average alone can hide how ratings are
              distributed. */}
          <div className="min-w-45 flex-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = data.distribution[star - 1] ?? 0;
              const share = total === 0 ? 0 : Math.round((count / total) * 100);
              return (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-8 shrink-0 text-right font-semibold" style={{ color: 'var(--color-ink-soft)' }}>{digits(star)}★</span>
                  <span className="h-2 flex-1 rounded-full" style={{ background: 'var(--color-brand-line)' }}>
                    <span
                      className="block h-2 rounded-full"
                      style={{ width: `${share}%`, background: 'linear-gradient(90deg, #ff8a3d, #ff5c35)' }}
                    />
                  </span>
                  <span className="w-8 shrink-0" style={{ color: 'var(--color-ink-muted)' }}>{digits(count)}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Why there is no form, when there is no form. */}
      {!data.canReview && data.reason && (
        <p
          className="mb-6 rounded-xl px-4 py-3 text-sm"
          style={{ background: 'var(--color-brand-tint)', color: 'var(--color-ink-soft)' }}
        >
          {data.reason === 'sign-in' ? (
            <>
              <Link to="/sign-in" className="font-bold underline">
                {t('Sign in', 'সাইন ইন')}
              </Link>{' '}
              {copy.signIn}
            </>
          ) : data.reason === 'not-purchased' ? (
            notPurchased(kind)
          ) : data.reason === 'not-delivered' ? (
            notDelivered(kind)
          ) : (
            blockedReason(data.reason)
          )}
        </p>
      )}

      {data.canReview && data.mine && !editing && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => setEditing(true)} className="btn btn-primary">
            {copy.edit}
          </button>
          <button type="button" onClick={remove} className="btn btn-danger">
            {t('Remove it', 'সরিয়ে দিন')}
          </button>
        </div>
      )}

      {showForm && (
        <div className={`${data.reviews.length > 0 ? 'mb-4 ' : ''}rounded-2xl p-4 sm:p-5`} style={{ background: 'var(--color-page)', border: '1px solid var(--color-line)' }}>
          <p className="mb-2 font-bold" style={{ color: 'var(--color-ink)' }}>
            {data.mine ? copy.edit : copy.write}
          </p>
          <StarInput value={rating} onChange={setRating} disabled={saving} />

          <label className="mb-1 mt-3 block text-sm font-semibold" htmlFor={`${field}-title`} style={{ color: 'var(--color-ink-soft)' }}>
            {t('Headline (optional)', 'শিরোনাম (ঐচ্ছিক)')}
          </label>
          <input
            id={`${field}-title`}
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            className="field"
          />

          <label className="mb-1 mt-3 block text-sm font-semibold" htmlFor={`${field}-body`} style={{ color: 'var(--color-ink-soft)' }}>
            {copy.bodyLabel}
          </label>
          <textarea
            id={`${field}-body`}
            value={body}
            rows={4}
            maxLength={2000}
            onChange={(event) => setBody(event.target.value)}
            className="field"
            style={{ minHeight: 110, padding: '12px 14px' }}
          />

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="btn btn-primary"
              style={{ cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1 }}
            >
              {data.mine ? t('Save changes', 'পরিবর্তন সংরক্ষণ করুন') : copy.post}
            </button>
            {data.mine && (
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setEditing(false);
                }}
                className="btn btn-ghost"
              >
                {t('Cancel', 'বাতিল')}
              </button>
            )}
          </div>
        </div>
      )}

      {data.reviews.length > 0 && (
      <ul className="m-0 list-none p-0">
        {data.reviews.map((review) => (
          <li key={review._id} className="py-4" style={{ borderTop: '1px solid var(--color-line)' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold text-white"
                style={{ background: 'linear-gradient(135deg, #6d28d9, #c026d3)' }}
              >
                {(review.reviewerName || '?').charAt(0).toUpperCase()}
              </span>
              <strong style={{ color: 'var(--color-ink)' }}>{review.reviewerName}</strong>
              {/* Only buyers may write one, and the badge says so: it is what
                  makes the score trustworthy. */}
              <span className="badge" style={{ background: 'var(--color-success-tint)', color: 'var(--color-success-dark)' }}>
                {copy.badge}
              </span>
              <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>{when(review.createdAt)}</span>
            </div>
            <div className="mt-2">
              <Stars value={review.rating} size={14} />
            </div>
            {review.title && <p className="mb-1 mt-1 font-bold" style={{ color: 'var(--color-ink)' }}>{review.title}</p>}
            {review.body && <p className="m-0 whitespace-pre-line" style={{ color: 'var(--color-ink-soft)' }}>{review.body}</p>}

            {/* The seller's answer, indented under what it answers. */}
            {review.reply && (
              <div
                className="mt-3 rounded-xl border-l-4 p-3"
                style={{ borderColor: 'var(--color-brand-light)', background: 'var(--color-brand-tint)' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong style={{ color: 'var(--color-ink)' }}>{review.reply.byName}</strong>
                  <span className="badge" style={{ background: 'var(--color-surface)', color: 'var(--color-brand-dark)' }}>
                    {t('Seller', 'বিক্রেতা')}
                  </span>
                  <span className="text-sm" style={{ color: 'var(--color-ink-muted)' }}>{when(review.reply.at)}</span>
                </div>
                <p className="m-0 mt-1 whitespace-pre-line" style={{ color: 'var(--color-ink-soft)' }}>{review.reply.body}</p>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              {/* Sellers cannot delete reviews, so they may reply to them. */}
              {data.isSeller &&
                (replyTo?.id === review._id ? null : (
                  <button
                    type="button"
                    className={TEXT_BUTTON}
                    style={{ color: 'var(--color-brand-dark)' }}
                    onClick={() =>
                      setReplyTo({ id: String(review._id), body: review.reply?.body ?? '' })
                    }
                  >
                    {review.reply ? t('Edit your reply', 'আপনার উত্তর সম্পাদনা') : t('Reply', 'উত্তর দিন')}
                  </button>
                ))}

              {data.isSeller && review.reply && (
                <button
                  type="button"
                  className={TEXT_BUTTON}
                  style={{ color: 'var(--color-danger-dark)' }}
                  onClick={() => void removeReply(String(review._id))}
                >
                  {t('Remove reply', 'উত্তর সরান')}
                </button>
              )}

              {/* Not on your own review, and not before you have signed in. The
                  seller may report one too: an administrator still decides. */}
              {data.reason !== 'sign-in' && data.mine?._id !== review._id && (
                <button
                  type="button"
                  className={TEXT_BUTTON}
                  style={{ color: 'var(--color-ink-muted)' }}
                  disabled={reported.includes(String(review._id))}
                  onClick={() => void report(String(review._id))}
                >
                  {reported.includes(String(review._id)) ? t('Reported', 'রিপোর্ট করা হয়েছে') : t('Report', 'রিপোর্ট করুন')}
                </button>
              )}
            </div>

            {replyTo?.id === review._id && (
              <div className="mt-2">
                <label
                  htmlFor={`reply-${String(review._id)}`}
                  className="mb-1 block text-sm font-semibold"
                  style={{ color: 'var(--color-ink-soft)' }}
                >
                  {t('Your reply, as the seller', 'বিক্রেতা হিসেবে আপনার উত্তর')}
                </label>
                <textarea
                  id={`reply-${String(review._id)}`}
                  rows={3}
                  className="field"
                  style={{ minHeight: 90, padding: '12px 14px' }}
                  value={replyTo.body}
                  onChange={(e) => setReplyTo({ id: replyTo.id, body: e.target.value })}
                />
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={replying}
                    className="btn btn-primary"
                    onClick={() => void submitReply(String(review._id), replyTo.body)}
                  >
                    {replying ? t('Publishing...', 'প্রকাশ হচ্ছে...') : t('Publish reply', 'উত্তর প্রকাশ করুন')}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setReplyTo(null)}>
                    {t('Cancel', 'বাতিল')}
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      )}
    </section>
  );
}
