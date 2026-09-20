/**
 * The API lives under a single prefix.
 *
 * Client-side routes and API routes share an origin, so without a namespace
 * they collide: `/cart`, `/wishlist`, `/book`, `/chat` and `/filter` are all
 * both a page and an endpoint. Namespacing the API means a path is
 * unambiguously one or the other.
 *
 * `/health` stays at the root because that is where a platform health check
 * looks for it, and no page uses that path.
 */
export const API_PREFIX = '/api';

export const ROOT_PATHS = ['/health'];

/** True when a path belongs to the API rather than to a client-side route. */
export const isApiPath = (pathname) =>
  pathname === API_PREFIX ||
  pathname.startsWith(`${API_PREFIX}/`) ||
  ROOT_PATHS.includes(pathname);

export default API_PREFIX;
