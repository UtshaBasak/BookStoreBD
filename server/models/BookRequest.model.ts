import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * Somebody asking for a sold-out book to come back.
 *
 * The seller is told when the request is made, and the person asking is told
 * when copies are added again - at which point the request is closed rather
 * than deleted, so a seller's count of people waiting stays honest and a
 * second sell-out starts a fresh list.
 */
const BookRequestSchema = new Schema({
  book: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true, index: true },
  requester: { type: String, required: true },
  sellerEmail: { type: String, required: true, index: true },
  /** Waiting to hear. False once fulfilled or withdrawn. */
  open: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  closedAt: { type: Date, default: null },
});

// One open request per person per book; asking twice is the same request.
BookRequestSchema.index(
  { book: 1, requester: 1 },
  { unique: true, partialFilterExpression: { open: true } }
);

export type BookRequestAttributes = InferSchemaType<typeof BookRequestSchema>;
export type BookRequestDocument = HydratedDocument<BookRequestAttributes>;

export default defineModel<BookRequestAttributes>('BookRequest', BookRequestSchema);
