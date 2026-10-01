import type { CorsOptions } from 'cors';

import { config } from './env.js';

/**
 * Browsers send `Origin` without a trailing slash, so the allow-list is
 * normalised the same way in config/env.js before comparison.
 */
export const corsOptions: CorsOptions = {
  origin(origin, callback) {
    if (!origin || config.corsOrigins.includes(origin.replace(/\/+$/, ''))) {
      return callback(null, true);
    }
    // A 403 rather than a 500: a request from another site is a refusal, not a
    // fault here, and must not be logged or reported as one.
    return callback(
      Object.assign(new Error(`Origin ${origin} is not allowed by CORS`), { statusCode: 403 })
    );
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
