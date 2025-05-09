import express from 'express';
import { decreaseStock, getOrdersByBuyer, getOrdersBySeller, updateOrderStatus, deleteOrder, getAllOrders } from '../controllers/order.controller.js';

const router = express.Router();

router.post('/decrease-stock', decreaseStock);
router.get('/buyer', getOrdersByBuyer);
router.get('/seller', getOrdersBySeller);
router.get('/all', getAllOrders);
router.patch('/status/:id', updateOrderStatus);
router.delete('/:id', deleteOrder);

export default router;
