import express from 'express';

import {
  deleteReply,
  deleteReview,
  dismissFlags,
  flagReview,
  listFlaggedReviews,
  listReviews,
  replyToReview,
  upsertReview,
} from '../controllers/review.controller.js';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reviewSchemas } from '../schemas/index.js';

const router = express.Router();

/*
 * Before '/:id', or Express reads "flagged" as a book id and the schema
 * rejects it.
 */
router.get(
  '/flagged',
  requireAuth,
  requireAdmin,
  validate(reviewSchemas.flagged),
  listFlaggedReviews
);

/*
 * Reading is public: a rating that only signed-in people can see is no use to
 * the person deciding whether to sign up. `optionalAuth` so the same response
 * can say whether *this* caller may write one, whether they are the seller who
 * may answer one, and what they said last time.
 */
router.get('/:id', optionalAuth, validate(reviewSchemas.byBook), listReviews);

router.post('/:id', requireAuth, validate(reviewSchemas.write), upsertReview);
router.delete('/:id', requireAuth, validate(reviewSchemas.remove), deleteReview);

// The seller's answer. Keyed by the review, not by the book: one reply each.
router.post('/:id/reply', requireAuth, validate(reviewSchemas.reply), replyToReview);
router.delete('/:id/reply', requireAuth, validate(reviewSchemas.byBook), deleteReply);

// Reporting one, and what an administrator does about it.
router.post('/:id/flag', requireAuth, validate(reviewSchemas.flag), flagReview);
router.delete(
  '/:id/flags',
  requireAuth,
  requireAdmin,
  validate(reviewSchemas.byBook),
  dismissFlags
);

export default router;
