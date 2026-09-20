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

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value === null || value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    /* private mode or blocked storage - the session simply will not persist */
  }
};

export const getToken = () => read(TOKEN_KEY);
export const getUserEmail = () => read(EMAIL_KEY);
export const getUserRole = () => read(ROLE_KEY);

export const isAuthenticated = () => Boolean(getToken());

/** Render-time hint only. The API decides what an admin may actually do. */
export const isAdmin = () => getUserRole() === 'admin';

/** Stores the `{ token, user }` payload returned by sign-in or sign-up. */
export const setSession = ({ token, user }) => {
  write(TOKEN_KEY, token ?? null);
  write(EMAIL_KEY, user?.email ?? null);
  write(ROLE_KEY, user?.role ?? null);
};

export const clearSession = () => {
  write(TOKEN_KEY, null);
  write(EMAIL_KEY, null);
  write(ROLE_KEY, null);
};

/** Authorization header for a request, or `{}` when signed out. */
export const authHeaders = () => {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};
