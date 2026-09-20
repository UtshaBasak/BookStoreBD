import { config } from '../config/env.js';

/**
 * The refresh token lives in an httpOnly cookie so page JavaScript cannot read
 * it — an XSS bug then cannot lift a long-lived credential. The access token,
 * which the client does need to read, is short-lived and returned in the body.
 *
 * Scoped to /auth: it is only ever sent to the refresh and logout endpoints,
 * so it is not attached to every ordinary API call.
 */
export const REFRESH_COOKIE = 'refreshToken';
export const REFRESH_COOKIE_PATH = '/auth';

const baseOptions = () => ({
  httpOnly: true,
  secure: config.cookies.secure,
  sameSite: config.cookies.sameSite,
  path: REFRESH_COOKIE_PATH,
});

export const setRefreshCookie = (res, token) => {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(),
    maxAge: config.jwt.refreshTtlMs,
  });
};

export const clearRefreshCookie = (res) => {
  // The options must match the ones it was set with, or the browser keeps it.
  res.clearCookie(REFRESH_COOKIE, baseOptions());
};

export const readRefreshCookie = (req) => req.cookies?.[REFRESH_COOKIE] ?? null;
