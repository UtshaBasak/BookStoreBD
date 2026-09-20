import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const WishlistSchema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'UserTable',
      required: true,
      index: true,
    },
    book: {
      type: Schema.Types.ObjectId,
      ref: 'AddBook',
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    }
  },
  { timestamps: true }
);

export type WishlistAttributes = InferSchemaType<typeof WishlistSchema>;
export type WishlistDocument = HydratedDocument<WishlistAttributes>;

const Wishlist = defineModel<WishlistAttributes>('Wishlist', WishlistSchema);
export default Wishlist;
