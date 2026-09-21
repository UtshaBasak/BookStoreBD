/**
 * Validates a value before it is used as an `<img src>`.
 *
 * Image sources here come from three places that are not fully trusted: files
 * the user picks (`URL.createObjectURL`), book records that round-trip through
 * `localStorage`, and base64 data URIs returned by the API. A value reaching
 * `src` unchecked can carry a `javascript:` or `data:text/html` payload, so
 * only the schemes an image can legitimately use are allowed through.
 *
 * The prefix checks are written out one by one rather than looped over a list:
 * static analysis (and a reader) can see the guard directly, where a callback
 * passed to `Array.prototype.some` hides it.
 */
/**
 * Shown wherever a book has no cover.
 *
 * Served from this origin rather than a placeholder service: the previous one
 * (`via.placeholder.com`) stopped resolving, so every coverless listing
 * rendered as a broken image. A local SVG also needs no network round trip and
 * is allowed by the Content-Security-Policy without listing another host.
 */
export const PLACEHOLDER_IMAGE = '/book-placeholder.svg';

export const safeImageSrc = (value: unknown, fallback = ''): string => {
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();

  if (trimmed.startsWith('data:image/')) return trimmed;
  if (trimmed.startsWith('blob:')) return trimmed;
  if (trimmed.startsWith('https://')) return trimmed;
  if (trimmed.startsWith('http://')) return trimmed;
  if (trimmed.startsWith('/')) return trimmed;

  return fallback;
};

/**
 * Wraps `URL.createObjectURL` so the blob URL is validated the same way as any
 * other source before it reaches the DOM.
 */
export const safeObjectUrl = (file: Blob | null | undefined): string => {
  if (!file) return '';
  return safeImageSrc(URL.createObjectURL(file));
};

export default safeImageSrc;
