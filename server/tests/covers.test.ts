/**
 * Covers are stored on the document as base64, so they used to travel inside
 * every JSON response that mentioned a book: a catalogue of 66 listings with
 * photographed covers was a 7.4 MB response, and 5.7 MB of that survived gzip
 * because base64 of a JPEG is already-compressed data. A browser cannot cache
 * an image that arrives inside a JSON body, so every visit paid for all of
 * them again.
 *
 * They are addresses now, and these pin what is at the other end.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, PNG_PIXEL } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const PNG_URI = `data:image/png;base64,${PNG_PIXEL.toString('base64')}`;

describe('GET /book/:id/cover/:index', () => {
  it('serves the image, as an image', async () => {
    const book = await createBook({ images: [PNG_URI] });

    const res = await request.get(`/book/${String(book._id)}/cover/0`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.body).toEqual(PNG_PIXEL);
  });

  it('can be cached, and revalidated without sending it again', async () => {
    const book = await createBook({ images: [PNG_URI] });

    const first = await request.get(`/book/${String(book._id)}/cover/0`);
    expect(first.headers['cache-control']).toMatch(/public, max-age=\d+/);

    const again = await request
      .get(`/book/${String(book._id)}/cover/0`)
      .set('If-None-Match', first.headers.etag);

    // The whole point: a repeat visitor pays 304 bytes, not 90 KB.
    expect(again.status).toBe(304);
  });

  it('defaults to the first cover when no index is given', async () => {
    const book = await createBook({ images: [PNG_URI] });

    expect((await request.get(`/book/${String(book._id)}/cover`)).status).toBe(200);
  });

  it('404s for a cover that is not there', async () => {
    const book = await createBook({ images: [PNG_URI] });

    expect((await request.get(`/book/${String(book._id)}/cover/7`)).status).toBe(404);
  });

  it('sends the caller on to a cover hosted elsewhere', async () => {
    const book = await createBook({ images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'] });

    const res = await request.get(`/book/${String(book._id)}/cover/0`);

    // A Cloudinary URL was never the problem, and proxying it would make this
    // process pay for bytes a CDN is already serving.
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('https://res.cloudinary.com/demo/image/upload/x.jpg');
  });

  it('refuses to serve anything that is not an image', async () => {
    // Uploads are type-checked now, but a record written before that could say
    // anything, and this endpoint sets the Content-Type from the record.
    const book = await createBook({ images: ['data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='] });

    const res = await request.get(`/book/${String(book._id)}/cover/0`);

    expect(res.status).toBe(404);
  });

  it('is public, because a cover is', async () => {
    const book = await createBook({ images: [PNG_URI] });

    expect((await request.get(`/book/${String(book._id)}/cover/0`)).status).toBe(200);
  });
});

describe('what a list response carries', () => {
  it('addresses rather than bytes', async () => {
    const book = await createBook({ images: [PNG_URI, PNG_URI] });

    const res = await request.get('/filter/booklist');

    expect(res.body[0].images[0]).toBe(`/api/book/${String(book._id)}/cover/0`);
    expect(JSON.stringify(res.body)).not.toContain('base64');
  });

  it('leaves a cover that is already hosted alone', async () => {
    await createBook({ images: ['https://res.cloudinary.com/demo/image/upload/x.jpg'] });

    const res = await request.get('/filter/booklist');

    expect(res.body[0].images[0]).toBe('https://res.cloudinary.com/demo/image/upload/x.jpg');
  });

  it('and the detail endpoint carries one per image in the gallery', async () => {
    const book = await createBook({ images: [PNG_URI, PNG_URI, PNG_URI] });

    const res = await request.get(`/book/${String(book._id)}`);

    expect(res.body.images).toEqual([
      `/api/book/${String(book._id)}/cover/0`,
      `/api/book/${String(book._id)}/cover/1`,
      `/api/book/${String(book._id)}/cover/2`,
    ]);
    expect(JSON.stringify(res.body)).not.toContain('base64');
  });
});
