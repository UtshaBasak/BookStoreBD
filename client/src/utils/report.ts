import { API_BASE_URL } from '../config/api.js';
import { getToken } from './auth.js';

/**
 * Where a caught error goes.
 *
 * `console.error` at fifteen call sites meant fifteen messages in a visitor's
 * devtools on the live site - noise to them, and a few of them describing the
 * shape of a failed request. In development the console is exactly the right
 * place, so this keeps it there.
 *
 * In a build it used to do nothing at all, which meant a page that broke for a
 * real visitor broke silently: the only person who ever saw it was the person
 * it happened to, and they are not the one who can fix it. Reports now go to
 * the API, which writes them into the same structured log as everything else
 * and forwards them to Sentry when a DSN is configured.
 *
 * Deliberately not the Sentry browser SDK. That is about 30 KB on a site that
 * has spent a lot of effort not sending 30 KB, it needs another origin in the
 * Content-Security-Policy, and it does nothing until somebody signs up for an
 * account. What it would add - source-mapped stacks, breadcrumbs, alerting -
 * is worth having later, and nothing here is in the way of it.
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
      // A plain fetch, not apiFetch: a 401 here must not start a refresh, and
      // certainly must not sign somebody out because a report failed.
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
 * Catches what no `try` ever sees.
 *
 * Every call site of `reportError` is inside a `catch`, so the errors that
 * were reaching it were the ones somebody had already thought about. A render
 * that throws, or a promise nobody awaited, went nowhere at all - and those
 * are the ones that white-screen a page.
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
