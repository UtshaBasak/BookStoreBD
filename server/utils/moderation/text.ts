import { createHash } from 'crypto';

import { toAsciiDigits } from '../contactDetails.js';

/**
 * Text as moderation compares it: lower case, Bangla digits as ASCII, and
 * every run of punctuation or space as one space, with a space at each end so
 * a phrase can be matched as whole words in either script (`\b` does not see
 * Bangla letters as word characters).
 */
export const normalise = (text: string): string =>
  ` ${toAsciiDigits(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ')
    .trim()} `;

/** Whether a phrase occurs in normalised text as whole words. */
export const hasPhrase = (normalised: string, phrase: string): boolean => {
  const needle = normalise(phrase);
  return needle.trim().length > 0 && normalised.includes(needle);
};

/** The phrases from a list that occur in a text. */
export const phrasesIn = (text: string, phrases: readonly string[]): string[] => {
  const haystack = normalise(text);
  return phrases.filter((phrase) => hasPhrase(haystack, phrase));
};

/** A hash of the words, so "Great book!!" and "great  book" are the same text. */
export const textHash = (text: string): string => createHash('sha256').update(normalise(text).trim()).digest('hex');

/** Three-word shingles, for near-duplicate text. */
export const shingles = (text: string): Set<string> => {
  const words = normalise(text).trim().split(' ').filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + 2 < words.length; i += 1) out.add(`${words[i]} ${words[i + 1]} ${words[i + 2]}`);
  if (!out.size && words.length) out.add(words.join(' '));
  return out;
};

/** How alike two shingle sets are, 0 to 1. */
export const similarity = (a: Set<string>, b: Set<string>): number => {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const item of a) if (b.has(item)) shared += 1;
  return shared / (a.size + b.size - shared);
};

/** How many bits differ between two hex hashes of the same length. */
export const hammingDistance = (a: string, b: string): number => {
  if (a.length !== b.length) return Number.POSITIVE_INFINITY;
  let distance = 0;
  for (let i = 0; i < a.length; i += 1) {
    let bits = Number.parseInt(a[i] ?? '0', 16) ^ Number.parseInt(b[i] ?? '0', 16);
    while (bits) {
      distance += bits & 1;
      bits >>= 1;
    }
  }
  return distance;
};

/** The median of some numbers, or null for none. */
export const median = (values: readonly number[]): number | null => {
  if (!values.length) return null;
  const sorted = [...values].sort((x, y) => x - y);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[middle] ?? null) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
};
