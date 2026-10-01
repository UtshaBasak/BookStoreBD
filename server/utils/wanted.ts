import type { Types } from 'mongoose';

import AddBook from '../models/AddBook.model.js';
import WantedBook from '../models/WantedBook.model.js';
import { createLogger } from '../config/logger.js';
import { notify } from './notify.js';
import { phoneticKey } from './phonetic.js';
import { dispatchShopMail, wantedFoundEmail } from './shopMail.js';

const log = createLogger('wanted');

/** A title or author as its sound-alike key, spaces and all punctuation gone. */
export const keyOf = (text: string | null | undefined): string => phoneticKey(text).replace(/[^A-Z0-9]/g, '');

/**
 * An ISBN as thirteen digits, or '' when it is not one. An ISBN-10 becomes
 * its ISBN-13, so the two forms of one book match.
 */
export const normaliseIsbn = (value: string | null | undefined): string => {
  const raw = String(value ?? '').toUpperCase().replace(/[^0-9X]/g, '');
  if (/^\d{13}$/.test(raw)) return raw;
  if (/^\d{9}[\dX]$/.test(raw)) {
    const core = `978${raw.slice(0, 9)}`;
    const sum = [...core].reduce((total, digit, index) => total + Number(digit) * (index % 2 ? 3 : 1), 0);
    return `${core}${(10 - (sum % 10)) % 10}`;
  }
  return '';
};

/** Two authors are the same unless both are given and neither contains the other. */
const sameAuthor = (a: string, b: string): boolean => !a || !b || a === b || a.includes(b) || b.includes(a);

/** Whether a book - wanted or listed - is the one asked for. */
export const isSameBook = (
  wanted: { isbn?: string | null; titleKey: string; authorKey?: string | null },
  book: { isbn?: string | null; title?: string | null; author?: string | null }
): boolean => {
  const isbn = normaliseIsbn(book.isbn);
  if (wanted.isbn && isbn) return wanted.isbn === isbn;
  const titleKey = keyOf(book.title);
  return titleKey.length >= 2 && titleKey === wanted.titleKey && sameAuthor(wanted.authorKey ?? '', keyOf(book.author));
};

/** A listing already in stock that is this book, if there is one. */
export const listedAlready = async (request: { title: string; author?: string; isbn?: string }) => {
  const isbn = normaliseIsbn(request.isbn);
  const titleKey = keyOf(request.title);
  const wanted = { isbn, titleKey, authorKey: keyOf(request.author) };
  // Listings keep the ISBN as typed, hyphens and all; the nine digits an
  // ISBN-10 and its ISBN-13 share find either.
  const isbnPattern = isbn ? isbn.slice(3, 12).split('').join('[- ]?') : '';
  const firstWord = phoneticKey(request.title).split(/\s+/)[0] ?? '';
  const candidates = await AddBook.find(
    {
      stock: { $gt: 0 },
      $or: [
        ...(isbnPattern ? [{ isbn: { $regex: isbnPattern } }] : []),
        ...(firstWord ? [{ searchKey: { $regex: `^${firstWord}` } }] : []),
      ],
    },
    { title: 1, author: 1, isbn: 1 }
  )
    .limit(50)
    .lean();
  return candidates.find((book) => isSameBook(wanted, book)) ?? null;
};

/**
 * A new listing: everyone waiting for this book on the Wanted board hears that
 * it is here, in the app and by e-mail, and the entry is marked found. The
 * seller is told how many were waiting. Never throws.
 */
export const fulfilWanted = async (book: {
  _id: Types.ObjectId | string;
  title: string;
  author?: string | null;
  isbn?: string | null;
  sellerEmail: string;
}): Promise<number> => {
  try {
    const isbn = normaliseIsbn(book.isbn);
    const candidates = await WantedBook.find({
      status: 'open',
      $or: [...(isbn ? [{ isbn }] : []), { titleKey: keyOf(book.title) }],
    });
    const matches = candidates.filter((wanted) => isSameBook(wanted, book));
    if (!matches.length) return 0;

    const link = `/book/${String(book._id)}`;
    const people = [...new Set(matches.flatMap((wanted) => wanted.requesters.map((r) => r.email)))].filter(
      (email) => email !== book.sellerEmail
    );
    await WantedBook.updateMany(
      { _id: { $in: matches.map((wanted) => wanted._id) } },
      { status: 'found', foundBook: book._id, foundAt: new Date() }
    );
    await notify(people, {
      type: 'wanted-found',
      title: `"${book.title}" is here!`,
      body: 'A book you asked for on the Wanted board has just been listed.',
      link,
    });
    for (const email of people) dispatchShopMail(email, wantedFoundEmail(book.title, book.author ?? '', link), 'wanted');
    if (people.length) {
      await notify([book.sellerEmail], {
        type: 'book-request',
        title: `${people.length} ${people.length === 1 ? 'reader was' : 'readers were'} waiting for "${book.title}"`,
        body: 'They asked for it on the Wanted board, and have been told it is here.',
        link,
      });
    }
    log.info({ matches: matches.length, people: people.length }, 'Wanted books found');
    return people.length;
  } catch (error) {
    log.warn({ err: error }, 'Could not check the Wanted board');
    return 0;
  }
};
