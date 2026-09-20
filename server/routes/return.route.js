import express from 'express';
import { returnBook, getReturnRequests, updateReturnStatus } from '../controllers/return.controller.js';

const router = express.Router();

// User submits a return request
router.post('/', returnBook);

// Admin or user fetches return requests
router.get('/requests', getReturnRequests);

// Admin updates return status
router.patch('/requests/:id', updateReturnStatus);

export default router;