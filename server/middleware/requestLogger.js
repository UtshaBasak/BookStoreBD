import { randomUUID } from 'crypto';

import pinoHttp from 'pino-http';

import { logger } from '../config/logger.js';

/** The URL as the client asked for it, before Express rewrote it for a router. */
const reqUrl = (req) => req.originalUrl ?? req.url;

/**
 * Logs one line per request and hangs a correlation id on `req.id`.
 *
 * The id also goes out as `X-Request-Id`, so a report of "it failed at 14:32"
 * can be tied to an exact request rather than guessed at from timestamps.
 */
export const requestLoggerOptions = {

  genReqId: (req, res) => {
    // Honour an id from a proxy or the client so a trace survives the hop.
    const existing = req.headers['x-request-id'];
    const id = typeof existing === 'string' && existing.length <= 128 ? existing : randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },

  // Server faults are errors, client mistakes are warnings, everything else
  // is routine. Without this every 404 would look like a failure.
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },

  // originalUrl, not url: Express rewrites req.url relative to a router's
  // mount point, so a request to /book logs as "GET /" by the time it
  // finishes.
  customSuccessMessage: (req, res) => `${req.method} ${reqUrl(req)} ${res.statusCode}`,
  customErrorMessage: (req, res, err) => `${req.method} ${reqUrl(req)} failed: ${err.message}`,

  // Only the fields worth keeping. The defaults include every header, which
  // is noisy and drags sensitive values into the log for redaction to catch.
  serializers: {
    req: (req) => ({
      id: req.id,
      method: req.method,
      url: reqUrl(req),
      remoteAddress: req.remoteAddress,
    }),
    res: (res) => ({ statusCode: res.statusCode }),
  },

  // The health check runs constantly in a container and says nothing useful.
  autoLogging: {
    ignore: (req) => reqUrl(req) === '/health',
  },
};

/**
 * Built from the exported options so a test can construct the same middleware
 * around a capturing logger, rather than asserting against a copy of the
 * configuration that could drift from this one.
 */
export const createRequestLogger = (instance = logger) =>
  pinoHttp({ ...requestLoggerOptions, logger: instance });

export const requestLogger = createRequestLogger();

export default requestLogger;
