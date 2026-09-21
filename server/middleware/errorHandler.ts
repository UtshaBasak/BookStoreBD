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

/**
 * What multer throws when a limit is hit.
 *
 * It carries a `code` rather than a status, so without this an upload over the
 * size limit answered 500 - a server error for something the caller did, and
 * nothing to tell them what the limit was.
 */
const MULTER_STATUS: Record<string, number> = {
  LIMIT_FILE_SIZE: 413,
  LIMIT_FILE_COUNT: 400,
  LIMIT_UNEXPECTED_FILE: 400,
  LIMIT_PART_COUNT: 400,
  LIMIT_FIELD_COUNT: 400,
  LIMIT_FIELD_KEY: 400,
  LIMIT_FIELD_VALUE: 413,
};

/** Anything thrown can reach here, so read it defensively rather than cast. */
const statusOf = (err: unknown): number => {
  const candidate = (err as { statusCode?: unknown })?.statusCode;
  if (typeof candidate === 'number') return candidate;

  if ((err as { name?: unknown })?.name === 'MulterError') {
    const code = String((err as { code?: unknown }).code ?? '');
    return MULTER_STATUS[code] ?? 400;
  }

  return 500;
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
