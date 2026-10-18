/**
 * One-off repairs to data saved before the fixes of October 2026, run by
 * scripts/cleanUpData.ts. Each step is safe to run again: what is already
 * right is left alone.
 *
 * - An order line marked returned when its return was only asked for, or
 *   turned down: it counts as sold again.
 * - "N/A" saved in a listing's blank fields, and a condition on a new book:
 *   cleared, on the listing and on the order lines copied from it.
 * - A book review or seller rating with no order behind it but cancelled
 *   ones: removed, and the book's score worked out again.
 */
import Order from '../models/Order.model.js';
import AddBook from '../models/AddBook.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Review from '../models/Review.model.js';
import ReviewFlag from '../models/ReviewFlag.model.js';
import SellerReview from '../models/SellerReview.model.js';
import SellerReviewFlag from '../models/SellerReviewFlag.model.js';
import { recomputeBookRating } from '../controllers/review.controller.js';

const PLACEHOLDER = /^\s*n\/?a\s*$/i;
const LISTING_FIELDS = ['publisher', 'country', 'language', 'isbn', 'desc', 'conditionDetails'] as const;

export interface CleanUpReport {
  returnFlagsCleared: number;
  listingFieldsCleared: number;
  newBookConditionsCleared: number;
  orderConditionsCleared: number;
  reviewsRemoved: number;
  sellerRatingsRemoved: number;
}

/** Works out what needs repairing and, unless `dryRun`, repairs it. */
export const cleanUpData = async ({ dryRun }: { dryRun: boolean }): Promise<CleanUpReport> => {
  // Returned only when the return was approved.
  const flagged = await Order.find({ isReturned: 1 }, { _id: 1 }).lean();
  const approved = new Set(
    (await ReturnRequest.find({ orderId: { $in: flagged.map((line) => line._id) }, status: 'approved' }, { orderId: 1 }).lean()).map(
      (request) => String(request.orderId)
    )
  );
  const notReturned = flagged.filter((line) => !approved.has(String(line._id))).map((line) => line._id);
  if (!dryRun && notReturned.length) await Order.updateMany({ _id: { $in: notReturned } }, { $set: { isReturned: 0 } });

  // "N/A" in a listing's blank fields.
  let listingFieldsCleared = 0;
  for (const field of LISTING_FIELDS) {
    const filter = { [field]: { $regex: PLACEHOLDER } };
    listingFieldsCleared += await AddBook.countDocuments(filter);
    if (!dryRun) await AddBook.updateMany(filter, { $set: { [field]: '' } });
  }

  // A condition is a second-hand copy's.
  const newWithCondition = { bookType: 'new' as const, condition: { $nin: ['', null] } };
  const newBookConditionsCleared = await AddBook.countDocuments(newWithCondition);
  const orderConditionsCleared = await Order.countDocuments(newWithCondition);
  if (!dryRun) {
    await AddBook.updateMany(newWithCondition, { $set: { condition: '', conditionDetails: '' } });
    await Order.updateMany(newWithCondition, { $set: { condition: '' } });
  }

  // Reviews and ratings need an order that was not cancelled.
  let reviewsRemoved = 0;
  for await (const review of Review.find({}, { book: 1, reviewerEmail: 1 }).lean().cursor()) {
    const backed = await Order.exists({ buyerEmail: review.reviewerEmail, bookId: review.book, status: { $ne: 'Cancelled' } });
    if (backed) continue;
    reviewsRemoved += 1;
    if (!dryRun) {
      await Review.deleteOne({ _id: review._id });
      await ReviewFlag.deleteMany({ review: review._id });
      await recomputeBookRating(String(review.book));
    }
  }
  let sellerRatingsRemoved = 0;
  for await (const rating of SellerReview.find({}, { sellerEmail: 1, reviewerEmail: 1 }).lean().cursor()) {
    const backed = await Order.exists({ buyerEmail: rating.reviewerEmail, sellerEmail: rating.sellerEmail, status: { $ne: 'Cancelled' } });
    if (backed) continue;
    sellerRatingsRemoved += 1;
    if (!dryRun) {
      await SellerReview.deleteOne({ _id: rating._id });
      await SellerReviewFlag.deleteMany({ review: rating._id });
    }
  }

  return {
    returnFlagsCleared: notReturned.length,
    listingFieldsCleared,
    newBookConditionsCleared,
    orderConditionsCleared,
    reviewsRemoved,
    sellerRatingsRemoved,
  };
};
