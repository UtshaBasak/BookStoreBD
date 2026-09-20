/**
 * Single source of truth for the backend origin.
 *
 * Override it per environment with a `VITE_API_URL` entry in `client/.env`
 * (see `.env.example`). The deployed API is used as the fallback so a plain
 * `npm run build` keeps working without any extra configuration.
 */
const DEFAULT_API_URL = 'https://bookstorebd.onrender.com';

export const API_BASE_URL = (import.meta.env.VITE_API_URL || DEFAULT_API_URL).replace(
  /\/+$/,
  ''
);

/** Builds an absolute API URL from a root-relative path. */
export const apiUrl = (path = '') =>
  `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export default API_BASE_URL;
