import type { Book } from '@shared/api.js';

/**
 * Which books are in the cart, or on the wishlist.
 *
 * A lookup rather than a list: every page that renders a catalogue asks "is
 * this one in?" per book, and a keyed object answers that in one step instead
 * of scanning an array per row.
 */
export type BookFlags = Record<string, boolean>;

export const flagsFor = (books: Book[]): BookFlags =>
  Object.fromEntries(books.map((book) => [book._id, true]));
