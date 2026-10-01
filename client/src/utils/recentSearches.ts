import { allowed } from './consent.js';

/**
 * What this visitor searched for lately, on this device only, for the search
 * box to offer again. Kept to the last six.
 */
const KEY = 'recentSearches';
const MAX = 6;

export const readRecentSearches = (): string[] => {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(stored) ? stored.filter((term): term is string => typeof term === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
};

const write = (terms: string[]): void => {
  try {
    // Kept only with the visitor's say-so; forgetting always works.
    if (terms.length && allowed('preferences')) localStorage.setItem(KEY, JSON.stringify(terms.slice(0, MAX)));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage unavailable: nothing is remembered */
  }
};

export const rememberSearch = (term: string): void => {
  const clean = term.trim().replace(/\s+/g, ' ');
  if (clean.length < 2) return;
  write([clean, ...readRecentSearches().filter((t) => t.toLowerCase() !== clean.toLowerCase())]);
};

export const forgetSearch = (term: string): void => write(readRecentSearches().filter((t) => t !== term));

export const clearRecentSearches = (): void => write([]);
