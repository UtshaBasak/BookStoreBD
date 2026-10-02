import type { SessionUser, UserRole } from '@shared/api.js';

/**
 * The session in this tab.
 *
 * The access token is what the API trusts, and it is kept in memory only -
 * never in localStorage, where any script that found its way onto the page
 * could read it. A reload or a new tab starts without one and gets a fresh
 * token from the httpOnly refresh cookie (config/api.ts does that on the first
 * request that needs it).
 *
 * The e-mail and the role are kept in localStorage, because a reload has to
 * know at once whether someone is signed in to draw the right page. They are
 * hints for rendering only: the server re-checks everything on every request,
 * so editing them in devtools gains nothing.
 */
const EMAIL_KEY = 'userEmail';
const ROLE_KEY = 'userRole';
/** Where the token used to be kept. Cleared on load, so no copy is left on disk. */
const LEGACY_TOKEN_KEY = 'authToken';

let accessToken: string | null = null;

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null | undefined): void => {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage - the session lasts for this tab */
  }
};

write(LEGACY_TOKEN_KEY, null);

// Signed out, or in as someone else, in another tab: forget the token here
// too, as a shared copy in storage used to. The next request fetches the right
// one from the cookie, or finds there is none.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === null || (event.key === EMAIL_KEY && event.newValue !== event.oldValue)) accessToken = null;
  });
}

export const getToken = (): string | null => accessToken;
export const getUserEmail = (): string | null => read(EMAIL_KEY);
export const getUserRole = (): string | null => read(ROLE_KEY);

/**
 * Whether someone is signed in, for drawing the page. True straight after a
 * reload, before a token has been fetched; if the refresh cookie has expired,
 * the first request finds out and sends them to sign in.
 */
export const isAuthenticated = (): boolean => Boolean(accessToken) || Boolean(getUserEmail());

/** Render-time hint only. The API decides what an admin may actually do. */
export const isAdmin = (): boolean => getUserRole() === ('admin' satisfies UserRole);

/** What sign-in, sign-up and refresh return, as far as this module cares. */
export interface SessionPayload {
  token?: string | null;
  user?: Partial<SessionUser> | null;
}

/** Keeps the `{ token, user }` payload returned by sign-in, sign-up or refresh. */
export const setSession = ({ token, user }: SessionPayload): void => {
  accessToken = token ?? null;
  if (user) {
    write(EMAIL_KEY, user.email ?? null);
    write(ROLE_KEY, user.role ?? null);
  }
};

export const clearSession = (): void => {
  accessToken = null;
  write(EMAIL_KEY, null);
  write(ROLE_KEY, null);
};

/** Authorization header for a request, or `{}` without a token. */
export const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
