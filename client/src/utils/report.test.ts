/**
 * In a build this used to do nothing, so a page that broke for a real visitor
 * broke silently. These pin what it sends, and - just as important - what it
 * refuses to send twice.
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

let sent: { url: string; body: Record<string, unknown> }[];

/**
 * A fresh copy of the module per test.
 *
 * It keeps a per-session set of what it has already reported, which is the
 * behaviour under test - so each test needs its own session.
 */
const load = async (dev: boolean) => {
  vi.resetModules();
  vi.stubEnv('DEV', dev);
  return import('./report.js');
};

beforeEach(() => {
  sent = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      sent.push({
        url: String(input),
        body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>,
      });
      return Promise.resolve(new Response(null, { status: 204 }));
    })
  );
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  localStorage.clear();
});

describe('in development', () => {
  it('goes to the console and no further', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { reportError } = await load(true);

    reportError('Something broke', new Error('the thing'));

    expect(spy).toHaveBeenCalled();
    // The console is the right place when somebody is looking at it.
    expect(sent).toHaveLength(0);
    spy.mockRestore();
  });
});

describe('in a build', () => {
  it('sends the context, the message and where it happened', async () => {
    const { reportError } = await load(false);

    reportError('Uncaught error', new Error('Cannot read properties of undefined'));

    expect(sent).toHaveLength(1);
    expect(sent[0].url).toMatch(/\/client-error$/);
    expect(sent[0].body.context).toBe('Uncaught error');
    expect(sent[0].body.message).toBe('Cannot read properties of undefined');
    expect(sent[0].body.stack).toBeTruthy();
    expect(sent[0].body.url).toBeTruthy();
  });

  it('carries the session when there is one, so a report has a name on it', async () => {
    localStorage.setItem('authToken', 'a-token');
    const { reportError } = await load(false);

    reportError('Uncaught error', new Error('boom'));

    const headers = (vi.mocked(fetch).mock.calls[0][1]?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer a-token');
  });

  it('reports the same failure once, however often it happens', async () => {
    const { reportError } = await load(false);

    for (let i = 0; i < 10; i += 1) {
      reportError('Uncaught error', new Error('the same thing'));
    }

    // A render loop throwing the same error should not be ten thousand
    // requests and ten thousand log lines.
    expect(sent).toHaveLength(1);
  });

  it('and stops entirely after twenty distinct ones', async () => {
    const { reportError } = await load(false);

    for (let i = 0; i < 40; i += 1) {
      reportError('Uncaught error', new Error(`failure number ${String(i)}`));
    }

    expect(sent).toHaveLength(20);
  });

  it('copes with something thrown that is not an Error', async () => {
    const { reportError } = await load(false);

    reportError('Unhandled promise rejection', { code: 503 });

    expect(sent).toHaveLength(1);
    expect(String(sent[0].body.message)).toContain('503');
  });

  it('never throws when reporting fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const { reportError } = await load(false);

    // There is nowhere left to report a failure to report.
    expect(() => reportError('Uncaught error', new Error('boom'))).not.toThrow();
  });
});

describe('what no try block ever sees', () => {
  /*
   * Both in one test on purpose. The listeners go on the window, which jsdom
   * shares across a file, so a second `load()` would leave the first module's
   * listeners attached and every event would be reported twice.
   */
  it('an uncaught error, and a promise nobody awaited', async () => {
    const { installErrorReporting } = await load(false);
    // Twice: installing again must not double every report.
    installErrorReporting();
    installErrorReporting();

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('render blew up') }));

    // jsdom does not raise this one on its own, so it is dispatched by hand.
    const rejection = new Event('unhandledrejection') as Event & { reason?: unknown };
    rejection.reason = new Error('fetch never resolved');
    window.dispatchEvent(rejection);

    expect(sent.map((report) => report.body.context)).toEqual([
      'Uncaught error',
      'Unhandled promise rejection',
    ]);
  });
});
