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
import { asTrimmedString } from '../utils/sanitize.js';
import { requireAuth, requireAdmin, optionalAuth } from '../middleware/auth.js';

const router = express.Router();

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
router.get('/profile', optionalAuth, getUserProfile);

// ---------------------------------------------------------------------------
// Authenticated
// ---------------------------------------------------------------------------

router.put('/profile', requireAuth, upload.single('profilePicture'), updateUserProfile);

router.post(
  '/add-book',
  requireAuth,
  upload.array('images', config.uploads.maxFilesPerRequest),
  async (req, res) => {
    try {
      const bookData = {
        ...req.body,
        images: req.files
          ? req.files.map((file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`)
          : [],
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
      console.error('AddBook error:', error);
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
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
});

router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const id = asTrimmedString(req.params.id);
    if (id === req.user.id) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    return res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    return res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
});

export default router;
