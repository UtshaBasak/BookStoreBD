import express from 'express';
import {
  Wishlist_get,
  Wishlist_add,
  Wishlist_remove
} from '../controllers/wishlist.controller.js';

const router = express.Router();

router.get('/', Wishlist_get); // GET /wishlist?email=...
router.post('/add/:id', Wishlist_add); // POST /wishlist/add/:id { email }
router.post('/remove/:id', Wishlist_remove); // POST /wishlist/remove/:id { email }

export default router;