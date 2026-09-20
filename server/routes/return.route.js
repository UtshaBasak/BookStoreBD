import express from 'express';
import { returnBook, getReturnRequests, updateReturnStatus } from '../controllers/return.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = express.Router();

router.use(requireAuth);

// Submit a return request for your own purchase.
router.post('/', returnBook);

// Administrators see every request; everyone else sees only their own.
router.get('/requests', getReturnRequests);

// Approving or rejecting is an administrator action.
router.patch('/requests/:id', requireAdmin, updateReturnStatus);

export default router;
