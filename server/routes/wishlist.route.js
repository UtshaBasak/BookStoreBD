import express from 'express';
import {
  Wishlist_get,
  Wishlist_add,
  Wishlist_remove
} from '../controllers/wishlist.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// A wishlist belongs to the signed-in user; the owner is taken from the token.
router.use(requireAuth);

router.get('/', Wishlist_get);
router.post('/add/:id', Wishlist_add);
router.post('/remove/:id', Wishlist_remove);

export default router;
