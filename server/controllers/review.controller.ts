import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';
import Review from '../models/Review.model.js';
import ReviewFlag from '../models/ReviewFlag.model.js';
import User from '../models/user.model.js';
import { actingUser } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';
import { createLogger } from '../config/logger.js';
import { validatedQuery } from '../middleware/validate.js';
import type { ReviewListQuery } from '../schemas/index.js';

const log = createLogger('review');

/**
 * Rewrites the score held on a book.
 *
 * Called after every write, because the catalogue page reads the score off the
 * listing itself - see the comment on the model. Rounded to one decimal: a
 * score of 4.333333 is not more informative than 4.3, and it looks like a bug.
 */
const recomputeBookRating = async (bookId: mongoose.Types.ObjectId | string): Promise<void> => {
  const [summary] = await Review.aggregate<{ average: number; count: number }>([
    { $match: { book: new mongoose.Types.ObjectId(String(bookId)) } },
    { $group: { _id: null, average: { $avg: '$rating' }, count: { $sum: 1 } } },
  ]);

  await AddBook.findByIdAndUpdate(bookId, {
    ratingAverage: summary ? Math.round(summary.average * 10) / 10 : 0,
    ratingCount: summary?.count ?? 0,
  });
};

/** The orders that entitle somebody to review a book. */
const hasBought = async (email: string, bookId: string): Promise<string | null> => {
  // Any order for the book counts, not only a delivered one: delivery status is
  // set by hand by the seller and is often never updated, and a buyer who has
  // paid should not need the seller's cooperation to say what they think.
  const order = await Order.findOne({ buyerEmail: email, bookId }).sort({ createdAt: -1 }).lean();
  return order ? String(order.orderNumber) : null;
};

/**
 * Everything a book's review section needs, in one request: the summary, the
 * reviews themselves, and - for a signed-in caller - whether they may write one
 * and what they said last time.
 */
export const listReviews: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const bookId = req.params.id;
    const book = await AddBook.findById(bookId).select('sellerEmail ratingAverage ratingCount').lean();
    if (!book) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }

    const reviews = await Review.find({ book: bookId }).sort({ createdAt: -1 }).limit(100).lean();

    // How the stars are spread, so the page can show what an average hides:
    // five 3s and a mix of 1s and 5s both average 3.
    const distribution = [1, 2, 3, 4, 5].map(
      (star) => reviews.filter((review) => review.rating === star).length
    );

    const email = req.user?.email;
    const mine = email ? reviews.find((review) => review.reviewerEmail === email) ?? null : null;

    let canReview = false;
    let reason: string | null = null;
    if (!email) {
      reason = 'sign-in';
    } else if (email === book.sellerEmail) {
      // Otherwise the score is whatever the seller says it is.
      reason = 'own-listing';
    } else if (!(await hasBought(email, String(bookId)))) {
      reason = 'not-purchased';
    } else {
      canReview = true;
    }

    res.status(200).json({
      average: book.ratingAverage ?? 0,
      count: book.ratingCount ?? 0,
      distribution,
      reviews,
      mine,
      canReview,
      reason,
      // Who may answer a review, and who may report one. The page needs both
      // to decide which buttons exist.
      isSeller: Boolean(email) && email === book.sellerEmail,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Writes or replaces the caller's review of a book.
 *
 * Only somebody who bought it: a marketplace where anybody can rate anything is
 * a marketplace where a seller rates their own books from three accounts and a
 * competitor rates them down from three more.
 */
export const upsertReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const bookId = req.params.id;
    const { rating, title = '', body = '' } = req.body as {
      rating: number;
      title?: string;
      body?: string;
    };

    const book = await AddBook.findById(bookId).select('sellerEmail title').lean();
    if (!book) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }

    if (actor.email === book.sellerEmail) {
      res.status(403).json({ message: 'You cannot review your own listing' });
      return;
    }

    const orderNumber = await hasBought(actor.email, String(bookId));
    if (!orderNumber) {
      res.status(403).json({ message: 'Only somebody who bought this book can review it' });
      return;
    }

    const reviewer = await User.findById(actor.id).select('username').lean();

    const review = await Review.findOneAndUpdate(
      { book: bookId, reviewerEmail: actor.email },
      {
        book: bookId,
        reviewerEmail: actor.email,
        reviewerName: reviewer?.username || 'A buyer',
        rating,
        title,
        body,
        orderNumber,
      },
      { returnDocument: 'after', upsert: true, setDefaultsOnInsert: true }
    );

    await recomputeBookRating(bookId);

    log.info({ rating }, 'Review written');
    res.status(200).json(review);
  } catch (error) {
    next(error);
  }
};

/** Removes the caller's own review, or any review if an administrator. */
export const deleteReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const bookId = req.params.id;

    const filter =
      actor.role === 'admin'
        ? { book: bookId, ...(req.query.email ? { reviewerEmail: String(req.query.email) } : {}) }
        : { book: bookId, reviewerEmail: actor.email };

    const review = await Review.findOneAndDelete(filter);
    if (!review) {
      res.status(404).json({ message: 'Review not found' });
      return;
    }

    await recomputeBookRating(bookId);
    // The reports were about this review; they have nothing left to describe.
    await ReviewFlag.deleteMany({ review: review._id });

    if (actor.role === 'admin' && review.reviewerEmail !== actor.email) {
      // An administrator removing somebody else's words is exactly the kind of
      // thing the trail exists for.
      await recordAudit(req, {
        action: 'review.delete',
        targetType: 'review',
        targetId: String(review._id),
        details: { book: String(bookId), reviewer: review.reviewerEmail, rating: review.rating },
      });
    }

    res.status(200).json({ message: 'Review removed' });
  } catch (error) {
    next(error);
  }
};

/**
 * The seller's answer to one review.
 *
 * Only the seller of the book, and only one reply per review - replacing it
 * rather than stacking, so a thread cannot be buried under the last word. An
 * administrator cannot write one: an answer signed by the shop that the shop
 * did not write would be worse than no answer.
 */
export const replyToReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const reviewId = req.params.id;
    const { body } = req.body as { body: string };

    const review = await Review.findById(reviewId);
    if (!review) {
      res.status(404).json({ message: 'Review not found' });
      return;
    }

    const book = await AddBook.findById(review.book).select('sellerEmail').lean();
    if (!book || book.sellerEmail !== actor.email) {
      res.status(403).json({ message: 'Only the seller of this book can reply to its reviews' });
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

    res.status(200).json({ message: 'Reply saved', reply: review.reply });
  } catch (error) {
    next(error);
  }
};

/** Withdraws the reply. The seller who wrote it, or an administrator. */
export const deleteReply: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const review = await Review.findById(req.params.id);

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
        action: 'review.reply.delete',
        targetType: 'review',
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
 * Reports a review for an administrator to look at.
 *
 * One report per person, so the same account cannot push a review up the queue
 * by clicking ten times. Reporting hides nothing: the review stays where it is
 * and keeps counting towards the score until somebody decides otherwise. The
 * alternative - hiding on report - is a button for removing an inconvenient
 * review.
 */
export const flagReview: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const actor = actingUser(req);
    const reviewId = req.params.id;
    const { reason = '' } = req.body as { reason?: string };

    const review = await Review.findById(reviewId).select('reviewerEmail').lean();
    if (!review) {
      res.status(404).json({ message: 'Review not found' });
      return;
    }

    if (review.reviewerEmail === actor.email) {
      res.status(400).json({ message: 'You cannot report your own review' });
      return;
    }

    const existing = await ReviewFlag.findOneAndUpdate(
      { review: reviewId, reporterEmail: actor.email },
      { $setOnInsert: { review: reviewId, reporterEmail: actor.email, reason } },
      { upsert: true, returnDocument: 'before' }
    ).lean();

    // Only a new report moves the counter; a repeat is the same report.
    if (!existing) {
      await Review.findByIdAndUpdate(reviewId, { $inc: { flagCount: 1 } });
    }

    res.status(200).json({ message: 'Thank you. An administrator will look at this review.' });
  } catch (error) {
    next(error);
  }
};

/** The administrator's queue: reported reviews, most-reported first. */
export const listFlaggedReviews: RequestHandler = async (req, res, next) => {
  try {
    const { page, pageSize } = validatedQuery<ReviewListQuery>(req);

    const filter = { flagCount: { $gt: 0 } };
    const [reviews, total] = await Promise.all([
      Review.find(filter)
        .sort({ flagCount: -1, createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      Review.countDocuments(filter),
    ]);

    // The books and the reasons for the page being sent, not for all of them.
    const books = await AddBook.find(
      { _id: { $in: reviews.map((review) => review.book) } },
      { title: 1 }
    ).lean();
    const titles = new Map(books.map((book) => [String(book._id), book.title]));

    const flags = await ReviewFlag.find(
      { review: { $in: reviews.map((review) => review._id) } },
      { review: 1, reason: 1 }
    ).lean();
    const reasons = new Map<string, string[]>();
    for (const flag of flags) {
      const key = String(flag.review);
      const list = reasons.get(key) ?? [];
      if (flag.reason) list.push(flag.reason);
      reasons.set(key, list);
    }

    res.status(200).json({
      items: reviews.map((review) => ({
        ...review,
        bookTitle: titles.get(String(review.book)) ?? '(deleted listing)',
        reasons: reasons.get(String(review._id)) ?? [],
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Clears the reports without touching the review.
 *
 * What an administrator does when they have read it and it is fine. Deleting
 * the review is the other button, and it already exists.
 */
export const dismissFlags: RequestHandler<{ id: string }> = async (req, res, next) => {
  try {
    const reviewId = req.params.id;

    const review = await Review.findByIdAndUpdate(reviewId, { flagCount: 0 });
    if (!review) {
      res.status(404).json({ message: 'Review not found' });
      return;
    }
    await ReviewFlag.deleteMany({ review: reviewId });

    await recordAudit(req, {
      action: 'review.flags.dismiss',
      targetType: 'review',
      targetId: String(reviewId),
      details: { reviewer: review.reviewerEmail },
    });

    res.status(200).json({ message: 'Reports cleared' });
  } catch (error) {
    next(error);
  }
};

export { recomputeBookRating };
