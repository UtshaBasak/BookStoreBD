import express from 'express';
import {
  returnBook,
  getReturnRequests,
  getReturnImage,
  updateReturnStatus,
} from '../controllers/return.controller.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { returnSchemas } from '../schemas/index.js';

const router = express.Router();

router.use(requireAuth);

// Submit a return request for your own purchase.
router.post('/', validate(returnSchemas.create), returnBook);

// Administrators see every request; everyone else sees only their own.
router.get('/requests', validate(returnSchemas.list), getReturnRequests);

// Before '/requests/:id' would ever be added, and after the list: a photograph
// of the defect, served as an image rather than carried in the table.
router.get('/requests/:id/image/:index', validate(returnSchemas.image), getReturnImage);
router.get('/requests/:id/image', validate(returnSchemas.image), getReturnImage);

// Approving or rejecting is an administrator action.
router.patch('/requests/:id', requireAdmin, validate(returnSchemas.updateStatus), updateReturnStatus);

export default router;
