import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const purchaseSchema = new Schema({
  bookId: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true },
  userEmail: { type: String, required: true },
  date: { type: Date, default: Date.now },
  isReturned: { type: Boolean, default: false },
});

export type PurchaseAttributes = InferSchemaType<typeof purchaseSchema>;
export type PurchaseDocument = HydratedDocument<PurchaseAttributes>;

export default defineModel<PurchaseAttributes>('Purchase', purchaseSchema);
