import express from 'express';
import { decreaseStock, getOrdersByBuyer, deleteOrder } from '../controllers/order.controller.js';

const router = express.Router();

router.post('/decrease-stock', decreaseStock);
router.get('/buyer', getOrdersByBuyer);
router.delete('/:id', deleteOrder);

export default router;
