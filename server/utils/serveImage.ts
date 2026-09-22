import { createHash } from 'crypto';

import type { Request, Response } from 'express';

/** What a stored image is allowed to be, whatever the record claims. */
export const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const DATA_URI = /^data:([\w/+.-]+);base64,(.*)$/s;

/**
 * Serves one stored image as an image.
 *
 * Images uploaded before hosting was configured are kept on the document as
 * base64, so without this they travel inside every JSON response that mentions
 * the record - and a browser cannot cache an image that arrives inside a JSON
 * body, so every visit pays for all of them again. Sent as its own request it
 * is cached, revalidated with an ETag, and fetched only when actually looked
 * at.
 *
 * Returns false when there is nothing to serve, so the caller can 404 in
 * whatever words suit it.
 */
export const serveStoredImage = (req: Request, res: Response, image: unknown): boolean => {
  if (typeof image !== 'string' || image.length === 0) return false;

  // Hosted elsewhere: it is already an address, so send the caller there.
  if (/^https?:\/\//.test(image)) {
    res.redirect(302, image);
    return true;
  }

  const match = DATA_URI.exec(image);
  // The type is read from the record, and a record written before uploads were
  // type-checked could say anything. Only image types are served.
  if (!match || !IMAGE_TYPES.has(match[1])) return false;

  const bytes = Buffer.from(match[2], 'base64');
  const etag = `"${createHash('sha1').update(bytes).digest('base64url')}"`;

  if (req.headers['if-none-match'] === etag) {
    res.status(304).end();
    return true;
  }

  res.setHeader('ETag', etag);
  // Replaceable, so not immutable - but a day of cache with revalidation after
  // it costs one 304 rather than a re-download.
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.type(match[1]).send(bytes);
  return true;
};

export default serveStoredImage;
