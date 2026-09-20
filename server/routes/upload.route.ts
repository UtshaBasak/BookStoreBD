import express from 'express';

import { requireAuth } from '../middleware/auth.js';
import {
  createUploadSignature,
  isCloudinaryConfigured,
  UPLOAD_FOLDER,
} from '../config/cloudinary.js';

const router = express.Router();

router.use(requireAuth);

/**
 * Hands the browser a short-lived signature so it can upload straight to
 * Cloudinary. The file itself never touches this process, which keeps a
 * ten-image upload off the API's memory and request budget entirely.
 *
 * Signed rather than unsigned uploads: an unsigned preset is a public write
 * endpoint that anyone can point at your account.
 */
router.get('/signature', (req, res) => {
  if (!isCloudinaryConfigured()) {
    return res.status(503).json({
      message: 'Image hosting is not configured',
      // The client falls back to sending base64 to the API.
      fallback: 'inline',
    });
  }

  return res.status(200).json(createUploadSignature({ folder: UPLOAD_FOLDER }));
});

export default router;
