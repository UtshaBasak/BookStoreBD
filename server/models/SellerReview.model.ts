import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';
import { ReplySchema } from './Review.model.js';

/**
 * One buyer's rating of a seller: packing, delivery, how they answered.
 *
 * The same shape as a book review, so the two read, reply and moderate alike.
 * The seller is held both ways: by account, for the shop page that asks, and by
 * address, for the orders that decide who may rate them.
 */
const SellerReviewSchema = new Schema(
  {
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    sellerEmail: { type: String, required: true, index: true },
    reviewerEmail: { type: String, required: true, index: true },
    reviewerName: { type: String, required: true },
    rating: { type: Number, required: true, min: 1, max: 5 },
    title: { type: String, default: '' },
    body: { type: String, default: '' },
    /** The order that entitles it. */
    orderNumber: { type: String, default: '' },
    reply: { type: ReplySchema, default: undefined },
    flagCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One rating per buyer per seller; a second replaces the first.
SellerReviewSchema.index({ seller: 1, reviewerEmail: 1 }, { unique: true });

SellerReviewSchema.index({ flagCount: -1, createdAt: -1, _id: -1 });

export type SellerReviewAttributes = InferSchemaType<typeof SellerReviewSchema>;
export type SellerReviewDocument = HydratedDocument<SellerReviewAttributes>;

const SellerReview = defineModel<SellerReviewAttributes>('SellerReview', SellerReviewSchema);
export default SellerReview;
