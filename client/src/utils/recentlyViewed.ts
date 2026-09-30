/**
 * The books this browser has looked at, most recent first.
 *
 * Kept in the browser rather than on the account: it works for a visitor who
 * has not signed in, it costs the server nothing, and it is nobody's business
 * but theirs. The homepage shows it as Recently viewed and sends it with the
 * request for Top picks. Storage can be unavailable - a private window, a
 * blocked site - and then the shelf is simply empty.
 */
const KEY = 'recentlyViewed';
const MAX = 20;
const OBJECT_ID = /^[a-f0-9]{24}$/i;

export const getRecentlyViewed = (): string[] => {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string' && OBJECT_ID.test(id)) : [];
  } catch {
    return [];
  }
};

export const recordView = (bookId: string): void => {
  if (!OBJECT_ID.test(bookId)) return;
  try {
    const next = [bookId, ...getRecentlyViewed().filter((id) => id !== bookId)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Not recorded; nothing depends on it.
  }
};
