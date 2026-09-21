import type { Request, RequestHandler } from 'express';

import type { SessionUser } from '@shared/api.js';

import User from '../models/user.model.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.js';

/**
 * Resolves the caller from the bearer token and hangs it on `req.user`.
 *
 * Every handler downstream must take the acting identity from here rather
 * than from a request parameter. An `?email=` in the query is supplied by the
 * caller and proves nothing.
 */
const resolveUser = async (req: Request): Promise<SessionUser | null> => {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) return null;

  const payload = verifyAccessToken(token);
  if (!payload?.sub) return null;

  // Read the user back so a deleted or demoted account cannot keep acting on
  // a token that was valid when it was issued.
  const user = await User.findById(payload.sub).select('-password').lean();
  if (!user) return null;

  return { id: String(user._id), email: user.email, username: user.username, role: user.role };
};

/** Rejects the request unless it carries a valid token. */
export const requireAuth: RequestHandler = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/** Populates `req.user` when a token is present, but allows anonymous access. */
export const optionalAuth: RequestHandler = async (req, res, next) => {
  try {
    req.user = await resolveUser(req);
    next();
  } catch (error) {
    next(error);
  }
};

/** Requires an authenticated administrator. Use after `requireAuth`. */
export const requireAdmin: RequestHandler = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ message: 'Administrator access required' });
    return;
  }
  next();
};

/**
 * Just the part of a request these read.
 *
 * Handlers that declare their own body or params types produce a narrower
 * `Request`, which is not assignable to the default one; asking only for what
 * is actually used sidesteps that entirely.
 */
export type WithUser = Pick<Request, 'user'>;

/**
 * The signed-in user, for handlers that sit behind `requireAuth`.
 *
 * The throw is unreachable in a correctly wired route and is not an
 * authentication check: it fires only if a handler that needs an identity is
 * mounted without the middleware that supplies one, which is a wiring mistake
 * and should surface as a 500 rather than be papered over with a 401.
 */
export const actingUser = (req: WithUser): SessionUser => {
  if (!req.user) {
    throw new Error('actingUser() called on a route that is not behind requireAuth');
  }
  return req.user;
};
