import { config } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('sentry');

/**
 * The SDK, once it has been asked for.
 *
 * Loaded on demand rather than imported at the top: `@sentry/node` takes about
 * 1.3 seconds to import, which is paid on every start and on every restart
 * nodemon does after a save - and in development, where no DSN is ever set,
 * it was paid for nothing.
 */
let Sentry: typeof import('@sentry/node') | null = null;

let enabled = false;

/**
 * Starts error reporting, if a DSN is configured.
 *
 * Entirely optional: with `SENTRY_DSN` unset — which is the default, and the
 * case for every local run — this is a no-op and nothing is sent anywhere.
 */
export const initErrorTracking = async (): Promise<boolean> => {
  if (!config.sentryDsn) {
    log.debug('SENTRY_DSN not set; error tracking disabled');
    return false;
  }

  Sentry = await import('@sentry/node');
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
      const data = event.request?.data;
      if (data && typeof data === 'object' && 'password' in data) {
        (data as Record<string, unknown>).password = '[Redacted]';
      }
      return event;
    },
  });

  enabled = true;
  log.info({ environment: config.env }, 'Error tracking enabled');
  return true;
};

export const isErrorTrackingEnabled = (): boolean => enabled;

/**
 * Reports an exception. Called explicitly from the error handler rather than
 * left to auto-instrumentation, so the behaviour is the same under ESM and
 * can be asserted in a test.
 */
export const captureException = (
  error: unknown,
  context: Record<string, unknown> = {}
): void => {
  if (!enabled || !Sentry) return;
  Sentry.captureException(error, { extra: context });
};

export default { initErrorTracking, captureException, isErrorTrackingEnabled };
