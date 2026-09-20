import * as Sentry from '@sentry/node';

import { config } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('sentry');

let enabled = false;

/**
 * Starts error reporting, if a DSN is configured.
 *
 * Entirely optional: with `SENTRY_DSN` unset — which is the default, and the
 * case for every local run — this is a no-op and nothing is sent anywhere.
 */
export const initErrorTracking = () => {
  if (!config.sentryDsn) {
    log.debug('SENTRY_DSN not set; error tracking disabled');
    return false;
  }

  Sentry.init({
    dsn: config.sentryDsn,
    environment: config.env,
    // Errors only by default. Tracing is a separate cost decision.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
    beforeSend(event) {
      // Belt and braces alongside the logger's redaction: never let a token or
      // password leave the process inside a report.
      if (event.request?.headers) {
        delete event.request.headers.authorization;
        delete event.request.headers.cookie;
      }
      if (event.request?.data?.password) event.request.data.password = '[Redacted]';
      return event;
    },
  });

  enabled = true;
  log.info({ environment: config.env }, 'Error tracking enabled');
  return true;
};

export const isErrorTrackingEnabled = () => enabled;

/**
 * Reports an exception. Called explicitly from the error handler rather than
 * left to auto-instrumentation, so the behaviour is the same under ESM and
 * can be asserted in a test.
 */
export const captureException = (error, context = {}) => {
  if (!enabled) return;
  Sentry.captureException(error, { extra: context });
};

export default { initErrorTracking, captureException, isErrorTrackingEnabled };
