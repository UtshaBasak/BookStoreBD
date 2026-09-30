import express from 'express';
import {
  Cart_get,
  Cart_add,
  Cart_remove,
  Cart_clear,
  Cart_setQuantity,
} from '../controllers/cart.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { cartSchemas } from '../schemas/index.js';

const router = express.Router();

// A cart belongs to the signed-in user; the owner is taken from the token.
router.use(requireAuth);

router.get('/', Cart_get);
router.post('/add/:id', validate(cartSchemas.add), Cart_add);
router.patch('/:id', validate(cartSchemas.setQuantity), Cart_setQuantity);
router.post('/remove/:id', validate(cartSchemas.mutate), Cart_remove);
router.post('/clear', Cart_clear); // used after checkout

export default router;
