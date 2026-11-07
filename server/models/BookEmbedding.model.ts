import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * What a listing is about, as a vector, for the assistant's search by
 * description ("a sad novel about the liberation war"). Made from public text
 * only - title, author, categories and the start of the description - when a
 * listing is added or changed, by the background worker.
 *
 * Compared in memory rather than with a database vector index: the catalogue
 * is small, the free Atlas tier allows only three search indexes, and the
 * in-memory test database has none.
 */
const BookEmbeddingSchema = new Schema({
  book: { type: Schema.Types.ObjectId, required: true, unique: true },
  /** A hash of the text embedded, so an unchanged listing is not embedded again. */
  textHash: { type: String, required: true },
  model: { type: String, required: true },
  vector: { type: [Number], required: true },
  updatedAt: { type: Date, default: Date.now },
});

export type BookEmbeddingAttributes = InferSchemaType<typeof BookEmbeddingSchema>;

export default defineModel<BookEmbeddingAttributes>('BookEmbedding', BookEmbeddingSchema);
