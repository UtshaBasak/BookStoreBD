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

  await mongoose.connect(mongoUri());
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

  mongoose.connection.on('error', (error: unknown) => {
    log.error({ err: error }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('MongoDB disconnected');
  });

  return mongoose.connection;
};

export const disconnectDatabase = (): Promise<void> => mongoose.disconnect();
