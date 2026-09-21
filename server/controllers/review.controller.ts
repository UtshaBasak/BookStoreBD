import type { RequestHandler } from 'express';
import mongoose from 'mongoose';

import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';
import Review from '../models/Review.model.js';
import User from '../models/user.model.js';
import { actingUser } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';
import { createLogger } from '../config/logger.js';

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

export { recomputeBookRating };
