import type { CookieOptions, Request, Response } from 'express';

import { config } from '../config/env.js';
import { API_PREFIX } from '../config/apiPaths.js';

/**
 * The refresh token lives in an httpOnly cookie so page JavaScript cannot read
 * it — an XSS bug then cannot lift a long-lived credential. The access token,
 * which the client does need to read, is short-lived and returned in the body.
 *
 * Scoped to /auth: it is only ever sent to the refresh and logout endpoints,
 * so it is not attached to every ordinary API call.
 */
export const REFRESH_COOKIE = 'refreshToken';
// Must match where the auth routes actually live: a browser only sends a
// cookie whose Path is a prefix of the request path, so scoping it to
// '/auth' while the endpoint sits at '/api/auth' means it is never sent.
export const REFRESH_COOKIE_PATH = `${API_PREFIX}/auth`;

const baseOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: config.cookies.secure,
  sameSite: config.cookies.sameSite,
  path: REFRESH_COOKIE_PATH,
});

export const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseOptions(),
    maxAge: config.jwt.refreshTtlMs,
  });
};

export const clearRefreshCookie = (res: Response): void => {
  // The options must match the ones it was set with, or the browser keeps it.
  res.clearCookie(REFRESH_COOKIE, baseOptions());
};

export const readRefreshCookie = (req: Request): string | null =>
  req.cookies?.[REFRESH_COOKIE] ?? null;
