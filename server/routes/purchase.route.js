import express from 'express';
import { createPurchase, getPurchasesByUser } from '../controllers/purchase.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getPurchasesByUser);
router.post('/', createPurchase);

export default router;
