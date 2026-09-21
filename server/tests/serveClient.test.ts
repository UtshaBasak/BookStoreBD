/**
 * `SERVE_CLIENT` makes the API serve the built single-page app from its own
 * origin, which is what keeps the refresh cookie first-party in a one-service
 * deployment.
 *
 * It used to do nothing at all when the bundle was missing, and say nothing
 * about it: the only symptom was a 404 on every page in Docker, while the
 * tests stayed green. These cases pin both halves - that a bundle is served
 * when there is one, and that its absence is announced rather than swallowed.
 *
 * No database here; createApp() only assembles middleware.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import supertest from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

const SHELL = '<!doctype html><title>BookStoreBD</title>';

/** Builds the app with SERVE_CLIENT on, pointed at a directory of our choosing. */
const appServing = async (clientDist: string) => {
  process.env.SERVE_CLIENT = 'true';
  vi.resetModules();

  const pino = (await import('pino')).default;
  const warnings: string[] = [];
  const logger = pino({ level: 'warn' }, { write: (line: string) => void warnings.push(line) });

  const { createApp } = await import('../app.js');
  return { agent: supertest(createApp({ clientDist, logger })), warnings };
};

afterEach(() => {
  delete process.env.SERVE_CLIENT;
  vi.resetModules();
});

describe('SERVE_CLIENT with no build on disk', () => {
  it('says so instead of failing silently', async () => {
    const { warnings } = await appServing(join(tmpdir(), 'bookstorebd-no-such-build'));

    expect(warnings.join('')).toMatch(/no client build was found/);
  });

  it('still answers the API, and a page request is an honest 404', async () => {
    const { agent } = await appServing(join(tmpdir(), 'bookstorebd-no-such-build'));

    expect((await agent.get('/health')).status).toBe(200);

    const page = await agent.get('/cart');
    expect(page.status).toBe(404);
    expect(page.headers['content-type']).toMatch(/json/);
  });
});

describe('SERVE_CLIENT with a build on disk', () => {
  let built: string | null = null;

  const withBundle = async () => {
    built = mkdtempSync(join(tmpdir(), 'bookstorebd-dist-'));
    writeFileSync(join(built, 'index.html'), SHELL);
    return appServing(built);
  };

  afterEach(() => {
    if (built) rmSync(built, { recursive: true, force: true });
    built = null;
  });

  it('serves the app shell at the root', async () => {
    const { agent, warnings } = await withBundle();

    const res = await agent.get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('BookStoreBD');
    expect(warnings).toHaveLength(0);
  });

  it('serves the shell for a client-side route rather than 404ing', async () => {
    const { agent } = await withBundle();

    // /cart is a page. The API endpoint of the same name lives under /api,
    // which is the whole reason for the namespace.
    const res = await agent.get('/cart');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
  });

  it('never returns the shell for an API path', async () => {
    const { agent } = await withBundle();

    // A miss under the API prefix must stay JSON: HTML here would turn a
    // typo'd endpoint into a confusing parse error in the browser.
    const missing = await agent.get('/api/definitely-not-a-route');
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toMatch(/json/);

    // And a real endpoint still authenticates rather than serving the page.
    const guarded = await agent.get('/api/cart');
    expect(guarded.status).toBe(401);
    expect(guarded.headers['content-type']).toMatch(/json/);
  });
});
