import SearchLog from '../models/SearchLog.model.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('search-log');

/** A search as it is counted: lower case, single spaces, at most 100 characters. */
export const normaliseTerm = (term: string): string => term.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 100);

/** Notes a catalogue search. Never throws, and never holds up the results. */
export const logSearch = (term: string, results: number): void => {
  const normalised = normaliseTerm(term);
  if (normalised.length < 2) return;
  SearchLog.create({ term: normalised, results }).catch((error: unknown) => log.warn({ err: error }, 'Could not log a search'));
};

let cached: { at: number; terms: string[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

/**
 * What people have searched for most in the last fortnight and found
 * something for, for "Popular right now". Cached for ten minutes: it changes
 * slowly, and every search box asks for it.
 */
export const popularSearches = async (limit = 8): Promise<string[]> => {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.terms.slice(0, limit);
  const rows = await SearchLog.aggregate<{ _id: string; count: number }>([
    { $match: { createdAt: { $gt: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) }, results: { $gt: 0 } } },
    { $group: { _id: '$term', count: { $sum: 1 } } },
    { $sort: { count: -1, _id: 1 } },
    { $limit: 20 },
  ]);
  cached = { at: Date.now(), terms: rows.map((row) => row._id) };
  return cached.terms.slice(0, limit);
};

/** For tests: forget the cached list. */
export const forgetPopularSearches = (): void => {
  cached = null;
};
