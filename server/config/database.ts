import mongoose, { type Connection } from 'mongoose';

import { mongoUri } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('database');

/**
 * Opens the shared Mongoose connection. Callers should await this before the
 * HTTP server starts listening so requests never hit a disconnected client.
 */
export const connectDatabase = async (): Promise<Connection> => {
  mongoose.set('strictQuery', true);

  try {
    await mongoose.connect(mongoUri());
  } catch (error) {
    // The usual cause in development is that Docker is not running yet, and
    // the error Mongoose gives - a page of server-selection internals - does
    // not say so. This line does; the full error follows it.
    const refused = /ECONNREFUSED|ServerSelection/.test(String((error as Error)?.name ?? error));
    if (refused) {
      log.error(
        'Cannot reach MongoDB. Is it running? For the local setup: docker compose up -d mongo'
      );
    }
    throw error;
  }
  log.info('MongoDB connected');

  // Mongoose only ever adds indexes; one whose definition changes leaves the
  // old version in place. Syncing drops stale ones, such as a unique index on
  // `orderNumber` that would reject the second book in a multi-line order.
  try {
    await mongoose.syncIndexes();
  } catch (error) {
    // Not fatal: the application runs, and the log says which index to look at.
    log.error({ err: error }, 'Could not synchronise indexes');
  }

  // The catalogue filters and sorts by sale price, so a listing without one
  // would sort last and fall outside every price range. Its sale price is its
  // price.
  try {
    const { default: AddBook } = await import('../models/AddBook.model.js');
    const { modifiedCount } = await AddBook.updateMany({ salePrice: { $exists: false } }, [
      { $set: { salePrice: '$price', discountPercent: 0, discountAmount: 0, discountType: null, discountValue: 0 } },
    ], { updatePipeline: true }); // Mongoose 9 refuses a pipeline update without it
    if (modifiedCount) log.info({ modifiedCount }, 'Gave older listings a sale price');
  } catch (error) {
    log.error({ err: error }, 'Could not backfill sale prices');
  }

  // Backfills the sound-alike search key (utils/phonetic.ts) on listings that
  // lack it. Computed in code, so one document at a time.
  try {
    const { default: AddBook } = await import('../models/AddBook.model.js');
    const { bookSearchKey } = await import('../utils/phonetic.js');
    const missing = await AddBook.find(
      // Missing, or without the word-by-word half of the key.
      { $or: [{ searchKey: { $exists: false } }, { searchKey: { $not: /\|/ } }] },
      { title: 1, author: 1 }
    ).lean();
    if (missing.length) {
      await AddBook.bulkWrite(
        missing.map((book) => ({
          updateOne: { filter: { _id: book._id }, update: { $set: { searchKey: bookSearchKey(book) } } },
        }))
      );
      log.info({ count: missing.length }, 'Gave older listings a search key');
    }
  } catch (error) {
    log.error({ err: error }, 'Could not backfill search keys');
  }

  mongoose.connection.on('error', (error: unknown) => {
    log.error({ err: error }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('MongoDB disconnected');
  });

  return mongoose.connection;
};

export const disconnectDatabase = (): Promise<void> => mongoose.disconnect();
