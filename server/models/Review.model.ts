import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * One person's verdict on one book.
 *
 * The reviewer's display name is copied in rather than looked up, for the same
 * reason the audit trail copies an address: a review has to keep reading
 * correctly after the account that wrote it is gone, and the account's own
 * deletion rewrites these to a stand-in.
 */
/**
 * The seller's answer to a review.
 *
 * One per review, and only from the seller of the book: a review with no right
 * of reply is a review the seller can only argue with by deleting, which they
 * cannot do. The name is copied in for the same reason the reviewer's is.
 */
const ReplySchema = new Schema(
  {
    body: { type: String, required: true },
    byEmail: { type: String, required: true },
    byName: { type: String, required: true },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReviewSchema = new Schema(
  {
    book: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true, index: true },
    reviewerEmail: { type: String, required: true, index: true },
    reviewerName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    /** The order that entitles it. Kept so a claim can be checked later. */
    orderNumber: { type: String, default: '' },
    /** Absent until the seller answers. `undefined` rather than `{}`. */
    reply: { type: ReplySchema, default: undefined },
    /**
     * How many people have reported it.
     *
     * Held here as well as in the flags themselves so the administrator's queue
     * is one query, the same reason the score sits on the listing.
     */
    flagCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One review per person per book. A second one replaces the first rather than
// stacking, so nobody can weight a score by writing the same opinion twice.
ReviewSchema.index({ book: 1, reviewerEmail: 1 }, { unique: true });

// The administrator's queue: everything reported, most-reported first.
ReviewSchema.index({ flagCount: -1, createdAt: -1, _id: -1 });

export type ReviewAttributes = InferSchemaType<typeof ReviewSchema>;
export type ReviewDocument = HydratedDocument<ReviewAttributes>;

const Review = defineModel<ReviewAttributes>('Review', ReviewSchema);
export default Review;
