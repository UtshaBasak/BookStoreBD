import { createHash } from 'crypto';

import type { Types } from 'mongoose';

import AddBook, { type LeanBook } from '../../models/AddBook.model.js';
import ModerationJob, { type JobKind, type LeanModerationJob } from '../../models/ModerationJob.model.js';
import Review from '../../models/Review.model.js';
import SellerReview from '../../models/SellerReview.model.js';
import User from '../../models/user.model.js';
import { createLogger } from '../../config/logger.js';
import { assistantSettings, moderationMode } from '../../config/env.js';
import { GeminiError, geminiEnabled } from '../gemini.js';
import { isDuplicateKeyError } from '../error.js';
import { saveFlag, type SaveOutcome } from './flags.js';
import { modelReasons } from './model.js';
import { chatReasons, listingReasons, reviewReasons, type Reason } from './rules.js';
import { textHash } from './text.js';
import { embedListing } from '../assistant/semantic.js';

const log = createLogger('moderation');

/**
 * Moderation's queue and worker.
 *
 * A write only calls `enqueueModeration`, which adds a job and returns; it
 * never throws and is never awaited by the request, so a review, listing or
 * message is published exactly as before even if moderation is broken. The
 * worker, started in index.ts, takes due jobs a few at a time, runs the rules
 * and - for public text, when the Gemini key is set and budget allows - the
 * model, and records flags. A job the model could not finish (busy, over
 * budget) is tried again later; the rule flags are saved in the meantime.
 */

/** Adds content to the queue. Never throws, never blocks the caller. */
export const enqueueModeration = async (kind: JobKind, targetId: Types.ObjectId | string | null | undefined): Promise<void> => {
  if (!targetId) return;
  // Embedding is the assistant's and needs the model; everything else is moderation's.
  if (kind === 'embed' ? !geminiEnabled() || !assistantSettings().enabled : moderationMode() === 'off') return;
  try {
    await ModerationJob.create({ kind, targetId, status: 'pending', runAfter: new Date() });
  } catch (error) {
    // Already waiting: the pending job will see the latest version.
    if (!isDuplicateKeyError(error)) log.warn({ err: error, kind }, 'Could not queue content for moderation');
  }
};

/** Queues a chat sender's recent messages for a look; the job is per sender, so a burst waits once. */
export const enqueueChatModeration = async (senderEmail: string): Promise<void> => {
  if (moderationMode() === 'off') return;
  try {
    const sender = await User.findOne({ email: senderEmail }, { _id: 1 }).lean();
    if (sender) await enqueueModeration('chat', sender._id);
  } catch (error) {
    log.warn({ err: error }, 'Could not queue a chat sender for moderation');
  }
};

const strongest = (reasons: Reason[]): number => Math.max(0, ...reasons.map((item) => item.score));

interface Scanned {
  outcome: SaveOutcome;
  /** The model could not run now; try again later. */
  retry?: boolean;
}

/** Rules, then the model if it is worth asking. Model trouble is reported, never thrown. */
const withModel = async (
  kind: 'review' | 'seller-review' | 'listing',
  text: string,
  context: string,
  ruleReasons: Reason[]
): Promise<{ reasons: Reason[]; retry: boolean }> => {
  // A severe rule already says enough; the model is for what rules cannot judge.
  if (!geminiEnabled() || strongest(ruleReasons) >= 0.8) return { reasons: ruleReasons, retry: false };
  try {
    return { reasons: [...ruleReasons, ...(await modelReasons(kind, text, context))], retry: false };
  } catch (error) {
    if (error instanceof GeminiError) {
      const retry = error.kind === 'rate_limited' || error.kind === 'budget' || error.kind === 'unavailable';
      return { reasons: ruleReasons, retry };
    }
    throw error;
  }
};

const scanReview = async (kind: 'review' | 'seller-review', id: Types.ObjectId): Promise<Scanned> => {
  const review =
    kind === 'review'
      ? await Review.findById(id).lean()
      : await SellerReview.findById(id).lean();
  if (!review) return { outcome: 'none' };
  const text = `${review.title ?? ''}\n${review.body ?? ''}`.trim();
  const subjectId = kind === 'review' ? (review as { book: Types.ObjectId }).book : (review as { seller: Types.ObjectId }).seller;
  const createdAt = new Date((review as { createdAt?: Date }).createdAt ?? Date.now());

  const label =
    kind === 'review'
      ? ((await AddBook.findById(subjectId, { title: 1 }).lean())?.title ?? '')
      : ((await User.findById(subjectId, { username: 1 }).lean())?.username ?? '');
  const rules = await reviewReasons({ kind, id, text, rating: Number(review.rating), authorEmail: review.reviewerEmail, subjectId, createdAt });
  const { reasons, retry } = text ? await withModel(kind, text, label, rules) : { reasons: rules, retry: false };
  const outcome = await saveFlag({
    targetType: kind,
    targetId: id,
    authorEmail: review.reviewerEmail,
    label,
    excerpt: text,
    fingerprint: textHash(`${review.rating}|${text}`),
    reasons,
  });
  return { outcome, retry };
};

const scanListing = async (id: Types.ObjectId): Promise<Scanned> => {
  const book = await AddBook.findById(id).lean<LeanBook>();
  if (!book) return { outcome: 'none' };
  const rules = await listingReasons(book);
  const text = `${book.title}\nby ${book.author}\n${book.desc ?? ''}`;
  const { reasons, retry } = await withModel('listing', text, (book.category ?? []).join(', '), rules);
  const outcome = await saveFlag({
    targetType: 'listing',
    targetId: id,
    authorEmail: book.sellerEmail,
    label: book.title,
    excerpt: `${book.salePrice ?? book.price} Tk · ${book.desc ?? ''}`,
    fingerprint: textHash(`${text}|${book.salePrice}|${(book.images ?? []).length}|${(book.images ?? []).map((image) => String(image).slice(-40)).join(',')}`),
    reasons,
  });
  return { outcome, retry };
};

const scanChat = async (senderId: Types.ObjectId): Promise<Scanned> => {
  const sender = await User.findById(senderId, { email: 1, username: 1 }).lean();
  if (!sender) return { outcome: 'none' };
  const finding = await chatReasons(sender.email);
  const outcome = await saveFlag({
    targetType: 'chat',
    targetId: senderId,
    authorEmail: sender.email,
    label: sender.username ?? '',
    // Never a copy of private text: the flag points at the messages.
    excerpt: '',
    fingerprint: createHash('sha256').update(finding.messageIds.map(String).sort().join(',')).digest('hex'),
    reasons: finding.reasons,
    messageIds: finding.messageIds,
    messageCount: finding.messageCount,
  });
  return { outcome };
};

/** Checks one piece of content now. For the worker, the scan script and tests. */
export const scanContent = async (kind: JobKind, id: Types.ObjectId): Promise<Scanned> => {
  switch (kind) {
    case 'review':
    case 'seller-review':
      return scanReview(kind, id);
    case 'listing':
      return scanListing(id);
    case 'chat':
      return scanChat(id);
    case 'embed':
      try {
        await embedListing(id);
        return { outcome: 'none' };
      } catch (error) {
        if (error instanceof GeminiError) return { outcome: 'none', retry: error.kind !== 'invalid' && error.kind !== 'disabled' };
        throw error;
      }
    default:
      return { outcome: 'none' };
  }
};

const MAX_ATTEMPTS = 6;
const STALE_MS = 10 * 60 * 1000;

const runJob = async (job: LeanModerationJob): Promise<void> => {
  try {
    const { retry } = await scanContent(job.kind as JobKind, job.targetId);
    if (retry && job.attempts + 1 < MAX_ATTEMPTS) {
      // Back off: 5, 10, 20, 40... minutes, for a busy or exhausted model.
      const wait = 5 * 60 * 1000 * 2 ** job.attempts;
      try {
        await ModerationJob.updateOne(
          { _id: job._id },
          { $set: { status: 'pending', runAfter: new Date(Date.now() + wait), startedAt: null, lastError: 'model-later' }, $inc: { attempts: 1 } }
        );
      } catch (error) {
        // Newer content queued meanwhile: that job will look again.
        if (!isDuplicateKeyError(error)) throw error;
        await ModerationJob.updateOne({ _id: job._id }, { $set: { status: 'done', finishedAt: new Date(), lastError: 'superseded' } });
      }
      return;
    }
    await ModerationJob.updateOne({ _id: job._id }, { $set: { status: 'done', finishedAt: new Date(), lastError: retry ? 'model-skipped' : '' } });
  } catch (error) {
    log.error({ err: error, kind: job.kind }, 'Moderation job failed');
    const failed = job.attempts + 1 >= MAX_ATTEMPTS;
    await ModerationJob.updateOne(
      { _id: job._id },
      {
        $set: failed
          ? { status: 'failed', finishedAt: new Date(), lastError: 'error' }
          : { status: 'running', runAfter: new Date(Date.now() + 60_000 * 2 ** job.attempts), lastError: 'error', startedAt: new Date(0) },
        $inc: { attempts: 1 },
      }
    ).catch(() => undefined);
  }
};

/**
 * Takes and runs up to `limit` due jobs, one at a time. Also takes back jobs
 * a worker started and never finished (the host restarted mid-job).
 */
export const runModerationOnce = async (limit = 5): Promise<number> => {
  const now = new Date();
  // Jobs abandoned mid-run (or failed and waiting to retry) become due again.
  const abandoned = await ModerationJob.find({ status: 'running', startedAt: { $lt: new Date(now.getTime() - STALE_MS) } }, { _id: 1, kind: 1, targetId: 1 }).limit(20).lean();
  for (const job of abandoned) {
    await ModerationJob.updateOne({ _id: job._id, status: 'running' }, { $set: { status: 'pending', startedAt: null } }).catch(async (error: unknown) => {
      if (isDuplicateKeyError(error)) await ModerationJob.updateOne({ _id: job._id }, { $set: { status: 'done', finishedAt: now, lastError: 'superseded' } });
    });
  }

  let ran = 0;
  while (ran < limit) {
    const job = await ModerationJob.findOneAndUpdate(
      { status: 'pending', runAfter: { $lte: new Date() } },
      { $set: { status: 'running', startedAt: new Date() } },
      { sort: { runAfter: 1 }, returnDocument: 'after' }
    ).lean<LeanModerationJob>();
    if (!job) break;
    await runJob(job);
    ran += 1;
  }
  return ran;
};

let timer: NodeJS.Timeout | null = null;
let busy = false;

/** Starts the worker. Off while MODERATION_MODE is off and the Gemini key is unset: there is nothing to do. */
export const startModerationWorker = (intervalMs = 20_000): void => {
  if (timer || (moderationMode() === 'off' && !geminiEnabled())) return;
  timer = setInterval(() => {
    if (busy) return;
    busy = true;
    runModerationOnce()
      .catch((error: unknown) => log.error({ err: error }, 'Moderation worker tick failed'))
      .finally(() => {
        busy = false;
      });
  }, intervalMs);
  timer.unref();
  log.info({ mode: moderationMode(), intervalMs }, 'Moderation worker started');
};

export const stopModerationWorker = (): void => {
  if (timer) clearInterval(timer);
  timer = null;
};
