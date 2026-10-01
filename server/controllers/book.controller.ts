import type { RequestHandler } from 'express';

import AddBook from '../models/AddBook.model.js';
import User from '../models/user.model.js';
import type { AdminBookQuery } from '../schemas/index.js';
import { LIST_IMAGE_PROJECTION, withCoverUrls } from '../utils/projections.js';
import { validatedQuery } from '../middleware/validate.js';
import { serveStoredImage } from '../utils/serveImage.js';
import { contains } from '../utils/regex.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('book');

/**
 * Serves one cover as an image.
 *
 * Covers are stored on the document as base64, but they are sent as image
 * requests rather than inside JSON: a browser cannot cache an image inside a
 * JSON body, and base64 of a JPEG barely compresses. As an image request a
 * cover is cached, revalidated with an ETag, and fetched only when on screen.
 */
export const getBookCover: RequestHandler<{ id: string; index?: string }> = async (
    req,
    res,
    next
) => {
    try {
        // Express infers a path parameter as a string; the schema has already
        // coerced and checked this one, so `Number` here is a formality that
        // keeps the declared type honest.
        const index = Number(req.params.index ?? 0);

        const book = await AddBook.findById(req.params.id).select('images').lean();
        const image = book?.images?.[index];
        if (!image) {
            res.status(404).json({ message: 'Cover not found' });
            return;
        }

        if (!serveStoredImage(req, res, image)) {
            res.status(404).json({ message: 'Cover not found' });
        }
    } catch (error) {
        next(error);
    }
};

// Get book details with related books
export const getBookById: RequestHandler = async (req, res) => {
    try {
        const book = await AddBook.findById(req.params.id);
        if (!book) {
            res.status(404).json({ message: 'Book not found' });
            return;
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
        const bookResponse = withCoverUrls({
            ...book.toObject(),
            relatedBooks: relatedBooks.map((related) => withCoverUrls(related.toObject())),
        });

        res.status(200).json(bookResponse);
    } catch (error) {
        log.error({ err: error }, 'Error fetching book');
        res.status(500).json({ message: 'Error fetching book details' });
    }
};

/**
 * One page of every listing, for the administrator's table.
 *
 * Paged and searched by the API, so a search covers the whole catalogue, and
 * only the sellers on the page are looked up.
 *
 * Separate from the shopper's catalogue because it asks a different question:
 * "who put this here" is an administrator's concern, and a search matching a
 * seller's e-mail address is not something a shop's search box should do.
 */
export const adminBookList: RequestHandler = async (req, res) => {
  const { search, page, pageSize, bookType, stock, deals, sort } = validatedQuery<AdminBookQuery>(req);

  const pattern = search ? contains(search) : null;
  const filter: Record<string, unknown> = {
    ...(pattern ? { $or: [{ title: pattern }, { author: pattern }, { sellerEmail: pattern }] } : {}),
    ...(bookType ? { bookType } : {}),
    // Low: one or two copies left, the ones about to run out.
    ...(stock === 'in' ? { stock: { $gt: 0 } } : stock === 'out' ? { stock: 0 } : stock === 'low' ? { stock: { $gt: 0, $lte: 2 } } : {}),
    ...(deals === 'yes' ? { discountPercent: { $gt: 0 } } : deals === 'no' ? { discountPercent: { $in: [0, null] } } : {}),
  };
  const order = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    priceHigh: { salePrice: -1 },
    priceLow: { salePrice: 1 },
    stockLow: { stock: 1 },
    titleAZ: { title: 1 },
  }[sort] as Record<string, 1 | -1>;

  try {
    const [items, total] = await Promise.all([
      AddBook.find(filter, LIST_IMAGE_PROJECTION)
        .sort({ ...order, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      AddBook.countDocuments(filter),
    ]);

    // Only the sellers on this page, rather than every account there is.
    const emails = [...new Set(items.map((book) => book.sellerEmail))];
    const sellers = await User.find({ email: { $in: emails } }, { email: 1, username: 1 }).lean();
    const names = new Map(sellers.map((seller) => [seller.email, seller.username]));

    res.status(200).json({
      items: items.map((book) => ({
        ...withCoverUrls(book),
        // The seller's handle, or their e-mail for an account without one.
        sellerName: names.get(book.sellerEmail) || book.sellerEmail,
      })),
      total,
      page,
      pageSize,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (error) {
    log.error({ err: error }, 'Error listing books for an administrator');
    res.status(500).json({ message: 'Error listing books' });
  }
};
