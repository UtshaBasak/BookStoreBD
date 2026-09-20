import type { ErrorRequestHandler, RequestHandler } from 'express';

import { logger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';
import { captureException } from '../config/sentry.js';

/** Catch-all for unmatched routes. Runs before the error handler below. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
};

/** Anything thrown can reach here, so read it defensively rather than cast. */
const statusOf = (err: unknown): number => {
  const candidate = (err as { statusCode?: unknown })?.statusCode;
  return typeof candidate === 'number' ? candidate : 500;
};

const messageOf = (err: unknown): string => errorMessage(err) || 'Internal Server Error';

// Express identifies error handlers by their four-argument signature, so
// `next` must stay in the parameter list even though it is unused.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const statusCode = statusOf(err);
  const message = messageOf(err);

  if (statusCode >= 500) {
    // req.log carries the request id, so the stack ties back to the access
    // log line for the same request.
    (req.log ?? logger).error({ err }, 'Unhandled error');
    // No-op unless SENTRY_DSN is configured.
    captureException(err, { requestId: req.id, method: req.method, url: req.originalUrl });
  }

  res.status(statusCode).json({
    success: false,
    statusCode,
    message,
  });
};
