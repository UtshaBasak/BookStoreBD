import express, { type Request, type Response } from 'express';

import AuditLog from '../models/AuditLog.model.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { auditSchemas, type AuditListQuery } from '../schemas/index.js';

const router = express.Router();

/**
 * The trail of privileged changes, newest first.
 *
 * Administrators only: it names who did what, which is exactly the information
 * that should not be public. Read-only - nothing in the application edits or
 * removes a row, which is what makes it worth keeping.
 */
router.get(
  '/',
  requireAuth,
  requireAdmin,
  validate(auditSchemas.list),
  async (req: Request<unknown, unknown, unknown, AuditListQuery>, res: Response, next) => {
    try {
      const { action, actorEmail, limit = 50, skip = 0 } = req.query;

      const filter: Record<string, unknown> = {};
      if (action) filter.action = action;
      if (actorEmail) filter.actorEmail = actorEmail;

      const [entries, total] = await Promise.all([
        AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AuditLog.countDocuments(filter),
      ]);

      res.status(200).json({ total, skip, limit, entries });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
