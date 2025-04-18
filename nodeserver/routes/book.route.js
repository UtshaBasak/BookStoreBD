import express from 'express';
import AddBook from '../models/AddBook.model.js';

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

// Delete book by ID
router.delete('/:id', async (req, res) => {
  try {
    await AddBook.findByIdAndDelete(req.params.id);
    res.status(200).json({ message: 'Book deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
