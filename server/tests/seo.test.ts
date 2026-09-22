/**
 * A marketplace lives on search traffic, and a crawler only looks in two
 * places: `/robots.txt` and `/sitemap.xml`. These pin what it finds there -
 * every public page listed, every page that needs an account refused, and
 * absolute URLs on the host the request actually arrived at.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

/** The URLs in a sitemap, in order. */
const locations = (xml: string): string[] =>
  [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);

describe('GET /robots.txt', () => {
  it('invites crawlers in and points them at the sitemap', async () => {
    const res = await request.get('/robots.txt').set('X-Forwarded-Host', 'books.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/^User-agent: \*$/m);
    expect(res.text).toMatch(/^Allow: \/$/m);
    expect(res.text).toMatch(/^Sitemap: https?:\/\/books\.example\.com\/sitemap\.xml$/m);
  });

  it('keeps crawlers out of everything that needs an account', async () => {
    const res = await request.get('/robots.txt');

    // An indexed URL that answers with a sign-in form is a wasted result.
    for (const path of ['/admin', '/cart', '/payment', '/profile', '/chat', '/api/']) {
      expect(res.text).toContain(`Disallow: ${path}`);
    }
  });

  it('says nothing about a sitemap when the host is not usable', async () => {
    // A Host header is supplied by the caller. One that cannot be part of a URL
    // should produce no Sitemap line rather than a broken one.
    const res = await request.get('/robots.txt').set('X-Forwarded-Host', 'not a host name');

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Sitemap:');
  });
});

describe('GET /sitemap.xml', () => {
  it('lists every public page', async () => {
    const res = await request.get('/sitemap.xml').set('X-Forwarded-Host', 'books.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/xml/);
    expect(res.text.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);

    const found = locations(res.text);
    for (const path of ['/', '/filter', '/about', '/contact', '/privacy', '/terms', '/returns']) {
      expect(found).toContain(`http://books.example.com${path}`);
    }
  });

  it('lists every book, so a listing can be found without being linked', async () => {
    const one = await createBook({ title: 'One' });
    const two = await createBook({ title: 'Two' });

    const res = await request.get('/sitemap.xml').set('X-Forwarded-Host', 'books.example.com');
    const found = locations(res.text);

    expect(found).toContain(`http://books.example.com/book/${String(one._id)}`);
    expect(found).toContain(`http://books.example.com/book/${String(two._id)}`);
  });

  it('lists nothing that needs an account', async () => {
    await createBook();

    const res = await request.get('/sitemap.xml').set('X-Forwarded-Host', 'books.example.com');
    const found = locations(res.text);

    for (const path of ['/cart', '/wishlist', '/profile', '/admin', '/payment', '/chat']) {
      expect(found.some((url) => url.endsWith(path))).toBe(false);
    }
  });

  it('honours the protocol and host a proxy forwards', async () => {
    // Behind nginx or Render the process sees http on an internal hostname; the
    // URLs in a sitemap have to be the ones a visitor would use.
    const res = await request
      .get('/sitemap.xml')
      .set('X-Forwarded-Proto', 'https')
      .set('X-Forwarded-Host', 'books.example.com');

    for (const url of locations(res.text)) {
      // With the trailing slash: without it this also passes for
      // https://books.example.com.evil.example/, which is a different site.
      expect(url.startsWith('https://books.example.com/')).toBe(true);
    }
  });

  it('refuses to invent URLs when the host is not usable', async () => {
    const res = await request.get('/sitemap.xml').set('X-Forwarded-Host', 'not a host name');

    expect(res.status).toBe(404);
  });

  it('escapes what XML cannot carry raw', async () => {
    await createBook();

    const res = await request.get('/sitemap.xml').set('X-Forwarded-Host', 'books.example.com');

    // An unescaped ampersand is the usual way a sitemap stops parsing.
    const withoutEntities = res.text.replace(/&(amp|lt|gt|quot|apos);/g, '');
    expect(withoutEntities).not.toContain('&');
    expect(res.text.match(/<urlset/g)).toHaveLength(1);
    expect(res.text.match(/<\/urlset>/g)).toHaveLength(1);
  });
});
