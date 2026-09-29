/**
 * A shared book's link previews as that book - its title, price and cover -
 * rather than as the homepage. Scrapers read the HTML and run nothing, so this
 * is only true if the server writes it; these pin that it does, that book text
 * cannot break out of the tags it lands in, and that the page still arrives
 * when there is no book to describe.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import supertest from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { clearDatabase, closeTestContext, createTestContext } from './helpers/testApp.js';
import { createBook } from './helpers/factories.js';

/** Enough of the real index.html to see the site-wide tags replaced. */
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <title>BookStoreBD — New and second-hand books across Bangladesh</title>
    <meta
      name="description"
      content="The shop."
    />
    <meta property="og:site_name" content="BookStoreBD" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="BookStoreBD — the shop" />
    <meta property="og:image" content="/og-image.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta name="twitter:image" content="/og-image.jpg" />
  </head>
  <body><div id="root"></div></body>
</html>`;

let agent: ReturnType<typeof supertest>;
let dist: string;

beforeAll(async () => {
  await createTestContext();
  dist = mkdtempSync(join(tmpdir(), 'bookstorebd-share-'));
  writeFileSync(join(dist, 'index.html'), SHELL);
  const { createApp } = await import('../app.js');
  agent = supertest(createApp({ clientDist: dist, serveClient: true }));
});

afterAll(async () => {
  rmSync(dist, { recursive: true, force: true });
  await closeTestContext();
});

beforeEach(clearDatabase);

/** Every `content` of the meta tags carrying one name or property. */
const meta = (html: string, key: string): string[] =>
  [...html.matchAll(new RegExp(`<meta\\b[^>]*(?:name|property)="${key}"[^>]*content="([^"]*)"`, 'g'))].map(
    (m) => m[1]
  );

const COVER = 'https://res.cloudinary.com/demo/image/upload/v1712/bookstorebd/cover.jpg';

describe('GET /book/:id', () => {
  it("previews as the book: its title, price and cover, and no site-wide leftovers", async () => {
    const book = await createBook({ title: 'Deyal', author: 'Humayun Ahmed', price: 320, bookType: 'old', images: [COVER] });

    const res = await agent.get(`/book/${book._id}`).set('X-Forwarded-Host', 'books.example.com');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('<title>Deyal · BookStoreBD</title>');
    expect(res.text).not.toContain('New and second-hand books across Bangladesh</title>');

    expect(meta(res.text, 'og:title')).toEqual(['Deyal · BookStoreBD']);
    expect(meta(res.text, 'og:type')).toEqual(['product']);
    expect(meta(res.text, 'description')).toEqual(['Deyal by Humayun Ahmed. Second-hand, 320 Tk, in stock.']);
    expect(meta(res.text, 'og:url')).toEqual([`http://books.example.com/book/${book._id}`]);
    expect(meta(res.text, 'product:price:amount')).toEqual(['320']);

    // The cover, padded to a landscape card, and said to be one.
    expect(meta(res.text, 'og:image')).toEqual([
      'https://res.cloudinary.com/demo/image/upload/c_pad,w_1200,h_630,b_rgb:f3efff,f_jpg,q_auto/v1712/bookstorebd/cover.jpg',
    ]);
    expect(meta(res.text, 'og:image:width')).toEqual(['1200']);
    expect(meta(res.text, 'twitter:image')).toEqual(meta(res.text, 'og:image'));

    // Untouched: the app itself still loads.
    expect(meta(res.text, 'og:site_name')).toEqual(['BookStoreBD']);
    expect(res.text).toContain('<div id="root"></div>');
  });

  it('keeps book text inside the tags it lands in', async () => {
    const book = await createBook({ title: '"><script>alert(1)</script>', images: [COVER] });

    const res = await agent.get(`/book/${book._id}`);

    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('points a cover stored on the record at the API, which serves it as an image', async () => {
    const book = await createBook({ images: ['data:image/png;base64,AAA'] });

    const res = await agent.get(`/book/${book._id}`).set('X-Forwarded-Host', 'books.example.com');

    expect(meta(res.text, 'og:image')).toEqual([`http://books.example.com/api/book/${book._id}/cover`]);
    // Its size is not known, so none is claimed.
    expect(meta(res.text, 'og:image:width')).toEqual([]);
  });

  it("falls back to the shop's card for a book with no cover", async () => {
    const book = await createBook({ images: [] });

    const res = await agent.get(`/book/${book._id}`).set('X-Forwarded-Host', 'books.example.com');

    expect(meta(res.text, 'og:image')).toEqual(['http://books.example.com/og-image.jpg']);
  });

  it('answers a book that does not exist with the app and a 404', async () => {
    const res = await agent.get('/book/0123456789abcdef01234567');

    expect(res.status).toBe(404);
    expect(res.text).toContain('<div id="root"></div>');
    expect(meta(res.text, 'og:type')).toEqual(['website']);
  });

  it('leaves every other page as it was', async () => {
    const res = await agent.get('/filter');

    expect(res.status).toBe(200);
    expect(meta(res.text, 'og:type')).toEqual(['website']);
  });
});

describe('every other page', () => {
  // The build writes '/og-image.jpg', and not every scraper resolves that:
  // opengraph.xyz showed the homepage with a broken picture.
  it.each(['/', '/filter', '/about'])('gives %s its picture as an absolute address', async (page) => {
    const res = await agent.get(page).set('X-Forwarded-Host', 'books.example.com');

    expect(res.status).toBe(200);
    expect(meta(res.text, 'og:image')).toEqual(['http://books.example.com/og-image.jpg']);
    expect(meta(res.text, 'twitter:image')).toEqual(['http://books.example.com/og-image.jpg']);
    expect(meta(res.text, 'og:title')).toEqual(['BookStoreBD — the shop']);
  });

  it('leaves the address relative when the host is not usable', async () => {
    const res = await agent.get('/').set('X-Forwarded-Host', 'not a host');

    expect(meta(res.text, 'og:image')).toEqual(['/og-image.jpg']);
  });
});

describe('the pictures a preview shows', () => {
  // A preview is drawn on someone else's page. With the site-wide
  // same-origin policy the browser refused to draw the share card there.
  it('may be shown on other sites', async () => {
    writeFileSync(join(dist, 'og-image.jpg'), 'jpeg');
    const book = await createBook({ images: ['data:image/png;base64,iVBORw0KGgo='] });

    const card = await agent.get('/og-image.jpg');
    expect(card.headers['cross-origin-resource-policy']).toBe('cross-origin');

    const cover = await agent.get(`/api/book/${book._id}/cover`);
    expect(cover.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('while everything else stays same-origin', async () => {
    expect((await agent.get('/')).headers['cross-origin-resource-policy']).toBe('same-origin');
    expect((await agent.get('/api/filter')).headers['cross-origin-resource-policy']).toBe('same-origin');
  });
});
