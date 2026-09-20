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

const router = express.Router();

// Images are held in memory and persisted on the document as base64 data URIs.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.uploads.maxFileSizeBytes },
});

// Authentication
router.post('/signup', signup);
router.post('/signin', signin);

router.get('/test', test);

// Profile
router.get('/profile', getUserProfile);
router.put('/profile', upload.single('profilePicture'), updateUserProfile);

// Book listing creation (with image upload)
router.post('/add-book', upload.array('images', config.uploads.maxFilesPerRequest), async (req, res) => {
  try {
    const bookData = {
      ...req.body,
      images: req.files
        ? req.files.map((file) => `data:${file.mimetype};base64,${file.buffer.toString('base64')}`)
        : [],
      sellerEmail: req.body.sellerEmail,
      stock: 1,
    };

    if (!bookData.sellerEmail) {
      return res.status(400).json({ message: 'sellerEmail is required' });
    }
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
});

// Admin: list users
router.get('/', async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ message: 'Failed to fetch users', error: error.message });
  }
});

// Admin: delete user
router.delete('/:id', async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.status(200).json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ message: 'Failed to delete user', error: error.message });
  }
});

// Image uploads for the return/description form
router.post('/upload-images', upload.array('images', config.uploads.maxFilesPerRequest), uploadDescriptionImages);

export default router;
