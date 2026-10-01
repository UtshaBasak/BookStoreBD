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

/** What the section says, for a book's reviews and for a seller's ratings. */
const COPY = {
  book: {
    heading: 'Ratings and reviews',
    none: 'No reviews yet.',
    one: 'review',
    many: 'reviews',
    signIn: 'to leave a review.',
    write: 'Write a review',
    edit: 'Edit your review',
    post: 'Post review',
    bodyLabel: 'What should another buyer know? (optional)',
    badge: 'Verified purchase',
    updated: 'Your review has been updated.',
    thanks: 'Thank you for your review.',
    removed: 'Your review has been removed.',
    reported: 'Thank you. An administrator will look at this review.',
    unsaved: 'Could not save your review.',
  },
  seller: {
    heading: 'Seller ratings',
    none: 'No ratings yet.',
    one: 'rating',
    many: 'ratings',
    signIn: 'to rate this seller.',
    write: 'Rate this seller',
    edit: 'Edit your rating',
    post: 'Post rating',
    bodyLabel: 'How was buying from them - packing, delivery, replies? (optional)',
    badge: 'Verified buyer',
    updated: 'Your rating has been updated.',
    thanks: 'Thank you for rating this seller.',
    removed: 'Your rating has been removed.',
    reported: 'Thank you. An administrator will look at this rating.',
    unsaved: 'Could not save your rating.',
  },
} as const satisfies Record<ReviewKind, Record<string, string>>;

/** Why the form is not on offer, said plainly rather than left blank. */
const BLOCKED: Record<string, string> = {
  'own-listing': 'You cannot review your own listing.',
  'own-shop': 'You cannot rate your own shop.',
};
const NOT_PURCHASED: Record<ReviewKind, string> = {
  book: 'Only somebody who has bought this book can review it.',
  seller: 'Only somebody who has bought from this seller can rate them.',
};

/** Reply, Report and the like: words rather than buttons, but a thumb's width. */
const TEXT_BUTTON =
  'inline-flex min-h-10 items-center rounded-full bg-transparent px-3 font-semibold underline hover:bg-brand-tint disabled:no-underline disabled:opacity-70';

const when = (value?: string): string =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

/**
 * Reviews of a book, or ratings of a seller, and the form for writing one.
 *
 * The score is what a shopper looks for before anything else, so the summary
 * sits at the top and the form is underneath: somebody reading is not the same
 * person as somebody writing.
 */
export default function Reviews({ kind, id }: { kind: ReviewKind; id: Id | undefined }) {
  const toast = useToast();
  const copy = COPY[kind];
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
      toast.warning('Write something before replying.');
      return;
    }
    try {
      await sendReply({ reviewId, body: body.trim() });
      setReplyTo(null);
      toast.success('Your reply is published.');
    } catch (error) {
      toast.error(messageOf(error) || 'Could not save that reply.');
    }
  };

  const report = async (reviewId: string) => {
    try {
      const answer = await flagReview({ reviewId });
      setReported((already) => [...already, reviewId]);
      toast.success(answer.message || copy.reported);
    } catch (error) {
      toast.error(messageOf(error) || 'Could not send that report.');
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
    return <p style={{ color: '#666' }}>Loading {copy.many}…</p>;
  }

  const submit = async () => {
    if (rating < 1) {
      toast.warning('Choose a star rating first.');
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
      toast.error(messageOf(error) || 'Could not remove it.');
    }
  };

  const total = data.count;
  const showForm = data.canReview && (editing || !data.mine);
  const field = `${kind}-review`;

  return (
    // A card of its own, like the details above it.
    <section className="card p-5 sm:p-6">
      <h2 className="mb-4 text-xl font-extrabold" style={{ color: '#111827' }}>
        {copy.heading}
      </h2>

      {total === 0 ? (
        <p className="mb-4" style={{ color: '#6b7280' }}>
          {copy.none} {data.canReview ? 'Yours would be the first.' : ''}
        </p>
      ) : (
        <div
          className="mb-6 flex flex-wrap items-center gap-6 rounded-2xl p-4"
          style={{ background: '#f8f7fc', border: '1px solid #ece8f7' }}
        >
          <div className="flex items-center gap-3">
            <span className="text-4xl font-extrabold" style={{ color: '#111827', letterSpacing: '-0.03em' }}>
              {data.average.toFixed(1)}
            </span>
            <div>
              <Stars value={data.average} size={18} />
              <p className="m-0 text-sm" style={{ color: '#6b7280' }}>
                {total} {total === 1 ? copy.one : copy.many}
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
                  <span className="w-8 shrink-0 text-right font-semibold" style={{ color: '#374151' }}>{star}★</span>
                  <span className="h-2 flex-1 rounded-full" style={{ background: '#e4dcfb' }}>
                    <span
                      className="block h-2 rounded-full"
                      style={{ width: `${share}%`, background: 'linear-gradient(90deg, #ff8a3d, #ff5c35)' }}
                    />
                  </span>
                  <span className="w-8 shrink-0" style={{ color: '#6b7280' }}>{count}</span>
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
          style={{ background: '#f3efff', color: '#374151' }}
        >
          {data.reason === 'sign-in' ? (
            <>
              <Link to="/sign-in" className="font-bold underline">
                Sign in
              </Link>{' '}
              {copy.signIn}
            </>
          ) : data.reason === 'not-purchased' ? (
            NOT_PURCHASED[kind]
          ) : (
            BLOCKED[data.reason]
          )}
        </p>
      )}

      {data.canReview && data.mine && !editing && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button type="button" onClick={() => setEditing(true)} className="btn btn-primary">
            {copy.edit}
          </button>
          <button type="button" onClick={remove} className="btn btn-danger">
            Remove it
          </button>
        </div>
      )}

      {showForm && (
        <div className={`${data.reviews.length > 0 ? 'mb-4 ' : ''}rounded-2xl p-4 sm:p-5`} style={{ background: '#f8f7fc', border: '1px solid #ece8f7' }}>
          <p className="mb-2 font-bold" style={{ color: '#111827' }}>
            {data.mine ? copy.edit : copy.write}
          </p>
          <StarInput value={rating} onChange={setRating} disabled={saving} />

          <label className="mb-1 mt-3 block text-sm font-semibold" htmlFor={`${field}-title`} style={{ color: '#374151' }}>
            Headline (optional)
          </label>
          <input
            id={`${field}-title`}
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            className="field"
          />

          <label className="mb-1 mt-3 block text-sm font-semibold" htmlFor={`${field}-body`} style={{ color: '#374151' }}>
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
              {data.mine ? 'Save changes' : copy.post}
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
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      {data.reviews.length > 0 && (
      <ul className="m-0 list-none p-0">
        {data.reviews.map((review) => (
          <li key={review._id} className="py-4" style={{ borderTop: '1px solid #ece8f7' }}>
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold text-white"
                style={{ background: 'linear-gradient(135deg, #6d28d9, #c026d3)' }}
              >
                {(review.reviewerName || '?').charAt(0).toUpperCase()}
              </span>
              <strong style={{ color: '#111827' }}>{review.reviewerName}</strong>
              {/* Only buyers may write one, and the badge says so: it is what
                  makes the score trustworthy. */}
              <span className="badge" style={{ background: '#ecfdf5', color: '#047857' }}>
                {copy.badge}
              </span>
              <span className="text-sm" style={{ color: '#6b7280' }}>{when(review.createdAt)}</span>
            </div>
            <div className="mt-2">
              <Stars value={review.rating} size={14} />
            </div>
            {review.title && <p className="mb-1 mt-1 font-bold" style={{ color: '#111827' }}>{review.title}</p>}
            {review.body && <p className="m-0 whitespace-pre-line" style={{ color: '#374151' }}>{review.body}</p>}

            {/* The seller's answer, indented under what it answers. */}
            {review.reply && (
              <div
                className="mt-3 rounded-xl border-l-4 p-3"
                style={{ borderColor: '#8b5cf6', background: '#f3efff' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong style={{ color: '#111827' }}>{review.reply.byName}</strong>
                  <span className="badge" style={{ background: '#fff', color: '#5b21b6' }}>
                    Seller
                  </span>
                  <span className="text-sm" style={{ color: '#6b7280' }}>{when(review.reply.at)}</span>
                </div>
                <p className="m-0 mt-1 whitespace-pre-line" style={{ color: '#374151' }}>{review.reply.body}</p>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-1 text-sm">
              {/* Sellers cannot delete reviews, so they may reply to them. */}
              {data.isSeller &&
                (replyTo?.id === review._id ? null : (
                  <button
                    type="button"
                    className={TEXT_BUTTON}
                    style={{ color: '#5b21b6' }}
                    onClick={() =>
                      setReplyTo({ id: String(review._id), body: review.reply?.body ?? '' })
                    }
                  >
                    {review.reply ? 'Edit your reply' : 'Reply'}
                  </button>
                ))}

              {data.isSeller && review.reply && (
                <button
                  type="button"
                  className={TEXT_BUTTON}
                  style={{ color: '#dc2626' }}
                  onClick={() => void removeReply(String(review._id))}
                >
                  Remove reply
                </button>
              )}

              {/* Not on your own review, and not before you have signed in. The
                  seller may report one too: an administrator still decides. */}
              {data.reason !== 'sign-in' && data.mine?._id !== review._id && (
                <button
                  type="button"
                  className={TEXT_BUTTON}
                  style={{ color: '#6b7280' }}
                  disabled={reported.includes(String(review._id))}
                  onClick={() => void report(String(review._id))}
                >
                  {reported.includes(String(review._id)) ? 'Reported' : 'Report'}
                </button>
              )}
            </div>

            {replyTo?.id === review._id && (
              <div className="mt-2">
                <label
                  htmlFor={`reply-${String(review._id)}`}
                  className="mb-1 block text-sm font-semibold"
                  style={{ color: '#374151' }}
                >
                  Your reply, as the seller
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
                    {replying ? 'Publishing...' : 'Publish reply'}
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setReplyTo(null)}>
                    Cancel
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
