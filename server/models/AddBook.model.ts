import { Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

import { defineModel } from './defineModel.js';

const AddBookSchema = new Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  publisher: { type: String, required: true },
  country: { type: String, required: true },
  language: { type: String, required: true },
  isbn: { type: String, required: true },
  pages: { type: Number }, // optional: see the note in the addBook schema
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

  /*
   * The score, kept on the book rather than worked out on read.
   *
   * The catalogue page loads every listing and filters and sorts them in the
   * browser, so a rating that needed a join or an aggregate per book would
   * make that impossible. These two are rewritten whenever a review is
   * written, edited or removed, which is rare next to how often they are read.
   */
  ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
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
