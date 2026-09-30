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
  // old version in place. `orderNumber` was unique until an order was allowed
  // more than one line, and a database created before that goes on rejecting
  // the second book in every basket until the stale index is dropped.
  try {
    await mongoose.syncIndexes();
  } catch (error) {
    // Not fatal: the application runs, and the log says which index to look at.
    log.error({ err: error }, 'Could not synchronise indexes');
  }

  // Listings from before discounts existed have no sale price, and the
  // catalogue now filters and sorts by it: without one they would sort last
  // and fall outside every price range. Their sale price is their price.
  try {
    const { default: AddBook } = await import('../models/AddBook.model.js');
    const { modifiedCount } = await AddBook.updateMany({ salePrice: { $exists: false } }, [
      { $set: { salePrice: '$price', discountPercent: 0, discountAmount: 0, discountType: null, discountValue: 0 } },
    ]);
    if (modifiedCount) log.info({ modifiedCount }, 'Gave older listings a sale price');
  } catch (error) {
    log.error({ err: error }, 'Could not backfill sale prices');
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
