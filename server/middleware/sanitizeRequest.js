const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively removes MongoDB operator keys ($-prefixed, or containing a dot)
 * and prototype-polluting keys from a parsed request payload.
 */
const scrub = (value, depth = 0) => {
  if (depth > 10 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((entry) => scrub(entry, depth + 1));
  }

  const clean = Object.create(null);
  for (const [key, entry] of Object.entries(value)) {
    if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) continue;
    clean[key] = scrub(entry, depth + 1);
  }
  return Object.assign({}, clean);
};

/**
 * Defence in depth alongside the explicit string coercion in the controllers:
 * even if a query is built from a request value that was not narrowed, the
 * operator objects an attacker would need are already gone.
 */
export const sanitizeRequest = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = scrub(req.body);
  // req.query is a getter in Express 5, so mutate in place rather than reassign.
  if (req.query && typeof req.query === 'object') {
    for (const key of Object.keys(req.query)) {
      if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
        delete req.query[key];
      } else {
        req.query[key] = scrub(req.query[key]);
      }
    }
  }
  next();
};
