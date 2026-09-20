/**
 * Every path the API owns.
 *
 * Shared so the three places that must agree cannot drift: the routers mounted
 * in app.js, the SPA fallback that must not swallow an API call, and the Vite
 * dev-server proxy that makes the client same-origin while developing.
 */
export const API_PATH_PREFIXES = [
  '/auth',
  '/book',
  '/cart',
  '/chat',
  '/filter',
  '/health',
  '/order',
  '/purchase',
  '/return',
  '/uploads',
  '/user',
  '/wishlist',
];

/** True when a path belongs to the API rather than to a client-side route. */
export const isApiPath = (pathname) =>
  API_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );

export default API_PATH_PREFIXES;
