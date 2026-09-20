import express from 'express';

import AddBook from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import { getBookById } from '../controllers/book.controller.js';
import { asTrimmedString, asNonNegativeInt } from '../utils/sanitize.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

/**
 * Loads the listing and confirms the caller owns it. Without this, any signed-in
 * user could reprice or delete another seller's books.
 */
const loadOwnedBook = async (req, res) => {
  const book = await AddBook.findById(asTrimmedString(req.params.id));
  if (!book) {
    res.status(404).json({ message: 'Book not found' });
    return null;
  }
  if (req.user.role !== 'admin' && book.sellerEmail !== req.user.email) {
    res.status(403).json({ message: 'You can only manage your own listings' });
    return null;
  }
  return book;
};

// ---------------------------------------------------------------------------
// Public browsing
// ---------------------------------------------------------------------------

router.get('/', async (req, res) => {
  try {
    const books = await AddBook.find();
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.get('/seller/:email', async (req, res) => {
  try {
    const books = await AddBook.find({ sellerEmail: asTrimmedString(req.params.email) });
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ---------------------------------------------------------------------------
// Seller-owned mutations
// ---------------------------------------------------------------------------

router.put('/update-stock/:id', requireAuth, async (req, res) => {
  try {
    const stock = asNonNegativeInt(req.body.stock);
    if (stock === null) {
      return res.status(400).json({ message: 'Stock must be a non-negative integer' });
    }

    const book = await loadOwnedBook(req, res);
    if (!book) return undefined;

    book.stock = stock;
    await book.save();

    // A listing that is out of stock should not sit in anyone's cart.
    if (book.stock === 0) {
      await Cart.deleteMany({ book: book._id });
    }

    return res.status(200).json({ message: 'Stock updated', book });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.put('/update-price/:id', requireAuth, async (req, res) => {
  try {
    const price = asNonNegativeInt(req.body.price);
    if (price === null) {
      return res.status(400).json({ message: 'Price must be a non-negative integer' });
    }

    const book = await loadOwnedBook(req, res);
    if (!book) return undefined;

    book.price = price;
    await book.save();

    return res.status(200).json({ message: 'Price updated', book });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

router.delete('/:id', requireAuth, async (req, res) => {
  try {
    const book = await loadOwnedBook(req, res);
    if (!book) return undefined;

    await book.deleteOne();
    await Cart.deleteMany({ book: book._id });

    return res.status(200).json({ message: 'Book deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
});

// Declared last so it does not shadow the specific routes above.
router.get('/:id', getBookById);

export default router;
