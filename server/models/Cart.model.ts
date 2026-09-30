import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const CartSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'UserTable', required: true, index: true },
  book: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true, index: true },
  // How many copies: one per book used to be all a cart could hold, and the
  // number was only chosen at checkout.
  quantity: { type: Number, default: 1, min: 1 },
}, { timestamps: true });

CartSchema.index({ user: 1, book: 1 }, { unique: true });

export type CartAttributes = InferSchemaType<typeof CartSchema>;
export type CartDocument = HydratedDocument<CartAttributes>;

export default defineModel<CartAttributes>('Cart', CartSchema);
