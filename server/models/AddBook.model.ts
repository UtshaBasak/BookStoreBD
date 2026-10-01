import { Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

import { defineModel } from './defineModel.js';
import { priceWith } from '../config/pricing.js';
import { bookSearchKey } from '../utils/phonetic.js';

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
  sellerEmail: { type: String, required: true }, // the seller's account

  /*
   * The score, kept on the book rather than worked out on read, so the
   * catalogue can filter and sort by it without a join or an aggregate per
   * book. These two are rewritten whenever a review is written, edited or
   * removed, which is rare next to how often they are read.
   */
  ratingAverage: { type: Number, default: 0, min: 0, max: 5 },
  ratingCount: { type: Number, default: 0, min: 0 },
  /**
   * How wanted a book is, for shoppers to see: views (one per person a day,
   * see utils/bookStats.ts) and how many wishlists it is on.
   */
  viewCount: { type: Number, default: 0, min: 0 },
  wishlistCount: { type: Number, default: 0, min: 0 },
  stock: { type: Number, default: 1, min: 0 },    // allow zero

  /*
   * The seller's discount, and what it comes to. See config/pricing.ts: the
   * last three are worked out from price and discount on every save, never
   * written directly, and stored so the catalogue can sort by them.
   */
  discountType: { type: String, enum: ['percent', 'amount', null] as const, default: null },
  discountValue: { type: Number, default: 0, min: 0 },
  salePrice: { type: Number, min: 0 },
  discountPercent: { type: Number, default: 0, min: 0 },
  discountAmount: { type: Number, default: 0, min: 0 },
  /*
   * Title and author as sound-alike keys (utils/phonetic.ts), so a search in
   * English finds a Bangla title and the other way round. Worked out on save.
   */
  searchKey: { type: String, default: '' },
});

AddBookSchema.pre('validate', function () {
  const priced = priceWith(Number(this.price), {
    type: (this.discountType as 'percent' | 'amount' | null | undefined) ?? null,
    value: Number(this.discountValue ?? 0),
  });
  // A discount that no longer fits the price is dropped rather than kept
  // half-applied.
  if (priced.discountAmount === 0) {
    this.discountType = null;
    this.discountValue = 0;
  }
  this.salePrice = priced.salePrice;
  this.discountPercent = priced.discountPercent;
  this.discountAmount = priced.discountAmount;
  if (this.isNew || this.isModified('title') || this.isModified('author') || !this.searchKey?.includes('|')) {
    this.searchKey = bookSearchKey(this);
  }
});

/*
 * Indexes for the way the catalogue is queried.
 *
 * Filtering, sorting and paging happen in MongoDB, so these are the difference
 * between a page of results and a collection scan for every visitor. Each one
 * matches a sort the browse page offers; `bookType` and `sellerEmail` are the
 * two equality filters narrow enough to be worth combining with the default
 * order.
 *
 * `category` and `condition` are deliberately absent: they are matched
 * case-insensitively, which no index can serve. Normalising the stored
 * capitalisation, a data migration, would make them indexable.
 *
 * Every one ends in `_id`. The catalogue sorts by `{ <field>, _id }` so that
 * books which tie cannot shuffle between pages, and a sort is only served by
 * an index whose keys it prefixes; without `_id` each query would scan the
 * collection and sort in memory.
 */
AddBookSchema.index({ createdAt: -1, _id: -1 });
AddBookSchema.index({ salePrice: 1, _id: -1 });
// Quick deals, and the catalogue's default order: the biggest share off first.
AddBookSchema.index({ discountPercent: -1, createdAt: -1, _id: -1 });
AddBookSchema.index({ discountAmount: -1, _id: -1 });
AddBookSchema.index({ ratingAverage: -1, ratingCount: -1, _id: -1 });
AddBookSchema.index({ bookType: 1, createdAt: -1, _id: -1 });
AddBookSchema.index({ sellerEmail: 1, createdAt: -1, _id: -1 });

export type BookAttributes = InferSchemaType<typeof AddBookSchema>;
export type BookDocument = HydratedDocument<BookAttributes>;

/**
 * A book as it comes back from a `.lean()` query or through `populate`: a plain
 * object with no document methods, but still carrying its id.
 */
export type LeanBook = BookAttributes & { _id: Types.ObjectId };

const AddBook = defineModel<BookAttributes>('AddBook', AddBookSchema);
export default AddBook;
