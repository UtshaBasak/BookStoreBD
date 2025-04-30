import express from 'express';
import { confirmOrder, getOrderDetails } from '../controllers/order.controller.js';

const router = express.Router();

router.post('/confirm', confirmOrder);
router.get('/:orderNumber', getOrderDetails);

export default router;