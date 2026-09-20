import axios from 'axios';

import { authHeaders, clearSession, getToken } from '../utils/auth.js';

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

/**
 * Sends the caller back to sign-in when the API rejects the token. Covers an
 * expired session and an account deleted while someone was still signed in.
 */
const handleUnauthorized = () => {
  clearSession();
  if (!window.location.pathname.startsWith('/sign-in')) {
    window.location.assign('/sign-in');
  }
};

/**
 * `fetch` with the bearer token attached. Every call to this API goes through
 * here so the header is never forgotten at an individual call site.
 */
export const apiFetch = async (input, init = {}) => {
  const headers = new Headers(init.headers || {});
  const token = getToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(input, { ...init, headers });
  if (response.status === 401) handleUnauthorized();
  return response;
};

// The same treatment for the pages that use axios.
axios.interceptors.request.use((cfg) => {
  const url = String(cfg.url || '');
  if (url.startsWith(API_BASE_URL)) {
    Object.assign(cfg.headers, authHeaders());
  }
  return cfg;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) handleUnauthorized();
    return Promise.reject(error);
  }
);

export default API_BASE_URL;
