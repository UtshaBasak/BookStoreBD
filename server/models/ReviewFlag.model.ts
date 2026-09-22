import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * One person reporting one review.
 *
 * A row per reporter rather than a counter on the review, so the same person
 * cannot report the same review ten times to force it in front of an
 * administrator, and so the reasons survive to be read.
 */
const ReviewFlagSchema = new Schema({
  review: { type: Schema.Types.ObjectId, ref: 'Review', required: true, index: true },
  reporterEmail: { type: String, required: true },
  reason: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

// One report per person per review. A second is the same report, not another.
ReviewFlagSchema.index({ review: 1, reporterEmail: 1 }, { unique: true });

export type ReviewFlagAttributes = InferSchemaType<typeof ReviewFlagSchema>;
export type ReviewFlagDocument = HydratedDocument<ReviewFlagAttributes>;

export default defineModel<ReviewFlagAttributes>('ReviewFlag', ReviewFlagSchema);
