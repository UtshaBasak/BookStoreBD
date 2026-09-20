import type { RequestHandler } from 'express';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Recursively removes MongoDB operator keys ($-prefixed, or containing a dot)
 * and prototype-polluting keys from a parsed request payload.
 */
const scrub = (value: unknown, depth = 0): unknown => {
  if (depth > 10 || value === null || typeof value !== 'object') return value;

  if (Array.isArray(value)) {
    return value.map((entry) => scrub(entry, depth + 1));
  }

  const clean: Record<string, unknown> = Object.create(null);
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
export const sanitizeRequest: RequestHandler = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = scrub(req.body);
  // req.query is a getter in Express 5, so mutate in place rather than reassign.
  if (req.query && typeof req.query === 'object') {
    const query = req.query as Record<string, unknown>;
    for (const key of Object.keys(query)) {
      if (key.startsWith('$') || key.includes('.') || FORBIDDEN_KEYS.has(key)) {
        delete query[key];
      } else {
        query[key] = scrub(query[key]);
      }
    }
  }
  next();
};
