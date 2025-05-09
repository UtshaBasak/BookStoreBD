import express from 'express';
import AddBook from '../models/AddBook.model.js';
import { getBookById } from '../controllers/book.controller.js';

const router = express.Router();

// Fetch all books
router.get('/', async (req, res) => {
  try {
    const books = await AddBook.find();
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Fetch books by seller email
router.get('/seller/:email', async (req, res) => {
  try {
    const books = await AddBook.find({ sellerEmail: req.params.email });
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update stock (non-negative integer only)
router.put('/update-stock/:id', async (req, res) => {
  try {
    const { stock } = req.body;
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ message: 'Stock must be a non-negative integer' });
    }
    const book = await AddBook.findByIdAndUpdate(
      req.params.id,
      { stock },
      { new: true }
    );
    if (!book) return res.status(404).json({ message: 'Book not found' });

    // Remove from all carts if stock is now 0
    if (book.stock === 0) {
      const Cart = (await import('../models/Cart.model.js')).default;
      await Cart.deleteMany({ book: book._id });
    }

    res.status(200).json({ message: 'Stock updated', book });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update price (non-negative integer only)
router.put('/update-price/:id', async (req, res) => {
  try {
    const { price } = req.body;
    if (!Number.isInteger(price) || price < 0) {
      return res.status(400).json({ message: 'Price must be a non-negative integer' });
    }
    const book = await AddBook.findByIdAndUpdate(
      req.params.id,
      { price },
      { new: true }
    );
    if (!book) return res.status(404).json({ message: 'Book not found' });
    res.status(200).json({ message: 'Price updated', book });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete book by ID
router.delete('/:id', async (req, res) => {
  try {
    await AddBook.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update this route to use the controller
router.get('/:id', getBookById);

export default router;
