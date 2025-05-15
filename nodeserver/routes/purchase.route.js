import express from 'express';
import { createPurchase, getPurchasesByUser } from '../controllers/purchase.controller.js';

const router = express.Router();

router.post('/purchases', createPurchase); // Add this route
router.get('/purchases', getPurchasesByUser);

export default router;
