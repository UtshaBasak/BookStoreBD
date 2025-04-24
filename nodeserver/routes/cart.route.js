import express from 'express';
import {
  Cart_get,
  Cart_add,
  Cart_remove
} from '../controllers/cart.controller.js';

const router = express.Router();

router.get('/', Cart_get); // GET /cart?email=...
router.post('/add/:id', Cart_add); // POST /cart/add/:id { email }
router.post('/remove/:id', Cart_remove); // POST /cart/remove/:id { email }

export default router;
