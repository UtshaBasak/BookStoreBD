import type { Types } from 'mongoose';

import AddBook, { type LeanBook } from '../../models/AddBook.model.js';
import BookEmbedding from '../../models/BookEmbedding.model.js';
import { geminiSettings } from '../../config/env.js';
import { createLogger } from '../../config/logger.js';
import { embed, geminiEnabled } from '../gemini.js';
import { stripContactDetails } from '../contactDetails.js';
import { LIST_IMAGE_PROJECTION } from '../projections.js';
import { textHash } from '../moderation/text.js';

const log = createLogger('assistant');

/**
 * Search by meaning: the assistant's answer to "a sad novel about the
 * liberation war", which shares no words with the title it should find.
 *
 * Each listing's public text is embedded once (and again when it changes) by
 * the background worker; a question is embedded when asked, and compared with
 * every listing's vector in memory. The vectors are cached for ten minutes.
 * Used beside the ordinary search, never instead of it.
 */

/** The text a listing is known by: public fields only, contact details removed. */
export const embeddingText = (book: Pick<LeanBook, 'title' | 'author' | 'category' | 'desc' | 'bookType'>): string =>
  stripContactDetails(
    [book.title, `by ${book.author}`, (book.category ?? []).join(', '), book.bookType === 'old' ? 'second-hand' : 'new', (book.desc ?? '').slice(0, 600)]
      .filter(Boolean)
      .join('. ')
  );

/** Embeds one listing if its text changed. Returns whether it did. GeminiErrors are the caller's to handle. */
export const embedListing = async (id: Types.ObjectId): Promise<boolean> => {
  const book = await AddBook.findById(id, { title: 1, author: 1, category: 1, desc: 1, bookType: 1 }).lean<LeanBook>();
  if (!book) {
    await BookEmbedding.deleteOne({ book: id });
    return false;
  }
  const text = embeddingText(book);
  const hash = textHash(text);
  const model = geminiSettings().embeddingModel;
  const existing = await BookEmbedding.findOne({ book: id }, { textHash: 1, model: 1 }).lean();
  if (existing?.textHash === hash && existing.model === model) return false;
  const [vector] = await embed([text], { purpose: 'embed-listing' });
  await BookEmbedding.updateOne({ book: id }, { $set: { textHash: hash, model, vector, updatedAt: new Date() } }, { upsert: true });
  cache = null;
  return true;
};

let cache: { at: number; rows: { book: string; vector: number[]; norm: number }[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

const norm = (vector: readonly number[]): number => Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;

const vectors = async () => {
  if (!cache || Date.now() - cache.at > CACHE_MS) {
    const model = geminiSettings().embeddingModel;
    const rows = await BookEmbedding.find({ model }, { book: 1, vector: 1 }).lean();
    cache = { at: Date.now(), rows: rows.map((row) => ({ book: String(row.book), vector: row.vector, norm: norm(row.vector) })) };
  }
  return cache.rows;
};

/** For tests. */
export const forgetEmbeddingCache = (): void => {
  cache = null;
};

/**
 * Listings closest in meaning to a description, best first, within the
 * filter given (price, stock...). Empty when the model is off, nothing is
 * embedded yet, or nothing is close enough.
 */
export const searchByMeaning = async (description: string, filter: Record<string, unknown>, limit: number): Promise<LeanBook[]> => {
  if (!geminiEnabled()) return [];
  const rows = await vectors();
  if (!rows.length) return [];
  let query: number[];
  try {
    [query] = (await embed([stripContactDetails(description).slice(0, 300)], { feature: 'assistant', purpose: 'embed-query' })) as [number[]];
  } catch (error) {
    log.info({ err: error }, 'Search by meaning unavailable');
    return [];
  }
  const queryNorm = norm(query);
  const ranked = rows
    .map((row) => ({
      book: row.book,
      score: row.vector.length === query.length ? row.vector.reduce((sum, value, i) => sum + value * (query[i] ?? 0), 0) / (row.norm * queryNorm) : 0,
    }))
    .filter((row) => row.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit * 3);
  if (!ranked.length) return [];
  const books = await AddBook.find({ ...filter, _id: { $in: ranked.map((row) => row.book) } }, LIST_IMAGE_PROJECTION).lean<LeanBook[]>();
  const order = new Map(ranked.map((row, index) => [row.book, index]));
  return books.sort((a, b) => (order.get(String(a._id)) ?? 0) - (order.get(String(b._id)) ?? 0)).slice(0, limit);
};
