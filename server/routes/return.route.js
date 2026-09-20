import express from 'express';
import { returnBook, getReturnRequests, updateReturnStatus } from '../controllers/return.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { returnSchemas } from '../schemas/index.js';

const router = express.Router();

router.use(requireAuth);

// Submit a return request for your own purchase.
router.post('/', validate(returnSchemas.create), returnBook);

// Administrators see every request; everyone else sees only their own.
router.get('/requests', getReturnRequests);

// Approving or rejecting is an administrator action.
router.patch('/requests/:id', requireAdmin, validate(returnSchemas.updateStatus), updateReturnStatus);

export default router;
