import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * A fingerprint of one listing photo, for finding the same photograph on
 * another listing: Cloudinary's perceptual hash for a hosted image (near
 * copies match too), or a SHA-256 of the bytes for an inline one (exact
 * copies only). Removed with nothing else; a hash of a deleted listing simply
 * stops matching anything that matters.
 */
const ImageHashSchema = new Schema({
  listing: { type: Schema.Types.ObjectId, required: true },
  sellerEmail: { type: String, required: true },
  kind: { type: String, enum: ['phash', 'sha256'], required: true },
  hash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

ImageHashSchema.index({ listing: 1, hash: 1 }, { unique: true });
ImageHashSchema.index({ kind: 1, hash: 1 });

export type ImageHashAttributes = InferSchemaType<typeof ImageHashSchema>;

export default defineModel<ImageHashAttributes>('ImageHash', ImageHashSchema);
