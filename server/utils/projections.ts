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
