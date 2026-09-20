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
export const PLACEHOLDER_IMAGE = 'https://via.placeholder.com/80x120?text=No+Image';

export const safeImageSrc = (value, fallback = '') => {
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
export const safeObjectUrl = (file) => {
  if (!file) return '';
  return safeImageSrc(URL.createObjectURL(file));
};

export default safeImageSrc;
