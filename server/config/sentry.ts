import type { NodeOptions } from '@sentry/node';

import { config } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('sentry');

/**
 * The SDK, once it has been asked for.
 *
 * Loaded on demand rather than imported at the top: `@sentry/node` takes about
 * 1.3 seconds to import, paid on every start and every nodemon restart, and
 * development, where no DSN is set, has no use for it.
 */
let Sentry: typeof import('@sentry/node') | null = null;

let enabled = false;

/**
 * What Sentry may collect, stated rather than inherited.
 *
 * Version 11 made "more permissive data collection the default", and each of
 * these defaults to collecting. Left on, a report could carry a sign-in body
 * (an e-mail address and a password), an order's address and phone number,
 * documents written to MongoDB, and local variables in the throwing frame -
 * including one called `password` in the auth controller.
 *
 * Each is turned off explicitly, so a later release changing a default cannot
 * turn one back on. What is left is what a report needs: the error, its stack,
 * the source lines around it, the route, and the request id the error handler
 * adds - enough to find the fault, and nothing about the person it happened to.
 */
export const DATA_COLLECTION: NonNullable<NodeOptions['dataCollection']> = {
  // Automatic `user.*` - an e-mail or an IP address - on every event.
  userInfo: false,
  // The refresh cookie is a credential.
  cookies: false,
  // The Authorization header is the session.
  httpHeaders: false,
  // Sign-in, sign-up and password-reset bodies carry passwords; orders carry
  // addresses and phone numbers.
  httpBodies: [],
  // Kept, because `page=` and `search=` are what a report is debugged with -
  // but not the ones that name a person or carry a secret.
  urlQueryParams: { deny: ['email', 'token', 'code', 'otp', 'password'] },
  // Write payloads and results, which are user documents.
  databaseQueryData: false,
  queues: false,
  // Local variable values. `password` would be sent as it is.
  stackFrameVariables: false,
};

/** Everything `Sentry.init` is given. Separate so it can be tested. */
export const sentryOptions = (dsn: string): NodeOptions => ({
  dsn,
  environment: config.env,
  // Errors only by default. Tracing is a separate cost decision.
  tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0),
  dataCollection: DATA_COLLECTION,
  beforeSend(event) {
    // Belt and braces alongside the settings above and the logger's redaction:
    // never let a token or password leave the process inside a report.
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
  Sentry.init(sentryOptions(config.sentryDsn));

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
