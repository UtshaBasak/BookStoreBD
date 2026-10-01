import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * That somebody viewed a book today, so the next view counts only tomorrow.
 *
 * The key is an HMAC of who and which book (utils/bookStats.ts), so the table
 * says nothing about who looked at what, and it empties itself after a day.
 */
const BookViewSchema = new Schema({
  key: { type: String, required: true, unique: true },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 },
});

export type BookViewAttributes = InferSchemaType<typeof BookViewSchema>;

export default defineModel<BookViewAttributes>('BookView', BookViewSchema);
