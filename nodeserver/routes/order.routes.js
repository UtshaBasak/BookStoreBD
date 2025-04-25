import express from 'express';
import { decreaseStock } from '../controllers/order.controller.js';

const router = express.Router();

router.post('/decrease-stock', decreaseStock);

export default router;
