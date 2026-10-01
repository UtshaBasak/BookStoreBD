import { API_BASE_URL } from '../config/api.js';
import { getToken } from './auth.js';

/**
 * Where a caught error goes.
 *
 * In development, the console. In a build, the API, which writes the report
 * into the same structured log as everything else and forwards it to Sentry
 * when a DSN is configured. A visitor's devtools stay quiet either way, and
 * no request details are printed on the live site.
 *
 * By design, not the Sentry browser SDK: it adds about 30 KB to the bundle and
 * another origin to the Content-Security-Policy. Source-mapped stacks and
 * breadcrumbs could be added later without changing the call sites.
 */

/** Enough to see a pattern; not enough to fill a log from one broken page. */
const MAX_REPORTS = 20;

/** What has already been sent this session, so a loop reports once. */
const alreadySent = new Set<string>();
let sentCount = 0;
/** Guards against an error thrown while reporting an error. */
let reporting = false;

const describe = (error: unknown): { message: string; stack?: string } => {
  if (error instanceof Error) {
    return { message: error.message || error.name, stack: error.stack };
  }
  if (typeof error === 'string') return { message: error };

  try {
    return { message: JSON.stringify(error).slice(0, 200) };
  } catch {
    return { message: String(error) };
  }
};

const send = (context: string, error: unknown): void => {
  if (reporting || sentCount >= MAX_REPORTS) return;

  const { message, stack } = describe(error);
  const key = `${context}|${message}`;
  if (alreadySent.has(key)) return;

  alreadySent.add(key);
  sentCount += 1;
  reporting = true;

  try {
    const token = getToken();
    void fetch(`${API_BASE_URL}/client-error`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Survives the navigation that a fatal error often triggers.
      keepalive: true,
      body: JSON.stringify({
        context: context.slice(0, 200),
        message: message.slice(0, 200),
        stack: stack?.slice(0, 2000),
        url: window.location.href.slice(0, 2048),
        userAgent: navigator.userAgent.slice(0, 200),
      }),
      // A plain fetch, not apiFetch: a 401 here must not start a refresh or
      // sign anyone out because a report failed.
    }).catch(() => {
      /* reporting failed; there is nowhere left to report that to */
    });
  } catch {
    /* as above */
  } finally {
    reporting = false;
  }
};

export const reportError = (context: string, error: unknown): void => {
  if (import.meta.env.DEV) {
    console.error(context, error);
    return;
  }
  send(context, error);
};

/**
 * Catches what no `try` ever sees: an uncaught error or an unhandled promise
 * rejection, the failures most likely to leave a page blank.
 */
let installed = false;

export const installErrorReporting = (): void => {
  // Idempotent: two sets of listeners would report everything twice.
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    reportError('Uncaught error', event.error ?? event.message);
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportError('Unhandled promise rejection', event.reason);
  });
};

export default reportError;
