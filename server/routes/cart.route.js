import express from 'express';
import {
  Cart_get,
  Cart_add,
  Cart_remove,
  Cart_clear
} from '../controllers/cart.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// A cart belongs to the signed-in user; the owner is taken from the token.
router.use(requireAuth);

router.get('/', Cart_get);
router.post('/add/:id', Cart_add);
router.post('/remove/:id', Cart_remove);
router.post('/clear', Cart_clear); // used after checkout

export default router;
