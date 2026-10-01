import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * One search of the catalogue: what was typed and how many books it found.
 *
 * Nothing about who searched. It feeds "Popular right now" under the search
 * box, and the administrator's view of what people look for and do not find.
 * Kept for 90 days.
 */
const SearchLogSchema = new Schema({
  term: { type: String, required: true, index: true },
  results: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 },
});

SearchLogSchema.index({ createdAt: -1 });

export type SearchLogAttributes = InferSchemaType<typeof SearchLogSchema>;

export default defineModel<SearchLogAttributes>('SearchLog', SearchLogSchema);
