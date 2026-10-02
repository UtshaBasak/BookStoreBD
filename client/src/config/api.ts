import type { SessionResponse } from '@shared/api.js';

import { clearSession, getToken, getUserEmail, setSession } from '../utils/auth.js';

/**
 * Where the API lives.
 *
 * `/api` by default, which means same-origin: the Vite dev server proxies that
 * prefix in development and nginx does in production. Same-origin is what makes
 * the refresh cookie first-party, so none of the third-party cookie
 * restrictions apply.
 *
 * The namespace matters. Without it the API and the client-side routes collide
 * — `/cart`, `/wishlist`, `/book`, `/chat` and `/filter` are each both a page
 * and an endpoint, and the proxy cannot tell which is wanted.
 *
 * `VITE_API_URL` overrides it for the cross-origin case — a client deployed
 * separately from the API. The refresh cookie will not survive that, so the
 * session ends when the access token expires.
 */
export const API_BASE_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');

/** Builds an API URL from a root-relative path. */
export const apiUrl = (path = ''): string =>
  `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

const REFRESH_PATH = '/auth/refresh';

/**
 * Endpoints where a 401 means "those credentials are wrong", not "your session
 * has expired".
 *
 * These skip the refresh-and-retry below, so a mistyped password shows the
 * form's own error rather than clearing the session and redirecting.
 */
const CREDENTIAL_PATHS = ['/auth/signin', '/auth/signup', '/user/signin', '/user/signup'];

const isCredentialCheck = (input: RequestInfo | URL): boolean =>
  CREDENTIAL_PATHS.some((path) => String(input).includes(path));

/** Sends the caller back to sign-in once the session is genuinely gone. */
const handleUnauthorized = (): void => {
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
 * revoking the whole family, signing the user out.
 */
let refreshInFlight: Promise<boolean> | null = null;

const exchangeCookie = (): Promise<boolean> =>
  fetch(apiUrl(REFRESH_PATH), {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (res) => {
      // Refused outright: the session is over, so stop drawing the page as
      // signed in. (A network failure says nothing, and changes nothing.)
      if (res.status === 401) clearSession();
      if (!res.ok) return false;
      const data = (await res.json()) as SessionResponse;
      setSession(data);
      return true;
    })
    .catch(() => false);

/** The browser's lock manager, where there is one (every current browser). */
const locks = (): LockManager | undefined =>
  typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : undefined;

/*
 * Tabs share the refresh cookie but not their tokens, so two tabs opened
 * together would each refresh at once - and the second would present a cookie
 * the first had just exchanged, which reads as replay. A lock across tabs puts
 * them in a queue: each refreshes with the cookie as the one before left it.
 */
export const refreshSession = (): Promise<boolean> => {
  const manager = locks();
  refreshInFlight ??= (manager ? manager.request('bookstorebd-refresh', exchangeCookie) : exchangeCookie()).finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
};

/**
 * A token for this tab, fetched from the refresh cookie when someone is signed
 * in but this tab has none yet - after a reload, or in a new tab. Resolves to
 * null when signed out.
 */
export const ensureToken = async (): Promise<string | null> => {
  if (!getToken() && getUserEmail()) await refreshSession();
  return getToken();
};

/**
 * `fetch` with the bearer token attached, retrying once through the refresh
 * endpoint when the access token has expired.
 */
export const apiFetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
  const send = () => {
    const headers = new Headers(init.headers ?? {});
    const token = getToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(input, { ...init, headers, credentials: 'include' });
  };

  // A reload starts without a token: get one first, rather than send a
  // request bound to fail.
  if (!String(input).includes(REFRESH_PATH) && !isCredentialCheck(input)) await ensureToken();

  let response = await send();

  if (
    response.status === 401 &&
    !String(input).includes(REFRESH_PATH) &&
    !isCredentialCheck(input)
  ) {
    const hadToken = Boolean(getToken());
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await send();
    } else if (hadToken) {
      /*
       * The session has ended. A public endpoint - a book's reviews, a
       * seller's name - answers a stale token with 401 so that a live session
       * can refresh; with nothing to refresh, the request is repeated signed
       * out rather than sending the visitor to sign-in for viewing a book.
       */
      clearSession();
      response = await send();
    }
    if (response.status === 401) handleUnauthorized();
  }

  return response;
};

/**
 * Ends the session on the server as well as in this tab.
 *
 * Forgetting the token here alone would leave the refresh cookie valid, so the
 * session could simply be resumed. The local state is cleared either way, so a
 * network failure still signs the user out here.
 */
export const signOut = async (): Promise<void> => {
  try {
    await fetch(apiUrl('/auth/logout'), { method: 'POST', credentials: 'include' });
  } catch {
    /* offline, or the API is unreachable - clear locally regardless */
  } finally {
    clearSession();
  }
};

export default API_BASE_URL;
