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

  mongoose.connection.on('error', (error: unknown) => {
    log.error({ err: error }, 'MongoDB connection error');
  });

  mongoose.connection.on('disconnected', () => {
    log.warn('MongoDB disconnected');
  });

  return mongoose.connection;
};

export const disconnectDatabase = (): Promise<void> => mongoose.disconnect();
