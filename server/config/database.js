import mongoose from 'mongoose';
import { config } from './env.js';

/**
 * Opens the shared Mongoose connection. Callers should await this before the
 * HTTP server starts listening so requests never hit a disconnected client.
 */
export const connectDatabase = async () => {
  mongoose.set('strictQuery', true);

  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  return mongoose.connection;
};

export const disconnectDatabase = () => mongoose.disconnect();
