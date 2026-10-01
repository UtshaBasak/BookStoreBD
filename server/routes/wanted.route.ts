import express from 'express';

import { createWanted, joinWanted, leaveWanted, listWanted, removeWanted } from '../controllers/wanted.controller.js';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { wantedSchemas } from '../schemas/index.js';

/*
 * The Wanted board. Reading is public, so a seller can see what buyers are
 * asking for without an account; asking, joining and leaving need one.
 */
const router = express.Router();

router.get('/', optionalAuth, validate(wantedSchemas.list), listWanted);
router.post('/', requireAuth, validate(wantedSchemas.create), createWanted);
router.post('/:id/join', requireAuth, validate(wantedSchemas.byId), joinWanted);
router.delete('/:id/join', requireAuth, validate(wantedSchemas.byId), leaveWanted);
router.delete('/:id', requireAuth, requireAdmin, validate(wantedSchemas.byId), removeWanted);

export default router;
