import express from 'express';
import multer from 'multer';

import { signup, signin } from '../controllers/auth.controller.js';
import {
  test,
  getUserProfile,
  updateUserProfile,
  uploadDescriptionImages,
} from '../controllers/user.controller.js';
import AddBook from '../models/AddBook.model.js';
import User from '../models/user.model.js';
import { config } from '../config/env.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';
import { isOwnedCloudinaryUrl } from '../config/cloudinary.js';
import { createLogger } from '../config/logger.js';
import { validate } from '../middleware/validate.js';
import { userSchemas } from '../schemas/index.js';

const log = createLogger('user-routes');

const router = express.Router();

/**
 * Reads back the Cloudinary URLs the browser reports after a direct upload.
 *
 * Each one is checked against this account's delivery host. The client is
 * telling the server what to store, so without that check a caller could pin
 * any URL they liked to a listing and have it rendered to every visitor.
 */
const collectHostedImages = (body) => {
  const toArray = (value) => (Array.isArray(value) ? value : value ? [value] : []);

  const urls = toArray(body.images).filter(isOwnedCloudinaryUrl);
  const ids = toArray(body.imagePublicIds).filter((id) => typeof id === 'string' && id);

  return { images: urls, publicIds: urls.length ? ids.slice(0, urls.length) : [] };
};

// Images are held in memory and persisted on the document as base64 data URIs.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxFileSizeBytes },
});

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

// Kept as aliases of /auth/signup and /auth/signin for existing callers.
router.post('/signup', signup);
router.post('/signin', signin);

router.get('/test', test);

// A listing shows its seller's public details, so this stays readable without
// a token; the handler only ever returns non-sensitive fields.
router.get('/profile', optionalAuth, validate(userSchemas.profileQuery), getUserProfile);

// ---------------------------------------------------------------------------
// Authenticated
// ---------------------------------------------------------------------------

router.put(
  '/profile',
  requireAuth,
  upload.single('profilePicture'),
  // After multer, which is what populates req.body for a multipart form.
  validate(userSchemas.updateProfile),
  updateUserProfile
);

router.post(
  '/add-book',
  requireAuth,
  upload.array('images', config.uploads.maxFilesPerRequest),
  async (req, res) => {
    try {
      // Two ways in. When image hosting is configured the browser has already
      // uploaded to Cloudinary and sends back the URLs; otherwise the files
      // arrive here and are stored inline as before.
      const hosted = collectHostedImages(req.body);
      const inline = req.files
        ? req.files.map((file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`)
        : [];

      const bookData = {
        ...req.body,
        images: hosted.images.length ? hosted.images : inline,
        imagePublicIds: hosted.publicIds,
        // The seller is the signed-in user. Taking this from the body would let
        // anyone publish a listing under someone else's name.
        sellerEmail: req.user.email,
        stock: 1,
      };

      if (typeof bookData.category === 'string') {
        bookData.category = [bookData.category];
      }
      if (bookData.pages) bookData.pages = Number(bookData.pages);
      if (bookData.price) bookData.price = Number(bookData.price);

      const newBook = new AddBook(bookData);
      await newBook.save();
      res.status(201).json({ message: 'Book added successfully!', book: newBook });
    } catch (error) {
      log.error({ err: error }, 'AddBook error');
      // Stack traces must never be returned to clients.
      res.status(500).json({ message: 'Failed to add book', error: error.message });
    }
  }
);

router.post(
  '/upload-images',
  requireAuth,
  upload.array('images', config.uploads.maxFilesPerRequest),
  uploadDescriptionImages
);

// ---------------------------------------------------------------------------
// Administrator only
// ---------------------------------------------------------------------------

router.get('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json(users);
  } catch (error) {
    log.error({ err: error }, 'Error fetching users');
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
});

router.delete('/:id', requireAuth, requireAdmin, validate(userSchemas.byId), async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    log.error({ err: error }, 'Error deleting user');
    return res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
});

export default router;
