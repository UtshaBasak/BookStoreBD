import express from 'express';
import {
  decreaseStock,
  getOrdersByBuyer,
  getOrdersBySeller,
  deleteOrder,
  getAllOrders,
  getOrderByOrderNumber,
  updateOrderStatusByOrderNumber,
} from '../controllers/order.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// Admin routes are declared before '/:orderNumber' so they are not shadowed.
router.get('/admin/all', requireAdmin, getAllOrders);
router.delete('/:id', requireAdmin, deleteOrder);

router.post('/decrease-stock', decreaseStock);
router.get('/buyer', getOrdersByBuyer);
router.get('/seller', getOrdersBySeller);

// Both of these additionally check that the caller is the buyer, the seller,
// or an administrator before returning or changing anything.
router.get('/:orderNumber', getOrderByOrderNumber);
router.patch('/status/:orderNumber', updateOrderStatusByOrderNumber);

export default router;
