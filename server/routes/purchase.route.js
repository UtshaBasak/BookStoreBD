import express from 'express';
import { createPurchase, getPurchasesByUser } from '../controllers/purchase.controller.js';

const router = express.Router();

router.get('/', getPurchasesByUser); // GET /purchase?email=...
router.post('/', createPurchase);    // POST /purchase

export default router;
