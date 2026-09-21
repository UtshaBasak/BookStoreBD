import express from 'express';

import { deleteReview, listReviews, upsertReview } from '../controllers/review.controller.js';
import { optionalAuth, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reviewSchemas } from '../schemas/index.js';

const router = express.Router();

/*
 * Reading is public: a rating that only signed-in people can see is no use to
 * the person deciding whether to sign up. `optionalAuth` so the same response
 * can say whether *this* caller may write one, and what they said last time.
 */
router.get('/:id', optionalAuth, validate(reviewSchemas.byBook), listReviews);

router.post('/:id', requireAuth, validate(reviewSchemas.write), upsertReview);
router.delete('/:id', requireAuth, validate(reviewSchemas.remove), deleteReview);

export default router;
