import express, { type Request, type Response } from 'express';

import AddBook, { type BookDocument } from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import { adminBookList, getBookById, getBookCover } from '../controllers/book.controller.js';
import { actingUser, requireAdmin, requireAuth } from '../middleware/auth.js';
import { destroyAssets } from '../config/cloudinary.js';
import { errorMessage } from '../utils/error.js';
import { LIST_IMAGE_PROJECTION, withCoverUrls } from '../utils/projections.js';
import { validate } from '../middleware/validate.js';
import {
  bookSchemas,
  type EmailParams,
  type IdParams,
  type UpdatePriceBody,
  type UpdateStockBody,
} from '../schemas/index.js';

const router = express.Router();

/**
 * Loads the listing and confirms the caller owns it. Without this, any signed-in
 * user could reprice or delete another seller's books.
 */
const loadOwnedBook = async (
  req: Request<IdParams>,
  res: Response
): Promise<BookDocument | null> => {
  const book = await AddBook.findById(req.params.id);
  if (!book) {
    res.status(404).json({ message: 'Book not found' });
    return null;
  }
  const actor = actingUser(req);
  if (actor.role !== 'admin' && book.sellerEmail !== actor.email) {
    res.status(403).json({ message: 'You can only manage your own listings' });
    return null;
  }
  return book;
};

// ---------------------------------------------------------------------------
// Public browsing
//
// There is no "every listing" endpoint any more. It answered with the whole
// catalogue - 140 KB at 307 books, and growing - and the two pages that used
// it now ask for the page they are drawing: `/filter/booklist` for a shopper,
// `/admin` below for an administrator.
// ---------------------------------------------------------------------------

/**
 * Before `/:id`, or Express reads "admin" as an id and the schema rejects it.
 */
router.get(
  '/admin',
  requireAuth,
  requireAdmin,
  validate(bookSchemas.adminList),
  adminBookList
);

router.get(
  '/seller/:email',
  validate(bookSchemas.bySeller),
  async (req: Request<EmailParams>, res: Response) => {
    try {
      const books = await AddBook.find(
        { sellerEmail: req.params.email },
        LIST_IMAGE_PROJECTION
      ).lean();
      res.status(200).json(books.map(withCoverUrls));
    } catch (error) {
      res.status(500).json({ message: errorMessage(error) });
    }
  }
);

// ---------------------------------------------------------------------------
// Seller-owned mutations
// ---------------------------------------------------------------------------

router.put(
  '/update-stock/:id',
  requireAuth,
  validate(bookSchemas.updateStock),
  async (req: Request<IdParams, unknown, UpdateStockBody>, res: Response) => {
    try {
      const { stock } = req.body;

      const book = await loadOwnedBook(req, res);
      if (!book) return;

      book.stock = stock;
      await book.save();

      // A listing that is out of stock should not sit in anyone's cart.
      if (book.stock === 0) {
        await Cart.deleteMany({ book: book._id });
      }

      res.status(200).json({ message: 'Stock updated', book });
    } catch (error) {
      res.status(500).json({ message: errorMessage(error) });
    }
  }
);

router.put(
  '/update-price/:id',
  requireAuth,
  validate(bookSchemas.updatePrice),
  async (req: Request<IdParams, unknown, UpdatePriceBody>, res: Response) => {
    try {
      const { price } = req.body;

      const book = await loadOwnedBook(req, res);
      if (!book) return;

      book.price = price;
      await book.save();

      res.status(200).json({ message: 'Price updated', book });
    } catch (error) {
      res.status(500).json({ message: errorMessage(error) });
    }
  }
);

router.delete(
  '/:id',
  requireAuth,
  validate(bookSchemas.byId),
  async (req: Request<IdParams>, res: Response) => {
    try {
      const book = await loadOwnedBook(req, res);
      if (!book) return;

      await book.deleteOne();
      await Cart.deleteMany({ book: book._id });
      // Otherwise the assets linger in the account, billed for, forever.
      await destroyAssets(book.imagePublicIds);

      res.status(200).json({ message: 'Book deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: errorMessage(error) });
    }
  }
);

// Declared last so it does not shadow the specific routes above.
// Before `/:id`, or the cover path would be read as a book id.
router.get('/:id/cover/:index', validate(bookSchemas.cover), getBookCover);
router.get('/:id/cover', validate(bookSchemas.cover), getBookCover);

router.get('/:id', validate(bookSchemas.byId), getBookById);

export default router;
