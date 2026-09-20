import { Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

import { defineModel } from './defineModel.js';

const AddBookSchema = new Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  publisher: { type: String, required: true },
  country: { type: String, required: true },
  language: { type: String, required: true },
  isbn: { type: String, required: true },
  pages: { type: Number, required: true },
  price: { type: Number, required: true, min: 0 }, // allow zero
  desc: { type: String, required: true },
  category: [{ type: String, required: true }],
  bookType: { type: String, enum: ['new', 'old'] as const, required: true },
  condition: { type: String },
  conditionDetails: { type: String },
  // Either a Cloudinary delivery URL or, for records predating image hosting,
  // a base64 data URI.
  images: [{ type: String }],
  // Parallel to `images`, and only populated for hosted images. Needed to
  // remove the asset when a listing is deleted.
  imagePublicIds: [{ type: String }],
  createdAt: { type: Date, default: Date.now },
  sellerEmail: { type: String, required: true }, // NEW: track seller
  stock: { type: Number, default: 1, min: 0 }    // allow zero
});

export type BookAttributes = InferSchemaType<typeof AddBookSchema>;
export type BookDocument = HydratedDocument<BookAttributes>;

/**
 * A book as it comes back from a `.lean()` query or through `populate`: a plain
 * object with no document methods, but still carrying its id.
 */
export type LeanBook = BookAttributes & { _id: Types.ObjectId };

const AddBook = defineModel<BookAttributes>('AddBook', AddBookSchema);
export default AddBook;
