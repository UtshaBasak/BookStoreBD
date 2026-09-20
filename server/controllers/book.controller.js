import AddBook from '../models/AddBook.model.js';
import { LIST_IMAGE_PROJECTION } from '../utils/projections.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('book');

// Get book details with related books
export const getBookById = async (req, res) => {
    try {
        const book = await AddBook.findById(req.params.id);
        if (!book) {
            return res.status(404).json({ message: 'Book not found' });
        }

        // Find related books (same category or author)
        const relatedBooks = await AddBook.find(
            {
                _id: { $ne: book._id }, // exclude current book
                $or: [
                    { category: { $in: book.category } },
                    { author: book.author }
                ]
            },
            LIST_IMAGE_PROJECTION
        ).limit(10);

        // Combine book data with related books
        const bookResponse = {
            ...book.toObject(),
            relatedBooks
        };

        res.status(200).json(bookResponse);
    } catch (error) {
        log.error({ err: error }, 'Error fetching book');
        res.status(500).json({ message: 'Error fetching book details' });
    }
};
