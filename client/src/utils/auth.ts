import type { SessionUser, UserRole } from '@shared/api.js';

/**
 * Session storage for the access token returned by `/auth/signin`.
 *
 * The token is what the API trusts. Anything kept alongside it here - the
 * e-mail, the role - is only for rendering, and the server re-checks it on
 * every request, so editing it in devtools gains nothing.
 */
const TOKEN_KEY = 'authToken';
const EMAIL_KEY = 'userEmail';
const ROLE_KEY = 'userRole';

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
    /* private mode or blocked storage - the session simply will not persist */
  }
};

export const getToken = (): string | null => read(TOKEN_KEY);
export const getUserEmail = (): string | null => read(EMAIL_KEY);
export const getUserRole = (): string | null => read(ROLE_KEY);

export const isAuthenticated = (): boolean => Boolean(getToken());

/** Render-time hint only. The API decides what an admin may actually do. */
export const isAdmin = (): boolean => getUserRole() === ('admin' satisfies UserRole);

/** What sign-in, sign-up and refresh return, as far as this module cares. */
export interface SessionPayload {
  token?: string | null;
  user?: Partial<SessionUser> | null;
}

/** Stores the `{ token, user }` payload returned by sign-in or sign-up. */
export const setSession = ({ token, user }: SessionPayload): void => {
  write(TOKEN_KEY, token ?? null);
  write(EMAIL_KEY, user?.email ?? null);
  write(ROLE_KEY, user?.role ?? null);
};

export const clearSession = (): void => {
  write(TOKEN_KEY, null);
  write(EMAIL_KEY, null);
  write(ROLE_KEY, null);
};

/** Authorization header for a request, or `{}` when signed out. */
export const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
