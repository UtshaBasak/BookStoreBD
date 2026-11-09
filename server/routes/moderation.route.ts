import express from 'express';

import { clearFlags, decideFlag, getFlag, listFlags, moderationStats } from '../controllers/moderation.controller.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { moderationSchemas } from '../schemas/index.js';

/*
 * Automatic moderation's queue, for administrators only. Every decision is
 * written to the audit trail, and opening flagged chat messages is too.
 */
const router = express.Router();

router.use(requireAuth, requireAdmin);

router.get('/stats', moderationStats);
router.get('/flags', validate(moderationSchemas.list), listFlags);
router.post('/flags/clear', validate(moderationSchemas.bulkClear), clearFlags);
router.get('/flags/:id', validate(moderationSchemas.byId), getFlag);
router.post('/flags/:id/decision', validate(moderationSchemas.decision), decideFlag);

export default router;
