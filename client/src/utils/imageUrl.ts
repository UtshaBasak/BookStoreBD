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
 * quality the eye cannot fault (`q_auto:eco` for thumbnails, a little smaller
 * still, where the difference does not show at that size), and `c_limit` never
 * scales an image *up* - a small cover stays its own size rather than being
 * stretched.
 *
 * Anything that is not a Cloudinary URL is returned untouched: a
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
 * `https://res.cloudinary.com.evil.example/x.png`. Here it only chooses a
 * transformation, but an exact match keeps the check meaning what it says.
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

  const quality = width <= THUMBNAIL_MAX ? 'q_auto:eco' : 'q_auto';
  return `${head}f_auto,${quality},c_limit,w_${width}/${tail}`;
};

/** Up to this width a picture is a thumbnail, and takes the smaller quality setting. */
const THUMBNAIL_MAX = 400;

/** The widths a card's cover is offered in, for the browser to choose from. */
const CARD_WIDTHS = [160, 240, 320, 400] as const;

/**
 * How wide a card's cover is drawn: two cards to a phone's row (each image a
 * little under 40% of the screen), and about 240px at most on anything wider.
 */
export const CARD_SIZES = '(max-width: 640px) 40vw, 240px';

/**
 * A `srcset` for a card's cover, so a phone downloads the size it draws rather
 * than one for a laptop. Undefined for anything Cloudinary cannot resize.
 */
export const cardSrcSet = (url: string | undefined): string | undefined => {
  if (!url || !isCloudinary(url) || sized(url, CARD_WIDTHS[0]) === url) return undefined;
  return CARD_WIDTHS.map((width) => `${sized(url, width)} ${width}w`).join(', ');
};

export default sized;
