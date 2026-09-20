import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const returnRequestSchema = new Schema({
  bookId: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true },
  bookTitle: { type: String, required: true },
  userEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  defectDescription: { type: String, required: true },
  images: [String],
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected'] as const,
    default: 'pending',
  },
  createdAt: { type: Date, default: Date.now }
});

export type ReturnRequestAttributes = InferSchemaType<typeof returnRequestSchema>;
export type ReturnRequestDocument = HydratedDocument<ReturnRequestAttributes>;

export default defineModel<ReturnRequestAttributes>('ReturnRequest', returnRequestSchema);
