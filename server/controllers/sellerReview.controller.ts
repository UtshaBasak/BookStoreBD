import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import Order from '../models/Order.model.js';
import SellerReview from '../models/SellerReview.model.js';
import SellerReviewFlag from '../models/SellerReviewFlag.model.js';
import User from '../models/user.model.js';
import { actingUser } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';
import { createLogger } from '../config/logger.js';
import { adminEmails, notify } from '../utils/notify.js';
import { contains } from '../utils/regex.js';
import { validatedQuery } from '../middleware/validate.js';
import type { AdminReviewQuery, FlaggedReviewQuery } from '../schemas/index.js';

const log = createLogger('seller-review');

const STARS: readonly string[] = ['', '★', '★★', '★★★', '★★★★', '★★★★★'];

/** Where a seller's ratings are read, for the links in notifications. */
const ratingsLink = (username: string | undefined): string =>
  username ? `/shop/${encodeURIComponent(username)}#ratings` : '/';

/**
 * A seller's score: the average of every rating buyers have given them, to one
 * decimal, and how many there are. Shown on their shop and beside their name on
 * each of their listings.
 */
export const sellerRatingOf = async (sellerEmail: string): Promise<{ average: number; count: number }> => {
  const [summary] = await SellerReview.aggregate<{ average: number; count: number }>([
    { $match: { sellerEmail } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);
  return {
    average: summary ? Math.round(summary.average * 10) / 10 : 0,
    count: summary?.count ?? 0,
  };
};

/**
 * The order that entitles somebody to rate a seller: any order from them that
 * was not cancelled, on the same terms as a book review.
 */
const hasBoughtFrom = async (email: string, sellerEmail: string): Promise<string | null> => {
  const order = await Order.findOne({ buyerEmail: email, sellerEmail, status: { $ne: 'Cancelled' } })
    .sort({ createdAt: -1 })
    .lean();
  return order ? String(order.orderNumber) : null;
};

const findSeller = (id: string) => User.findById(id).select('email username').lean();

/** Everything a shop's ratings section needs, in one request. */
export const listSellerReviews: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const seller = await findSeller(req.params.id);
    if (!seller) {
      res.status(404).json({ message: 'Seller not found' });
      return;
    }

    const sellerId = new mongoose.Types.ObjectId(String(seller._id));
    const [reviews, spread] = await Promise.all([
      SellerReview.find({ seller: sellerId }).sort({ createdAt: -1 }).limit(100).lean(),
      SellerReview.aggregate<{ _id: number; count: number }>([
        { $match: { seller: sellerId } },
        { $group: { _id: '$rating', count: { $sum: 1 } } },
      ]),
    ]);

    const distribution = [1, 2, 3, 4, 5].map((star) => spread.find((row) => row._id === star)?.count ?? 0);
    const count = distribution.reduce((sum, n) => sum + n, 0);
    const average = count
      ? Math.round((distribution.reduce((sum, n, index) => sum + n * (index + 1), 0) / count) * 10) / 10
      : 0;

    const email = req.user?.email;
    const mine = email
      ? reviews.find((review) => review.reviewerEmail === email) ??
        (await SellerReview.findOne({ seller: sellerId, reviewerEmail: email }).lean())
      : null;

    let canReview = false;
    let reason: string | null = null;
    if (!email) {
      reason = 'sign-in';
    } else if (email === seller.email) {
      reason = 'own-shop';
    } else if (!(await hasBoughtFrom(email, seller.email))) {
      reason = 'not-purchased';
    } else {
      canReview = true;
    }

    res.status(200).json({
      average,
      count,
      distribution,
      reviews,
      mine: mine ?? null,
      canReview,
      reason,
      isSeller: Boolean(email) && email === seller.email,
    });
  } catch (error) {
    next(error);
  }
};

/** Writes or replaces the caller's rating of a seller they have bought from. */
export const upsertSellerReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { rating, title = '', body = '' } = req.body as { rating: number; title?: string; body?: string };

    const seller = await findSeller(req.params.id);
    if (!seller) {
      res.status(404).json({ message: 'Seller not found' });
      return;
    }

    if (actor.email === seller.email) {
      res.status(403).json({ message: 'You cannot rate your own shop' });
      return;
    }

    const orderNumber = await hasBoughtFrom(actor.email, seller.email);
    if (!orderNumber) {
      res.status(403).json({ message: 'Only somebody who has bought from this seller can rate them' });
      return;
    }

    const reviewer = await User.findById(actor.id).select('username').lean();

    const review = await SellerReview.findOneAndUpdate(
      { seller: seller._id, reviewerEmail: String(actor.email) },
      {
        seller: seller._id,
        sellerEmail: seller.email,
        reviewerEmail: String(actor.email),
        reviewerName: reviewer?.username || 'A buyer',
        rating: Number(rating),
        title: String(title),
        body: String(body),
        orderNumber: String(orderNumber),
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );

    const isNew = review && Math.abs(new Date(review.createdAt).getTime() - new Date(review.updatedAt).getTime()) < 1000;
    if (isNew) {
      await notify([seller.email], {
        type: 'seller-review',
        title: `New ${STARS[Number(rating)] ?? ''} rating for your shop`,
        body: String(title || body).slice(0, 140) || `${reviewer?.username || 'A buyer'} rated you ${rating} out of 5.`,
        link: ratingsLink(seller.username),
      });
    }

    log.info({ rating }, 'Seller rating written');
    res.status(200).json(review);
  } catch (error) {
    next(error);
  }
};

/** Removes the caller's own rating, or anyone's if an administrator. */
export const deleteSellerReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const seller = req.params.id;

    const filter =
      actor.role === 'admin'
        ? { seller, ...(req.query.email ? { reviewerEmail: String(req.query.email) } : {}) }
        : { seller, reviewerEmail: actor.email };

    const review = await SellerReview.findOneAndDelete(filter);
    if (!review) {
      res.status(404).json({ message: 'Rating not found' });
      return;
    }
    await SellerReviewFlag.deleteMany({ review: review._id });

    if (actor.role === 'admin' && review.reviewerEmail !== actor.email) {
      await recordAudit(req, {
        action: 'seller-review.delete',
        targetType: 'seller-review',
        targetId: String(review._id),
        details: { seller: review.sellerEmail, reviewer: review.reviewerEmail, rating: review.rating },
      });
    }

    res.status(200).json({ message: 'Rating removed' });
  } catch (error) {
    next(error);
  }
};

/** The seller's answer to one rating of them. One each, replaced on edit. */
export const replyToSellerReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const { body } = req.body as { body: string };

    const review = await SellerReview.findById(req.params.id);
    if (!review) {
      res.status(404).json({ message: 'Rating not found' });
      return;
    }

    if (review.sellerEmail !== actor.email) {
      res.status(403).json({ message: 'Only the seller can reply to their ratings' });
      return;
    }

    const seller = await User.findOne({ email: actor.email }).select('username').lean();

    review.reply = {
      body,
      byEmail: actor.email,
      byName: seller?.username || actor.email,
      at: new Date(),
    };
    await review.save();

    await notify([review.reviewerEmail], {
      type: 'seller-review-reply',
      title: `${seller?.username || 'The seller'} replied to your rating`,
      body: body.slice(0, 140),
      link: ratingsLink(seller?.username),
    });

    res.status(200).json({ message: 'Reply saved', reply: review.reply });
  } catch (error) {
    next(error);
  }
};

/** Withdraws the reply. The seller who wrote it, or an administrator. */
export const deleteSellerReply: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const review = await SellerReview.findById(req.params.id);

    if (!review?.reply) {
      res.status(404).json({ message: 'No reply to remove' });
      return;
    }

    if (actor.role !== 'admin' && review.reply.byEmail !== actor.email) {
      res.status(403).json({ message: 'That reply is not yours' });
      return;
    }

    const wasBy = review.reply.byEmail;
    review.reply = undefined;
    await review.save();

    if (actor.role === 'admin' && wasBy !== actor.email) {
      await recordAudit(req, {
        action: 'seller-review.reply.delete',
        targetType: 'seller-review',
        targetId: String(review._id),
        details: { seller: wasBy },
      });
    }

    res.status(200).json({ message: 'Reply removed' });
  } catch (error) {
    next(error);
  }
};

/**
 * Reports a rating for an administrator to look at. One report per person;
 * the rating stays up and keeps counting until an administrator decides.
 */
export const flagSellerReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const reviewId = req.params.id;
    const { reason = '' } = req.body as { reason?: string };

    const review = await SellerReview.findById(reviewId).select('reviewerEmail').lean();
    if (!review) {
      res.status(404).json({ message: 'Rating not found' });
      return;
    }

    if (review.reviewerEmail === actor.email) {
      res.status(400).json({ message: 'You cannot report your own rating' });
      return;
    }

    const existing = await SellerReviewFlag.findOneAndUpdate(
      { review: reviewId, reporterEmail: actor.email },
      { $setOnInsert: { review: reviewId, reporterEmail: actor.email, reason } },
      { upsert: true, returnDocument: 'before' }
    ).lean();

    if (!existing) {
      await SellerReview.findByIdAndUpdate(reviewId, { $inc: { flagCount: 1 } });
      await notify(await adminEmails(), {
        type: 'seller-review-reported',
        title: 'A seller rating was reported',
        body: reason ? `"${reason.slice(0, 120)}"` : 'No reason was given.',
        link: '/admin/reviews?of=sellers',
      });
    }

    res.status(200).json({ message: 'Thank you. An administrator will look at this rating.' });
  } catch (error) {
    next(error);
  }
};

const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  oldest: { createdAt: 1, _id: 1 },
  ratingHigh: { rating: -1, createdAt: -1, _id: -1 },
  ratingLow: { rating: 1, createdAt: -1, _id: -1 },
  mostReported: { flagCount: -1, createdAt: -1, _id: -1 },
} as const satisfies Record<string, Record<string, 1 | -1>>;

/** The search box and the star filter: the rating's words, its author, or the seller. */
const search = async (query: { search?: string; rating?: number }): Promise<Record<string, unknown>> => {
  const filter: Record<string, unknown> = {};
  if (query.rating) filter.rating = query.rating;
  if (query.search) {
    const pattern = contains(query.search);
    const sellers = await User.find({ username: pattern }, { _id: 1 }).limit(200).lean();
    filter.$or = [
      { title: pattern },
      { body: pattern },
      { reviewerName: pattern },
      { reviewerEmail: pattern },
      { sellerEmail: pattern },
      { seller: { $in: sellers.map((seller) => seller._id) } },
    ];
  }
  return filter;
};

/** One page of ratings for the administrator, with each seller's name and the reports' reasons. */
const adminPage = async (
  filter: Record<string, unknown>,
  query: { page: number; pageSize: number; sort: keyof typeof SORTS },
  withReasons: boolean
) => {
  const [reviews, total] = await Promise.all([
    SellerReview.find(filter)
      .sort(SORTS[query.sort])
      .skip((query.page - 1) * query.pageSize)
      .limit(query.pageSize)
      .lean(),
    SellerReview.countDocuments(filter),
  ]);

  const sellers = await User.find({ _id: { $in: reviews.map((review) => review.seller) } }, { username: 1 }).lean();
  const names = new Map(sellers.map((seller) => [String(seller._id), seller.username]));

  const reasons = new Map<string, string[]>();
  if (withReasons) {
    const flags = await SellerReviewFlag.find(
      { review: { $in: reviews.map((review) => review._id) } },
      { review: 1, reason: 1 }
    ).lean();
    for (const flag of flags) {
      const key = String(flag.review);
      const list = reasons.get(key) ?? [];
      if (flag.reason) list.push(flag.reason);
      reasons.set(key, list);
    }
  }

  return {
    items: reviews.map((review) => ({
      ...review,
      sellerName: names.get(String(review.seller)) ?? '(closed shop)',
      reasons: reasons.get(String(review._id)) ?? [],
    })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
};

/** The administrator's queue: reported seller ratings, most-reported first. */
export const listFlaggedSellerReviews: RequestHandler = async (req, res, next) => {
  try {
    const query = validatedQuery<FlaggedReviewQuery>(req);
    const filter = { flagCount: { $gt: 0 }, ...(await search(query)) };
    res.status(200).json(await adminPage(filter, query, true));
  } catch (error) {
    next(error);
  }
};

/** Every seller rating, for the administrator's Reviews page. */
export const listAllSellerReviews: RequestHandler = async (req, res, next) => {
  try {
    const query = validatedQuery<AdminReviewQuery>(req);
    const filter: Record<string, unknown> = {
      ...(await search(query)),
      ...(query.replied === 'yes' ? { reply: { $exists: true } } : query.replied === 'no' ? { reply: { $exists: false } } : {}),
      ...(query.reported === 'yes' ? { flagCount: { $gt: 0 } } : query.reported === 'no' ? { flagCount: 0 } : {}),
    };
    res.status(200).json(await adminPage(filter, query, false));
  } catch (error) {
    next(error);
  }
};

/** Clears the reports and leaves the rating where it is. */
export const dismissSellerReviewFlags: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const reviewId = req.params.id;

    const review = await SellerReview.findByIdAndUpdate(reviewId, { flagCount: 0 });
    if (!review) {
      res.status(404).json({ message: 'Rating not found' });
      return;
    }
    await SellerReviewFlag.deleteMany({ review: reviewId });

    await recordAudit(req, {
      action: 'seller-review.flags.dismiss',
      targetType: 'seller-review',
      targetId: String(reviewId),
      details: { reviewer: review.reviewerEmail },
    });

    res.status(200).json({ message: 'Reports cleared' });
  } catch (error) {
    next(error);
  }
};
