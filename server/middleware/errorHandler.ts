import type { ErrorRequestHandler, RequestHandler } from 'express';

import { logger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';
import { captureException } from '../config/sentry.js';
import { languageOf, t } from '../utils/language.js';

/** Catch-all for unmatched routes. Runs before the error handler below. */
export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({
    success: false,
    statusCode: 404,
    message: t(req, `Route ${req.method} ${req.originalUrl} not found`, `${req.method} ${req.originalUrl} পথটি পাওয়া যায়নি`),
  });
};

/**
 * What multer throws when a limit is hit.
 *
 * It carries a `code` rather than a status, so it is mapped here: an upload
 * over a limit is the caller's to fix, not a server error, and the answer
 * says what the limit was.
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

/** What multer's limits say, in Bangla; its English stays its own. */
const MULTER_BN: Record<string, string> = {
  LIMIT_FILE_SIZE: 'ফাইলটি অনেক বড়',
  LIMIT_FILE_COUNT: 'অনেক বেশি ফাইল',
  LIMIT_UNEXPECTED_FILE: 'অপ্রত্যাশিত ফাইল',
  LIMIT_PART_COUNT: 'অনেক বেশি অংশ',
  LIMIT_FIELD_COUNT: 'অনেক বেশি ঘর',
  LIMIT_FIELD_KEY: 'ঘরের নাম অনেক লম্বা',
  LIMIT_FIELD_VALUE: 'ঘরের মান অনেক লম্বা',
};

const messageOf = (err: unknown, req: Parameters<typeof languageOf>[0]): string => {
  if (languageOf(req) === 'bn') {
    if ((err as { name?: unknown })?.name === 'MulterError') {
      const bn = MULTER_BN[String((err as { code?: unknown }).code ?? '')];
      if (bn) return bn;
    }
    if (!errorMessage(err)) return 'সার্ভারে একটি সমস্যা হয়েছে';
  }
  return errorMessage(err) || 'Internal Server Error';
};

// Express identifies error handlers by their four-argument signature, so
// `next` must stay in the parameter list even though it is unused.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const statusCode = statusOf(err);
  const message = messageOf(err, req);

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
