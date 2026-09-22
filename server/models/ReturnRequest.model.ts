import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const returnRequestSchema = new Schema({
  bookId: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true },
  bookTitle: { type: String, required: true },
  userEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  defectDescription: { type: String, required: true },
  // Either Cloudinary delivery URLs or, with hosting unconfigured, base64
  // data URIs. Served one at a time by /return/requests/:id/image/:n.
  images: [String],
  // Parallel to `images`, and only populated for hosted ones. Needed to remove
  // the asset when a request is cleared down.
  imagePublicIds: [String],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'] as const,
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now }
});

/*
 * The two tables that read these: the administrator's, which is every request
 * newest first, and a buyer's own. `_id` on the end so requests made in the
 * same second cannot swap between pages.
 */
returnRequestSchema.index({ createdAt: -1, _id: -1 });
returnRequestSchema.index({ userEmail: 1, createdAt: -1, _id: -1 });

export type ReturnRequestAttributes = InferSchemaType<typeof returnRequestSchema>;
export type ReturnRequestDocument = HydratedDocument<ReturnRequestAttributes>;

export default defineModel<ReturnRequestAttributes>('ReturnRequest', returnRequestSchema);
