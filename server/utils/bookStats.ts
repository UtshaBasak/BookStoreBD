import { createHmac } from 'crypto';

import type { Request } from 'express';
import type { Types } from 'mongoose';

import AddBook from '../models/AddBook.model.js';
import BookView from '../models/BookView.model.js';
import Wishlist from '../models/Wishlist.model.js';
import { jwtSecret } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { isDuplicateKeyError } from './error.js';

const log = createLogger('book-stats');

let indexReady: Promise<unknown> | null = null;

/** Crawlers, link previews and scripts, which are not readers. */
const NOT_A_READER = /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|telegram|discord|slack|curl|wget|python|headless|lighthouse/i;

/**
 * Counts a view of a book: once a day per person, by account when signed in
 * and by address and browser otherwise. The seller looking at their own
 * listing, and anything that is not a person, does not count.
 *
 * Never throws: a view count is not worth failing a page for.
 */
export const countView = async (
  req: Request,
  book: { _id: Types.ObjectId | string; sellerEmail?: string | null }
): Promise<void> => {
  try {
    const agent = String(req.get('user-agent') ?? '');
    if (!agent || NOT_A_READER.test(agent)) return;
    if (req.user?.email && req.user.email === book.sellerEmail) return;

    const viewer = req.user?.id ? `user:${req.user.id}` : `anon:${req.ip}:${agent}`;
    const key = createHmac('sha256', jwtSecret()).update(`view:${viewer}:${String(book._id)}`).digest('hex');
    // The unique index is what makes two views at once count once, so it has
    // to exist before the first one.
    // If building it fails, views are still counted: the index only matters
    // for two views of one book in the same instant, and a failure here used
    // to stop every view being counted until a restart.
    indexReady ??= BookView.init().catch((error: unknown) => {
      log.warn({ err: error }, 'Could not build the book-view index; counting without it');
    });
    await indexReady;
    try {
      const { upsertedCount } = await BookView.updateOne({ key }, { $setOnInsert: { key, createdAt: new Date() } }, { upsert: true });
      if (!upsertedCount) return; // already counted today
    } catch (error) {
      if (isDuplicateKeyError(error)) return; // counted by a view at the same moment
      throw error;
    }
    await AddBook.updateOne({ _id: book._id }, { $inc: { viewCount: 1 } });
  } catch (error) {
    log.warn({ err: error }, 'Could not count a view');
  }
};

/** Sets each book's wishlist count from the wishlists themselves. */
export const recountWishlists = async (bookIds: readonly (Types.ObjectId | string | null | undefined)[]): Promise<void> => {
  const ids = [...new Set(bookIds.filter(Boolean).map(String))];
  await Promise.all(
    ids.map(async (id) => AddBook.updateOne({ _id: id }, { wishlistCount: await Wishlist.countDocuments({ book: id }) }))
  );
};
