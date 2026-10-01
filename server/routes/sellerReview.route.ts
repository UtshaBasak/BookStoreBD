import express from 'express';

import {
  deleteSellerReply,
  deleteSellerReview,
  dismissSellerReviewFlags,
  flagSellerReview,
  listAllSellerReviews,
  listFlaggedSellerReviews,
  listSellerReviews,
  replyToSellerReview,
  upsertSellerReview,
} from '../controllers/sellerReview.controller.js';
import { optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { reviewSchemas } from '../schemas/index.js';

/*
 * Ratings of sellers, keyed by the seller's account id. The same endpoints,
 * and the same rules, as book reviews under /review.
 */
const router = express.Router();

// Before '/:id', so these are not read as a seller's id.
router.get('/all', requireAuth, requireAdmin, validate(reviewSchemas.adminList), listAllSellerReviews);
router.get('/flagged', requireAuth, requireAdmin, validate(reviewSchemas.flagged), listFlaggedSellerReviews);

router.get('/:id', optionalAuth, validate(reviewSchemas.byBook), listSellerReviews);
router.post('/:id', requireAuth, validate(reviewSchemas.write), upsertSellerReview);
router.delete('/:id', requireAuth, validate(reviewSchemas.remove), deleteSellerReview);

router.post('/:id/reply', requireAuth, validate(reviewSchemas.reply), replyToSellerReview);
router.delete('/:id/reply', requireAuth, validate(reviewSchemas.byBook), deleteSellerReply);

router.post('/:id/flag', requireAuth, validate(reviewSchemas.flag), flagSellerReview);
router.delete('/:id/flags', requireAuth, requireAdmin, validate(reviewSchemas.byBook), dismissSellerReviewFlags);

export default router;
