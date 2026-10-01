import express, { type Request, type Response } from 'express';

import AddBook, { type BookDocument } from '../models/AddBook.model.js';
import Cart from '../models/Cart.model.js';
import { adminBookList, getBookById, getBookCover } from '../controllers/book.controller.js';
import { actingUser, optionalAuth, requireAdmin, requireAuth } from '../middleware/auth.js';
import { destroyAssets } from '../config/cloudinary.js';
import { discountProblem } from '../config/pricing.js';
import BookRequest from '../models/BookRequest.model.js';
import { notify } from '../utils/notify.js';
import { priceChanged, stockChanged } from '../utils/catalogueEvents.js';
import { errorMessage } from '../utils/error.js';
import { LIST_IMAGE_PROJECTION, withCoverUrls } from '../utils/projections.js';
import { validate } from '../middleware/validate.js';
import {
  bookSchemas,
  type EmailParams,
  type IdParams,
  type UpdateDiscountBody,
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
// Listings are fetched a page at a time: `/filter/booklist` for a shopper,
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

/**
 * How many people are waiting for each of the caller's sold-out books, for
 * their Book List. Before `/:id`, which would read "requests" as an id.
 */
router.get('/requests/mine', requireAuth, async (req: Request, res: Response) => {
  try {
    const { email } = actingUser(req);
    const rows = await BookRequest.aggregate<{ _id: unknown; count: number }>([
      { $match: { sellerEmail: String(email), open: true } },
      { $group: { _id: '$book', count: { $sum: 1 } } },
    ]);
    res.json(Object.fromEntries(rows.map((row) => [String(row._id), row.count])));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
});

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

      const before = Number(book.stock) || 0;
      book.stock = stock;
      await book.save();

      // A sold-out book stays in the carts it is in, marked sold out there,
      // rather than vanishing from under the people who chose it. Who hears
      // about the change is decided in one place.
      await stockChanged(book, before, Number(stock), { actor: actingUser(req).email });

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

      const before = Number(book.salePrice ?? book.price);
      book.price = price;
      await book.save();
      await priceChanged(book, before, Number(book.salePrice ?? book.price), { actor: actingUser(req).email });

      res.status(200).json({ message: 'Price updated', book });
    } catch (error) {
      res.status(500).json({ message: errorMessage(error) });
    }
  }
);

/**
 * The seller's discount on one of their listings: a percentage or an amount of
 * taka off, or none. The sale price is worked out on save (config/pricing.ts),
 * and the listing appears in Quick deals for as long as it has one.
 */
router.put(
  '/discount/:id',
  requireAuth,
  validate(bookSchemas.updateDiscount),
  async (req: Request<IdParams, unknown, UpdateDiscountBody>, res: Response) => {
    try {
      const book = await loadOwnedBook(req, res);
      if (!book) return;

      const discount = req.body.type === 'none' ? { type: null, value: 0 } : { type: req.body.type, value: req.body.value };
      const problem = discountProblem(Number(book.price), discount);
      if (problem) {
        res.status(400).json({ message: problem });
        return;
      }

      const before = Number(book.salePrice ?? book.price);
      book.discountType = discount.type;
      book.discountValue = discount.value;
      await book.save();

      // A deal, or a better one, is a price drop: everyone with the book in a
      // cart or on a wishlist hears of it, if it beats what they saw.
      await priceChanged(book, before, Number(book.salePrice ?? book.price), { actor: actingUser(req).email });

      res.status(200).json({ message: discount.type ? 'Discount saved' : 'Discount removed', book });
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
      // Otherwise the assets would stay in the hosting account, still billed.
      await destroyAssets(book.imagePublicIds);

      res.status(200).json({ message: 'Book deleted successfully' });
    } catch (error) {
      res.status(500).json({ message: errorMessage(error) });
    }
  }
);

// ---------------------------------------------------------------------------
// Asking for a sold-out book
// ---------------------------------------------------------------------------

const requestStatus = async (bookId: string, email: string): Promise<{ requested: boolean; count: number }> => {
  const [mine, count] = await Promise.all([
    BookRequest.exists({ book: bookId, requester: email, open: true }),
    BookRequest.countDocuments({ book: bookId, open: true }),
  ]);
  return { requested: Boolean(mine), count };
};

/** Whether the caller has asked for this book, and how many are waiting. */
router.get('/:id/request', requireAuth, validate(bookSchemas.byId), async (req: Request<IdParams>, res: Response) => {
  try {
    res.json(await requestStatus(String(req.params.id), String(actingUser(req).email)));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
});

/**
 * "Tell me when it is back": a sold-out book, asked for. The seller hears
 * there is somebody waiting; the person asking hears when copies are added.
 */
router.post('/:id/request', requireAuth, validate(bookSchemas.byId), async (req: Request<IdParams>, res: Response) => {
  try {
    const email = String(actingUser(req).email);
    const book = await AddBook.findById(String(req.params.id), { title: 1, sellerEmail: 1, stock: 1 }).lean();
    if (!book) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }
    if (book.sellerEmail === email) {
      res.status(400).json({ message: 'This is your own book. Add copies from your Book List.' });
      return;
    }
    if (Number(book.stock) > 0) {
      res.status(409).json({ message: 'This book is in stock. You can add it to your cart.' });
      return;
    }

    const created = await BookRequest.updateOne(
      { book: book._id, requester: email, open: true },
      { $setOnInsert: { book: book._id, requester: email, sellerEmail: book.sellerEmail, open: true, createdAt: new Date() } },
      { upsert: true }
    );
    const status = await requestStatus(String(book._id), email);
    if (created.upsertedCount) {
      await notify([book.sellerEmail], {
        type: 'book-request',
        title: `Someone wants "${book.title}" back in stock`,
        body: `${status.count} ${status.count === 1 ? 'person is' : 'people are'} waiting. Add copies and they will be told.`,
        link: '/seller-books',
      });
    }
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
});

/** Withdraws the caller's request. */
router.delete('/:id/request', requireAuth, validate(bookSchemas.byId), async (req: Request<IdParams>, res: Response) => {
  try {
    const email = String(actingUser(req).email);
    await BookRequest.updateOne(
      { book: String(req.params.id), requester: email, open: true },
      { $set: { open: false, closedAt: new Date() } }
    );
    res.json(await requestStatus(String(req.params.id), email));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
});

// Declared last so it does not shadow the specific routes above.
// Before `/:id`, or the cover path would be read as a book id.
router.get('/:id/cover/:index', validate(bookSchemas.cover), getBookCover);
router.get('/:id/cover', validate(bookSchemas.cover), getBookCover);

// optionalAuth: so a seller looking at their own listing does not add a view.
router.get('/:id', optionalAuth, validate(bookSchemas.byId), getBookById);

export default router;
