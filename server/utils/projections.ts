import { API_PREFIX } from '../config/apiPaths.js';

/**
 * Book covers are stored on the document as base64 data URIs, so every image
 * a listing carries is sent in full with any query that returns it. A
 * catalogue response therefore grows with the total size of every cover in
 * the database.
 *
 * List views only ever render the first image, so `$slice` returns just that
 * one. A listing may hold up to `MAX_UPLOAD_FILES` images, which makes this
 * worth an order of magnitude on a catalogue of well-illustrated books.
 *
 * `$slice` on its own is not a restricting projection: every other field is
 * still returned. The single-book detail endpoint deliberately does not use
 * this, so a gallery there keeps the full set.
 */
export const LIST_IMAGE_PROJECTION = { images: { $slice: 1 } };

export default LIST_IMAGE_PROJECTION;

/** Anything carrying a list of cover images. */
interface HasImages {
  images?: string[] | null;
}

/**
 * Same idea for cart and wishlist responses. Mongoose cannot apply a `$slice`
 * projection through `populate`, so the populated document is trimmed here
 * instead. Both views render only the first cover.
 */
export const toListBook = <T extends HasImages>(book: T): T => {
  if (!book) return book;
  return Array.isArray(book.images) && book.images.length > 1
    ? { ...book, images: book.images.slice(0, 1) }
    : book;
};

/**
 * Replaces a base64 cover with the address it can be fetched from.
 *
 * A catalogue of 66 listings with photographed covers was a 7.4 MB JSON
 * response - and base64 of an already-compressed JPEG barely gzips, so it was
 * still 5.7 MB on the wire. Every visit paid it again, because a JSON body is
 * not something a browser caches per image.
 *
 * Sent as a URL instead, each cover becomes an ordinary image request: fetched
 * only for the cards actually on screen, cached by the browser across
 * navigations, and revalidated with an ETag. The catalogue JSON drops to the
 * text it should always have been.
 *
 * A cover already hosted elsewhere - a Cloudinary URL - is left exactly as it
 * is: it was never the problem.
 */
export const coverUrl = (bookId: unknown, index: number): string =>
  `${API_PREFIX}/book/${String(bookId)}/cover/${index}`;

interface HasIdAndImages {
  _id?: unknown;
  images?: string[] | null;
}

/** The same document with its covers turned into addresses. */
export const withCoverUrls = <T extends HasIdAndImages>(book: T): T => {
  if (!book || !Array.isArray(book.images)) return book;

  return {
    ...book,
    images: book.images.map((image, index) =>
      typeof image === 'string' && image.startsWith('data:') ? coverUrl(book._id, index) : image
    ),
  };
};
