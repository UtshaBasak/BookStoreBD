import User from '../models/user.model.js';
import { extractBearerToken, verifyAccessToken } from '../utils/jwt.js';

/**
 * Resolves the caller from the bearer token and hangs it on `req.user`.
 *
 * Every handler downstream must take the acting identity from here rather
 * than from a request parameter. An `?email=` in the query is supplied by the
 * caller and proves nothing.
 */
const resolveUser = async (req) => {
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
export const requireAuth = async (req, res, next) => {
  try {
    const user = await resolveUser(req);
    if (!user) {
      return res.status(401).json({ message: 'Authentication required' });
    }
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
};

/** Populates `req.user` when a token is present, but allows anonymous access. */
export const optionalAuth = async (req, res, next) => {
  try {
    req.user = await resolveUser(req);
    next();
  } catch (error) {
    next(error);
  }
};

/** Requires an authenticated administrator. Use after `requireAuth`. */
export const requireAdmin = (req, res, next) => {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ message: 'Administrator access required' });
  }
  next();
};

/** True when the caller is the named user, or an administrator. */
export const isSelfOrAdmin = (req, email) =>
  req.user?.role === 'admin' || (!!email && req.user?.email === email);
