import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const CartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'UserTable', required: true, index: true },
  book: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true, index: true },
}, { timestamps: true });

CartSchema.index({ user: 1, book: 1 }, { unique: true });

export type CartAttributes = InferSchemaType<typeof CartSchema>;
export type CartDocument = HydratedDocument<CartAttributes>;

export default defineModel<CartAttributes>('Cart', CartSchema);
