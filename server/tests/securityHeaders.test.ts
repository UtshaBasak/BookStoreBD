/**
 * The response headers a browser uses to constrain what a page may do.
 *
 * There were none at all until these were added: the site could be framed by
 * any origin, responses could be MIME-sniffed, and there was no second line of
 * defence if a script injection ever landed. Pinned here because a header that
 * silently stops being sent looks exactly like one that is working.
 */
import supertest from 'supertest';
import { beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../app.js';

let agent: ReturnType<typeof supertest>;

beforeAll(() => {
  agent = supertest(createApp());
});

/** Parses a CSP header into directive -> sources. */
const policy = (header: string): Record<string, string[]> =>
  Object.fromEntries(
    header
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources];
      })
  );

describe('security headers', () => {
  it('does not announce the framework', async () => {
    const res = await agent.get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('refuses to be framed', async () => {
    const res = await agent.get('/health');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(policy(res.headers['content-security-policy'])['frame-ancestors']).toEqual(["'none'"]);
  });

  it('forbids MIME sniffing', async () => {
    const res = await agent.get('/health');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });

  it('does not leak a full URL to another site', async () => {
    const res = await agent.get('/health');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('asks browsers to remember HTTPS', async () => {
    const res = await agent.get('/health');
    expect(res.headers['strict-transport-security']).toMatch(/max-age=63072000/);
  });

  it('allows no escape hatch for scripts', async () => {
    const res = await agent.get('/health');
    const directives = policy(res.headers['content-security-policy']);

    // The directive that actually stops an injection. If either of these
    // appears, the policy has stopped being worth anything.
    expect(directives['script-src']).toEqual(["'self'"]);
    expect(directives['object-src']).toEqual(["'none'"]);
    expect(directives['base-uri']).toEqual(["'self'"]);
  });

  it('still permits the images the app actually renders', async () => {
    const res = await agent.get('/health');
    const images = policy(res.headers['content-security-policy'])['img-src'];

    // Covers stored inline as base64, previews of a file just picked, and the
    // hosted delivery URLs. Blocking any of these would blank the catalogue.
    expect(images).toContain('data:');
    expect(images).toContain('blob:');
    expect(images).toContain('https://res.cloudinary.com');
  });

  it('applies to an error response as well as a successful one', async () => {
    const res = await agent.get('/api/definitely-not-a-route');

    expect(res.status).toBe(404);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toBeDefined();
  });
});

describe('the upload path the policy has to allow', () => {
  it('lets the browser reach Cloudinary, which is where a cover is sent', async () => {
    const res = await agent.get('/health');
    const csp = policy(res.headers['content-security-policy']);

    // The bytes never pass through this API - the browser posts them straight
    // to Cloudinary with a signature. Without this the upload is blocked by the
    // policy and the only sign of it is a console message.
    expect(csp['connect-src']).toContain('https://api.cloudinary.com');
    // And the delivery host, for reading them back.
    expect(csp['img-src']).toContain('https://res.cloudinary.com');
  });
});
