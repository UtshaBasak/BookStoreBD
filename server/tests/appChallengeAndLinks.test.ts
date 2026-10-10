/**
 * Two files at the root for the Android app: the page that runs the bot check
 * inside the app, and the App Links statement that lets the app open this
 * site's links.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';

import { createTestContext, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
afterEach(() => {
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.ANDROID_CERT_SHA256;
  delete process.env.ANDROID_PACKAGE_NAME;
});

const RELEASE_CERT = '11:39:B7:92:CA:48:CF:12:88:0D:10:64:F3:40:19:DC:7F:8B:F3:94:34:B0:1A:45:DA:0C:07:06:81:FA:A5:B9';

describe('the App Links statement', () => {
  it('names the app and its release certificate', async () => {
    const res = await request.get('/.well-known/assetlinks.json');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual([
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: { namespace: 'android_app', package_name: 'io.github.utshabasak.bookstorebd', sha256_cert_fingerprints: [RELEASE_CERT] },
      },
    ]);
  });

  it('takes further certificates from the environment, ignoring anything malformed', async () => {
    const play = 'AA:'.repeat(31) + 'AA';
    process.env.ANDROID_CERT_SHA256 = `${RELEASE_CERT}, ${play.toLowerCase()}, not-a-fingerprint`;
    const { body } = await request.get('/.well-known/assetlinks.json');
    expect(body[0].target.sha256_cert_fingerprints).toEqual([RELEASE_CERT, play]);

    process.env.ANDROID_CERT_SHA256 = 'nonsense';
    expect((await request.get('/.well-known/assetlinks.json')).body[0].target.sha256_cert_fingerprints).toEqual([RELEASE_CERT]);
  });
});

describe('the app security check page', () => {
  it('is not there while the bot check is off', async () => {
    expect((await request.get('/app/challenge')).status).toBe(404);
  });

  it('runs Turnstile with the site key, with no inline script, under the site CSP', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    process.env.TURNSTILE_SITE_KEY = 'site-key';

    const res = await request.get('/app/challenge?theme=dark');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/html/);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.text).toContain('data-sitekey="site-key"');
    expect(res.text).toContain('data-theme="dark"');
    expect(res.text).toContain('<script src="https://challenges.cloudflare.com/turnstile/v0/api.js"');
    // Every script is loaded from a file; none is written into the page.
    expect(res.text.match(/<script(?![^>]*\bsrc=)[^>]*>/g)).toBeNull();
    const csp = String(res.headers['content-security-policy']);
    expect(csp).toContain("script-src 'self' https://challenges.cloudflare.com");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('accepts only the themes it knows', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    const res = await request.get('/app/challenge?theme="><script>alert(1)</script>');
    expect(res.text).toContain('data-theme="auto"');
    expect(res.text).not.toContain('alert(1)');
  });

  it('hands the token to the app only through its message channel', async () => {
    const res = await request.get('/app/challenge.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/javascript/);
    expect(res.text).toContain('window.BookStoreBDChallenge');
    expect(res.text).toContain('bookstoreChallengeDone');
  });
});
