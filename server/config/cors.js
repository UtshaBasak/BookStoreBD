import { config } from './env.js';

/**
 * Browsers send `Origin` without a trailing slash, so the allow-list is
 * normalised the same way in config/env.js before comparison.
 */
export const corsOptions = {
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin.replace(/\/+$/, ''))) {
      return callback(null, true);
    }
    return callback(new Error(`Origin ${origin} is not allowed by CORS`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

export const socketCorsOptions = {
  origin: config.corsOrigins,
  methods: ['GET', 'POST'],
  credentials: true,
};
