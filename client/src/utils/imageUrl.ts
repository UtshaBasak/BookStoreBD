/**
 * Asks Cloudinary for the size actually being drawn.
 *
 * Configuring Cloudinary moves the bytes out of the database, but it does not
 * make them smaller on its own: the URL an upload returns delivers the original
 * photograph, so a 90 KB cover is still 90 KB behind a 100px card. The saving
 * comes from the delivery URL, which takes transformations inline:
 *
 *   /image/upload/v123/folder/id.jpg
 *   /image/upload/f_auto,q_auto,c_limit,w_400/v123/folder/id.jpg
 *
 * `f_auto` serves WebP or AVIF to a browser that takes them, `q_auto` picks a
 * quality the eye cannot fault, and `c_limit` never scales an image *up* - a
 * small cover stays its own size rather than being stretched.
 *
 * Anything that is not one of our Cloudinary URLs is returned untouched: a
 * base64 cover, a placeholder, or the API's own cover endpoint.
 */
const CLOUDINARY_UPLOAD = '/image/upload/';

/** Widths in the sizes the pages actually draw. */
export const IMAGE_WIDTHS = {
  /** A card in the catalogue or on the homepage. */
  card: 400,
  /** The cover on a book's own page. */
  detail: 800,
  /** A row in the cart, the wishlist or the order summary. */
  row: 200,
} as const;

const CLOUDINARY_HOST = 'res.cloudinary.com';

/**
 * Whether a URL is served by Cloudinary.
 *
 * The host, compared exactly - not `url.includes('res.cloudinary.com')`, which
 * is also true of `https://evil.example/res.cloudinary.com/x.png` and of
 * `https://res.cloudinary.com.evil.example/x.png`. Here it only decides which
 * transformation to ask for, so the substring version was not a way in; it was
 * still a check that did not mean what it said, and the same shape in a place
 * that did decide something would be.
 */
/* A plain boolean, not a `url is string` predicate: the callers already hold a
   string, and the predicate narrows their else-branch to `never`. */
export const isCloudinary = (url: unknown): boolean => {
  if (typeof url !== 'string') return false;
  try {
    return new URL(url).hostname === CLOUDINARY_HOST;
  } catch {
    // Not an absolute URL: a cover served by the API, or a data URI.
    return false;
  }
};

export const sized = (url: string, width: number): string => {
  if (!isCloudinary(url)) return url;

  const at = url.indexOf(CLOUDINARY_UPLOAD);
  if (at === -1) return url;

  const head = url.slice(0, at + CLOUDINARY_UPLOAD.length);
  const tail = url.slice(at + CLOUDINARY_UPLOAD.length);

  // Already carrying transformations: leave it alone rather than stack a second
  // set on top, which changes the URL without changing the picture.
  if (/^[a-z]+_[^/]+\//.test(tail)) return url;

  return `${head}f_auto,q_auto,c_limit,w_${width}/${tail}`;
};

export default sized;
