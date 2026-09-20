import express from 'express';
import { createPurchase, getPurchasesByUser } from '../controllers/purchase.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { purchaseSchemas } from '../schemas/index.js';

const router = express.Router();

router.use(requireAuth);

router.get('/', getPurchasesByUser);
router.post('/', validate(purchaseSchemas.create), createPurchase);

export default router;
