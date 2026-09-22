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
} from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { messageOf } from '../utils/apiError.js';

/** Why the form is not on offer, said plainly rather than left blank. */
const BLOCKED: Record<string, string> = {
  'sign-in': 'Sign in to leave a review.',
  'own-listing': 'You cannot review your own listing.',
  'not-purchased': 'Only somebody who has bought this book can review it.',
};

const when = (value?: string): string =>
  value ? new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '';

/**
 * A book's reviews, and the form for writing one.
 *
 * The score is what a shopper looks for before anything else on the page, so
 * the summary sits at the top and the form is underneath: somebody reading is
 * not the same person as somebody writing.
 */
export default function BookReviews({ bookId }: { bookId: Id | undefined }) {
  const toast = useToast();
  const { data, isPending } = useReviews(bookId);
  const { mutateAsync: writeReview, isPending: saving } = useWriteReview(bookId);
  const { mutateAsync: removeReview } = useDeleteReview(bookId);
  const { mutateAsync: sendReply, isPending: replying } = useReplyToReview(bookId);
  const { mutateAsync: removeReply } = useDeleteReply(bookId);
  const { mutateAsync: flagReview } = useFlagReview();

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
      toast.success(answer.message || 'Thank you. An administrator will look at this review.');
    } catch (error) {
      toast.error(messageOf(error) || 'Could not report that review.');
    }
  };

  /*
   * The form is derived from whatever they said last time, with an override
   * for what they have typed since - rather than copied into state by an
   * effect, which is how a form ends up showing a review that has been
   * changed underneath it. "Edit" then means edit, not "write it again".
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
    return <p style={{ color: '#666' }}>Loading reviews…</p>;
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
      toast.success(data.mine ? 'Your review has been updated.' : 'Thank you for your review.');
    } catch (error) {
      toast.error(messageOf(error) || 'Could not save your review.');
    }
  };

  const remove = async () => {
    try {
      await removeReview();
      setDraft(null);
      setEditing(false);
      toast.success('Your review has been removed.');
    } catch (error) {
      toast.error(messageOf(error) || 'Could not remove your review.');
    }
  };

  const total = data.count;
  const showForm = data.canReview && (editing || !data.mine);

  return (
    <section className="mt-10 border-t border-[#eee] pt-8">
      <h2 className="mb-4 text-xl font-bold" style={{ color: '#8B6F6F' }}>
        Ratings and reviews
      </h2>

      {total === 0 ? (
        <p className="mb-4 text-[#666]">
          No reviews yet. {data.canReview ? 'Yours would be the first.' : ''}
        </p>
      ) : (
        <div className="mb-6 flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <span className="text-3xl font-bold">{data.average.toFixed(1)}</span>
            <div>
              <Stars value={data.average} size={18} />
              <p className="m-0 text-sm text-[#666]">
                {total} {total === 1 ? 'review' : 'reviews'}
              </p>
            </div>
          </div>

          {/* The spread, because an average of 3.7 hides that a third of
              buyers hated it. */}
          <div className="min-w-[180px] flex-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = data.distribution[star - 1] ?? 0;
              const share = total === 0 ? 0 : Math.round((count / total) * 100);
              return (
                <div key={star} className="flex items-center gap-2 text-sm">
                  <span className="w-8 shrink-0 text-right">{star}★</span>
                  <span className="h-2 flex-1 rounded bg-[#eee]">
                    <span
                      className="block h-2 rounded"
                      style={{ width: `${share}%`, background: '#f5a623' }}
                    />
                  </span>
                  <span className="w-8 shrink-0 text-[#666]">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Why there is no form, when there is no form. */}
      {!data.canReview && data.reason && (
        <p className="mb-6 text-sm text-[#666]">
          {data.reason === 'sign-in' ? (
            <>
              <Link to="/sign-in" className="underline">
                Sign in
              </Link>{' '}
              to leave a review.
            </>
          ) : (
            BLOCKED[data.reason]
          )}
        </p>
      )}

      {data.canReview && data.mine && !editing && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex min-h-[44px] items-center rounded-lg px-4 text-white"
            style={{ background: '#8B6F6F' }}
          >
            Edit your review
          </button>
          <button
            type="button"
            onClick={remove}
            className="inline-flex min-h-[44px] items-center rounded-lg border px-4"
            style={{ borderColor: '#c0392b', color: '#c0392b', background: 'transparent' }}
          >
            Remove it
          </button>
        </div>
      )}

      {showForm && (
        <div className="mb-8 rounded-xl bg-[#faf8f7] p-4">
          <p className="mb-2 font-semibold">
            {data.mine ? 'Edit your review' : 'Write a review'}
          </p>
          <StarInput value={rating} onChange={setRating} disabled={saving} />

          <label className="mt-3 block text-sm font-medium" htmlFor="review-title">
            Headline (optional)
          </label>
          <input
            id="review-title"
            value={title}
            maxLength={120}
            onChange={(event) => setTitle(event.target.value)}
            className="min-h-[44px] w-full rounded-lg border border-[#d9cfc9] px-3"
          />

          <label className="mt-3 block text-sm font-medium" htmlFor="review-body">
            What should another buyer know? (optional)
          </label>
          <textarea
            id="review-body"
            value={body}
            rows={4}
            maxLength={2000}
            onChange={(event) => setBody(event.target.value)}
            className="w-full rounded-lg border border-[#d9cfc9] p-3"
          />

          <div className="mt-3 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={saving}
              className="inline-flex min-h-[44px] items-center rounded-lg px-5 text-white"
              style={{ background: '#8B6F6F', cursor: saving ? 'not-allowed' : 'pointer' }}
            >
              {data.mine ? 'Save changes' : 'Post review'}
            </button>
            {data.mine && (
              <button
                type="button"
                onClick={() => {
                  setDraft(null);
                  setEditing(false);
                }}
                className="inline-flex min-h-[44px] items-center rounded-lg border border-[#d9cfc9] px-4"
                style={{ background: 'transparent' }}
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      )}

      <ul className="m-0 list-none p-0">
        {data.reviews.map((review) => (
          <li key={review._id} className="border-t border-[#eee] py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Stars value={review.rating} size={14} />
              <strong>{review.reviewerName}</strong>
              {/* The badge is the whole point of restricting who may write:
                  it is what makes the score worth reading. */}
              <span
                className="rounded px-2 py-[2px] text-xs font-semibold"
                style={{ background: '#e8f5e9', color: '#2e7d32' }}
              >
                Verified purchase
              </span>
              <span className="text-sm text-[#888]">{when(review.createdAt)}</span>
            </div>
            {review.title && <p className="mb-1 mt-2 font-semibold">{review.title}</p>}
            {review.body && <p className="m-0 whitespace-pre-line text-[#444]">{review.body}</p>}

            {/* The seller's answer, indented under what it answers. */}
            {review.reply && (
              <div
                className="mt-3 rounded border-l-4 p-3"
                style={{ borderColor: '#90caf9', background: '#f4f9ff' }}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <strong>{review.reply.byName}</strong>
                  <span
                    className="rounded px-2 py-[2px] text-xs font-semibold"
                    style={{ background: '#e3f2fd', color: '#1565c0' }}
                  >
                    Seller
                  </span>
                  <span className="text-sm text-[#888]">{when(review.reply.at)}</span>
                </div>
                <p className="m-0 mt-1 whitespace-pre-line text-[#444]">{review.reply.body}</p>
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm">
              {/*
                * A review the seller cannot answer is one they can only argue
                * with by deleting it, which they cannot do.
                */}
              {data.isSeller &&
                (replyTo?.id === review._id ? null : (
                  <button
                    type="button"
                    className="underline"
                    style={{ color: '#1565c0' }}
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
                  className="underline"
                  style={{ color: '#c0392b' }}
                  onClick={() => void removeReply(String(review._id))}
                >
                  Remove reply
                </button>
              )}

              {/* Not on your own review, and not before you have signed in. */}
              {!data.isSeller && data.reason !== 'sign-in' && data.mine?._id !== review._id && (
                <button
                  type="button"
                  className="underline"
                  style={{ color: '#888' }}
                  disabled={reported.includes(String(review._id))}
                  onClick={() => void report(String(review._id))}
                >
                  {reported.includes(String(review._id)) ? 'Reported' : 'Report'}
                </button>
              )}
            </div>

            {replyTo?.id === review._id && (
              <div className="mt-2">
                <label htmlFor={`reply-${String(review._id)}`} className="mb-1 block text-sm">
                  Your reply, as the seller
                </label>
                <textarea
                  id={`reply-${String(review._id)}`}
                  rows={3}
                  className="w-full rounded border p-2"
                  value={replyTo.body}
                  onChange={(e) => setReplyTo({ id: replyTo.id, body: e.target.value })}
                />
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    disabled={replying}
                    className="rounded px-3 py-2 text-white"
                    style={{ background: '#1565c0', minHeight: 40 }}
                    onClick={() => void submitReply(String(review._id), replyTo.body)}
                  >
                    {replying ? 'Publishing...' : 'Publish reply'}
                  </button>
                  <button
                    type="button"
                    className="rounded px-3 py-2"
                    style={{ minHeight: 40 }}
                    onClick={() => setReplyTo(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
