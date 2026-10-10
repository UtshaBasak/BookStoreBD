/**
 * The API lives under a single prefix.
 *
 * Client-side routes and API routes share an origin, so without a namespace
 * they collide: `/cart`, `/wishlist`, `/book`, `/chat` and `/filter` are all
 * both a page and an endpoint. Namespacing the API means a path is
 * unambiguously one or the other.
 *
 * `/health` stays at the root because that is where a platform health check
 * looks for it, and no page uses that path. `/robots.txt` and `/sitemap.xml`
 * are there for the same reason: a crawler looks nowhere else.
 */
export const API_PREFIX = '/api';

/**
 * The same API, versioned, for clients that cannot all be updated at once: the
 * Android app calls only these paths. Version 1 only ever gains fields and
 * endpoints; a change that would break an installed app goes to /api/v2, with
 * v1 kept alongside it (docs/API-VERSIONING.md).
 */
export const API_V1_PREFIX = `${API_PREFIX}/v1`;

/**
 * Served from the root rather than under the API prefix. The App Links file
 * must be at that address for Android to find it, and the app's security check
 * is a page on this site because Turnstile only runs on its registered host.
 */
export const ROOT_PATHS: readonly string[] = [
  '/health',
  '/robots.txt',
  '/sitemap.xml',
  '/llms.txt',
  '/.well-known/security.txt',
  '/.well-known/assetlinks.json',
  '/app/challenge',
  '/app/challenge.js',
];

/** True when a path belongs to the API rather than to a client-side route. */
export const isApiPath = (pathname: string): boolean =>
  pathname === API_PREFIX ||
  pathname.startsWith(`${API_PREFIX}/`) ||
  ROOT_PATHS.includes(pathname);

export default API_PREFIX;
