import type { SessionUser } from '@shared/api.js';

/**
 * Hangs the acting identity on the request object.
 *
 * `requireAuth` and `optionalAuth` are the only things that set it. Optional
 * on purpose: a handler reached without either of them has no user, and the
 * type says so rather than letting `req.user.email` compile into a crash.
 * Handlers behind `requireAuth` read it through `actingUser(req)`.
 */
declare global {
  namespace Express {
    interface Request {
      user?: SessionUser | null;
    }
  }
}

export {};
