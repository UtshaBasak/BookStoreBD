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
  },
  { timestamps: true }
);

// One review per person per book. A second one replaces the first rather than
// stacking, so nobody can weight a score by writing the same opinion twice.
ReviewSchema.index({ book: 1, reviewerEmail: 1 }, { unique: true });

export type ReviewAttributes = InferSchemaType<typeof ReviewSchema>;
export type ReviewDocument = HydratedDocument<ReviewAttributes>;

const Review = defineModel<ReviewAttributes>('Review', ReviewSchema);
export default Review;
