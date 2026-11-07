import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';

import type {
  ModerationChatMessage,
  ModerationFlagDetail,
  ModerationFlagItem,
  ModerationFlagList,
  ModerationStats,
  ModerationTarget,
} from '@shared/api.js';

import AddBook from '../models/AddBook.model.js';
import ChatMessage from '../models/Chat.model.js';
import ModerationFlag, { type LeanModerationFlag } from '../models/ModerationFlag.model.js';
import ModerationJob from '../models/ModerationJob.model.js';
import Review from '../models/Review.model.js';
import SellerReview from '../models/SellerReview.model.js';
import User from '../models/user.model.js';
import { moderationMode } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { actingUser } from '../middleware/auth.js';
import { validatedQuery } from '../middleware/validate.js';
import type { ModerationBulkClearBody, ModerationDecisionBody, ModerationListQuery } from '../schemas/index.js';
import { recordAudit } from '../utils/audit.js';
import { contains } from '../utils/regex.js';
import { notify } from '../utils/notify.js';
import { adminMessageEmail, sendShopMailNow } from '../utils/shopMail.js';
import { securityEvent } from '../utils/securityLog.js';
import { t } from '../utils/language.js';

const log = createLogger('moderation');

/**
 * The administrators' side of automatic moderation: the queue of flags, each
 * with its content in context, and the decisions - clear it, record that the
 * content was removed (through its usual delete, which the admin page calls
 * first), or record that the author was messaged (through the usual admin
 * message). Nothing here deletes a review or a listing itself; it only checks
 * that the content is gone before telling the author why.
 */

const TARGETS: ModerationTarget[] = ['review', 'seller-review', 'listing', 'chat'];

/** Whether the content behind each flag still exists, in one query per kind. */
const existing = async (flags: LeanModerationFlag[]): Promise<Set<string>> => {
  const ids = (type: ModerationTarget): Types.ObjectId[] => flags.filter((flag) => flag.targetType === type).map((flag) => flag.targetId);
  const [reviews, sellerReviews, listings, users] = await Promise.all([
    Review.find({ _id: { $in: ids('review') } }, { _id: 1, book: 1 }).lean(),
    SellerReview.find({ _id: { $in: ids('seller-review') } }, { _id: 1 }).lean(),
    AddBook.find({ _id: { $in: ids('listing') } }, { _id: 1 }).lean(),
    User.find({ _id: { $in: ids('chat') } }, { _id: 1 }).lean(),
  ]);
  return new Set([...reviews, ...sellerReviews, ...listings, ...users].map((row) => String(row._id)));
};

const linkFor = async (flag: LeanModerationFlag): Promise<string | null> => {
  switch (flag.targetType) {
    case 'listing':
      return `/book/${String(flag.targetId)}`;
    case 'review': {
      const review = await Review.findById(flag.targetId, { book: 1 }).lean();
      return review ? `/book/${String(review.book)}#reviews` : null;
    }
    case 'seller-review':
      return flag.label ? `/shop/${encodeURIComponent(flag.label)}` : null;
    default:
      return null;
  }
};

const toItem = (flag: LeanModerationFlag, exists: boolean, link: string | null): ModerationFlagItem => ({
  _id: String(flag._id),
  targetType: flag.targetType as ModerationTarget,
  targetId: String(flag.targetId),
  authorEmail: flag.authorEmail ?? '',
  label: flag.label ?? '',
  excerpt: flag.excerpt ?? '',
  messageCount: flag.messageCount ?? 0,
  reasons: (flag.reasons ?? []).map((item) => ({ code: item.code, source: item.source as 'rule' | 'model', score: item.score, detail: item.detail ?? '' })),
  score: flag.score ?? 0,
  severity: (flag.severity ?? 'low') as ModerationFlagItem['severity'],
  status: (flag.status ?? 'open') as ModerationFlagItem['status'],
  shadow: Boolean(flag.shadow),
  decision: (flag.decision ?? null) as ModerationFlagItem['decision'],
  decidedBy: flag.decidedBy ?? '',
  decidedAt: flag.decidedAt ? new Date(flag.decidedAt).toISOString() : null,
  note: flag.note ?? '',
  createdAt: new Date(flag.createdAt).toISOString(),
  updatedAt: new Date(flag.updatedAt).toISOString(),
  link,
  exists,
});

const SORTS = {
  newest: { updatedAt: -1, _id: -1 },
  oldest: { updatedAt: 1, _id: 1 },
  score: { score: -1, _id: -1 },
} as const;

/** GET /moderation/flags - the queue, with the admin list's usual search, filters, sort and paging. */
export const listFlags: RequestHandler = async (req, res, next) => {
  try {
    const query = validatedQuery<ModerationListQuery>(req);
    const filter: Record<string, unknown> = {
      shadow: query.shadow === '1',
      ...(query.status !== 'all' ? { status: query.status } : {}),
      ...(query.type ? { targetType: query.type } : {}),
      ...(query.source ? { 'reasons.source': query.source } : {}),
      ...(query.severity ? { severity: query.severity } : {}),
      ...(query.search
        ? { $or: [{ label: contains(query.search) }, { authorEmail: contains(query.search) }, { excerpt: contains(query.search) }, { 'reasons.code': contains(query.search) }] }
        : {}),
    };
    const [flags, total] = await Promise.all([
      ModerationFlag.find(filter)
        .sort(SORTS[query.sort])
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean<LeanModerationFlag[]>(),
      ModerationFlag.countDocuments(filter),
    ]);
    const alive = await existing(flags);
    const items = await Promise.all(flags.map(async (flag) => toItem(flag, alive.has(String(flag.targetId)), await linkFor(flag))));
    const body: ModerationFlagList = {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
      mode: moderationMode(),
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
};

const loadFlag = async (id: string): Promise<LeanModerationFlag | null> => ModerationFlag.findById(id).lean<LeanModerationFlag>();

const notFound = (req: Parameters<RequestHandler>[0]) => ({ message: t(req, 'Flag not found', 'ফ্ল্যাগটি পাওয়া যায়নি') });

/** GET /moderation/flags/:id - the flag and its content in context. Flagged chat messages are shown to administrators only. */
export const getFlag: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const flag = await loadFlag(req.params.id);
    if (!flag) {
      res.status(404).json(notFound(req));
      return;
    }
    let content: ModerationFlagDetail['content'] = null;
    let messages: ModerationChatMessage[] = [];
    let bookId: string | null = null;
    if (flag.targetType === 'review' || flag.targetType === 'seller-review') {
      const review =
        flag.targetType === 'review'
          ? await Review.findById(flag.targetId).lean()
          : await SellerReview.findById(flag.targetId).lean();
      if (review) content = { title: review.title ?? '', body: review.body ?? '', rating: Number(review.rating), price: null };
      if (review && flag.targetType === 'review') bookId = String((review as { book: unknown }).book);
    } else if (flag.targetType === 'listing') {
      const book = await AddBook.findById(flag.targetId, { title: 1, author: 1, desc: 1, salePrice: 1, price: 1 }).lean();
      if (book) content = { title: `${book.title} — ${book.author}`, body: book.desc ?? '', rating: null, price: Number(book.salePrice ?? book.price) };
    } else {
      const rows = await ChatMessage.find({ _id: { $in: flag.messageIds ?? [] }, sender: flag.authorEmail }, { receiver: 1, message: 1, image: 1, timestamp: 1 })
        .sort({ timestamp: -1 })
        .lean();
      messages = rows.map((row) => ({
        _id: String(row._id),
        receiver: String(row.receiver),
        message: String(row.message ?? ''),
        hasImage: Boolean(row.image),
        timestamp: new Date(row.timestamp).toISOString(),
      }));
      // Reading someone's private messages is a privileged act, and is on the record.
      await recordAudit(req, { action: 'moderation.chat.viewed', targetType: 'user', targetId: String(flag.targetId), details: { messages: messages.length } });
    }
    const alive = await existing([flag]);
    const body: ModerationFlagDetail = {
      ...toItem(flag, alive.has(String(flag.targetId)), await linkFor(flag)),
      content,
      messages,
      bookId,
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
};

const KIND_NAME: Record<ModerationTarget, { en: string; bn: string }> = {
  review: { en: 'review', bn: 'রিভিউ' },
  'seller-review': { en: 'seller rating', bn: 'বিক্রেতার রেটিং' },
  listing: { en: 'listing', bn: 'বইয়ের তালিকা' },
  chat: { en: 'chat messages', bn: 'চ্যাট মেসেজ' },
};

/** Tells the author that an administrator removed their content, and why, with a way to reply. */
const tellAuthor = async (flag: LeanModerationFlag, reason: string): Promise<void> => {
  if (!flag.authorEmail) return;
  const kind = KIND_NAME[flag.targetType as ModerationTarget];
  const what = flag.label ? ` (“${flag.label}”)` : '';
  const title = { en: `Your ${kind.en} was removed`, bn: `আপনার ${kind.bn} সরানো হয়েছে` };
  const because = reason || 'It did not follow the shop’s rules.';
  const body = {
    en: `An administrator removed your ${kind.en}${what}. Reason: ${because} If you think this is a mistake, reply through the Contact page.`,
    bn: `একজন অ্যাডমিন আপনার ${kind.bn}${what} সরিয়েছেন। কারণ: ${because} ভুল মনে হলে যোগাযোগ পাতার মাধ্যমে জানান।`,
  };
  await notify([flag.authorEmail], { type: 'shop-message', title, body, link: '/contact' });
  await sendShopMailNow(flag.authorEmail, adminMessageEmail(title.en, body.en, '/contact'));
};

/** POST /moderation/flags/:id/decision */
export const decideFlag: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const { decision, reason = '', note = '' } = req.body as ModerationDecisionBody;
    const flag = await loadFlag(req.params.id);
    if (!flag) {
      res.status(404).json(notFound(req));
      return;
    }
    const actor = actingUser(req);

    if (decision === 'removed') {
      if (flag.targetType === 'chat') {
        // Chat has no delete of its own for administrators: the flagged messages go, from both sides.
        await ChatMessage.deleteMany({ _id: { $in: flag.messageIds ?? [] }, sender: flag.authorEmail });
      } else if ((await existing([flag])).has(String(flag.targetId))) {
        res.status(409).json({
          code: 'still-there',
          message: t(req, 'Remove the content first, then record the decision.', 'আগে কনটেন্টটি সরান, তারপর সিদ্ধান্ত লিখুন।'),
        });
        return;
      }
    }

    await ModerationFlag.updateOne(
      { _id: flag._id },
      {
        $set: {
          status: decision === 'cleared' ? 'cleared' : 'actioned',
          decision,
          decidedBy: actor.email,
          decidedAt: new Date(),
          ...(note ? { note } : {}),
        },
      }
    );
    if (decision === 'removed') await tellAuthor(flag, reason);

    await recordAudit(req, {
      action: `moderation.${decision}`,
      targetType: flag.targetType,
      targetId: String(flag.targetId),
      details: { flag: String(flag._id), reasons: (flag.reasons ?? []).map((item) => item.code) },
    });
    securityEvent(req, 'admin.moderation.decided', { extra: { decision, target: flag.targetType } });
    log.info({ decision, target: flag.targetType }, 'Moderation decision');
    res.json({ message: t(req, 'Saved', 'সংরক্ষিত হয়েছে') });
  } catch (error) {
    next(error);
  }
};

/** POST /moderation/flags/clear - many flags marked fine at once, for obvious false alarms. */
export const clearFlags: RequestHandler = async (req, res, next) => {
  try {
    const { ids, note = '' } = req.body as ModerationBulkClearBody;
    const actor = actingUser(req);
    const result = await ModerationFlag.updateMany(
      { _id: { $in: ids }, status: 'open' },
      { $set: { status: 'cleared', decision: 'cleared', decidedBy: actor.email, decidedAt: new Date(), ...(note ? { note } : {}) } }
    );
    await recordAudit(req, { action: 'moderation.cleared', targetType: 'flags', targetId: `${ids.length}`, details: { cleared: result.modifiedCount } });
    securityEvent(req, 'admin.moderation.decided', { extra: { decision: 'cleared', count: result.modifiedCount } });
    res.json({ cleared: result.modifiedCount });
  } catch (error) {
    next(error);
  }
};

/** GET /moderation/stats - open counts, and how often each rule was right. */
export const moderationStats: RequestHandler = async (_req, res, next) => {
  try {
    const [open, shadowOpen, pendingJobs, perRule] = await Promise.all([
      ModerationFlag.aggregate<{ _id: ModerationTarget; count: number }>([
        { $match: { status: 'open', shadow: false } },
        { $group: { _id: '$targetType', count: { $sum: 1 } } },
      ]),
      ModerationFlag.countDocuments({ status: 'open', shadow: true }),
      ModerationJob.countDocuments({ status: 'pending' }),
      ModerationFlag.aggregate<{ _id: string; open: number; actioned: number; cleared: number }>([
        { $unwind: '$reasons' },
        {
          $group: {
            _id: '$reasons.code',
            open: { $sum: { $cond: [{ $eq: ['$status', 'open'] }, 1, 0] } },
            actioned: { $sum: { $cond: [{ $eq: ['$status', 'actioned'] }, 1, 0] } },
            cleared: { $sum: { $cond: [{ $eq: ['$status', 'cleared'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
      ]),
    ]);
    const counts = Object.fromEntries(TARGETS.map((type) => [type, open.find((row) => row._id === type)?.count ?? 0])) as Record<ModerationTarget, number>;
    const body: ModerationStats = {
      mode: moderationMode(),
      open: counts,
      shadowOpen,
      pendingJobs,
      rules: perRule.map((row) => {
        const decided = row.actioned + row.cleared;
        return {
          code: row._id,
          decided,
          actioned: row.actioned,
          cleared: row.cleared,
          open: row.open,
          precision: decided ? Math.round((row.actioned / decided) * 100) / 100 : null,
        };
      }),
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
};
