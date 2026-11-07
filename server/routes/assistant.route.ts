import express from 'express';

import { assistantConfig, chat, feedback } from '../controllers/assistant.controller.js';
import { optionalAuth } from '../middleware/auth.js';
import { assistantLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { assistantSchemas } from '../schemas/index.js';

/*
 * The shopping assistant. Open to visitors and signed-in readers alike; a
 * signed-in reader's own orders and picks come from the session, never from
 * the request. Its own tight limit sits on top of a daily cap per person.
 */
const router = express.Router();

router.get('/config', assistantConfig);
router.post('/chat', assistantLimiter, optionalAuth, validate(assistantSchemas.chat), chat);
router.post('/feedback', assistantLimiter, optionalAuth, validate(assistantSchemas.feedback), feedback);

export default router;
