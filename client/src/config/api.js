import axios from 'axios';

import { authHeaders, clearSession, getToken, setSession } from '../utils/auth.js';

/**
 * Where the API lives.
 *
 * Empty by default, which means same-origin: the Vite dev server proxies the
 * API prefixes in development, and Express serves the built client alongside
 * the API in production. Same-origin is what makes the refresh cookie
 * first-party, so none of the third-party cookie restrictions apply.
 *
 * `VITE_API_URL` overrides it for the cross-origin case — a client deployed
 * separately from the API. The refresh cookie will not survive that, so the
 * session ends when the access token expires.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/** Builds an API URL from a root-relative path. */
export const apiUrl = (path = '') =>
  `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const REFRESH_PATH = '/auth/refresh';

/** Sends the caller back to sign-in once the session is genuinely gone. */
const handleUnauthorized = () => {
  clearSession();
  if (!window.location.pathname.startsWith('/sign-in')) {
    window.location.assign('/sign-in');
  }
};

/**
 * A single in-flight refresh shared by every caller.
 *
 * Without this, a page that fires several requests at once would trigger one
 * refresh each. Because refresh tokens rotate, the second would present an
 * already-exchanged token, which the server treats as replay and answers by
 * revoking the whole family — signing the user out for being busy.
 */
let refreshInFlight = null;

const refreshSession = () => {
  refreshInFlight ??= fetch(apiUrl(REFRESH_PATH), {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (res) => {
      if (!res.ok) return false;
      const data = await res.json();
      setSession(data);
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });

  return refreshInFlight;
};

/**
 * `fetch` with the bearer token attached, retrying once through the refresh
 * endpoint when the access token has expired.
 */
export const apiFetch = async (input, init = {}) => {
  const send = () => {
    const headers = new Headers(init.headers || {});
    const token = getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers, credentials: 'include' });
  };

  let response = await send();

  if (response.status === 401 && !String(input).includes(REFRESH_PATH)) {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await send();
    }
    if (response.status === 401) handleUnauthorized();
  }

  return response;
};

// The same treatment for the pages that use axios.
axios.defaults.withCredentials = true;

axios.interceptors.request.use((cfg) => {
  Object.assign(cfg.headers, authHeaders());
  return cfg;
});

axios.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error?.config;
    const isRefreshCall = String(original?.url || '').includes(REFRESH_PATH);

    if (error?.response?.status === 401 && original && !original._retried && !isRefreshCall) {
      original._retried = true;
      if (await refreshSession()) {
        Object.assign(original.headers, authHeaders());
        return axios(original);
      }
      handleUnauthorized();
    }

    return Promise.reject(error);
  }
);

/**
 * Ends the session on the server as well as in this tab.
 *
 * Clearing localStorage alone would leave the refresh cookie valid, so the
 * session could simply be resumed. The local state is cleared either way, so a
 * network failure still signs the user out here.
 */
export const signOut = async () => {
  try {
    await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch {
    /* offline, or the API is unreachable - clear locally regardless */
  } finally {
    clearSession();
  }
};

export default API_BASE_URL;
