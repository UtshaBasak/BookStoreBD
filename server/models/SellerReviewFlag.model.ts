import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/** One person reporting one seller rating. See ReviewFlag, which this mirrors. */
const SellerReviewFlagSchema = new Schema({
  review: { type: Schema.Types.ObjectId, ref: 'SellerReview', required: true, index: true },
  reporterEmail: { type: String, required: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

SellerReviewFlagSchema.index({ review: 1, reporterEmail: 1 }, { unique: true });

export type SellerReviewFlagAttributes = InferSchemaType<typeof SellerReviewFlagSchema>;
export type SellerReviewFlagDocument = HydratedDocument<SellerReviewFlagAttributes>;

export default defineModel<SellerReviewFlagAttributes>('SellerReviewFlag', SellerReviewFlagSchema);
