import { createHash } from 'crypto';

import type { RequestHandler } from 'express';

import AddBook from '../models/AddBook.model.js';
import User from '../models/user.model.js';
import type { AdminBookQuery } from '../schemas/index.js';
import { LIST_IMAGE_PROJECTION, withCoverUrls } from '../utils/projections.js';
import { validatedQuery } from '../middleware/validate.js';
import { contains } from '../utils/regex.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('book');

/** What a stored cover is allowed to be, whatever the record claims. */
const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);

const DATA_URI = /^data:([\w/+.-]+);base64,(.*)$/s;

/**
 * Serves one cover as an image.
 *
 * Covers are stored on the document as base64, so before this they travelled
 * inside every JSON response that mentioned a book - a catalogue of 66 listings
 * was 7.4 MB, and 5.7 MB of that survived gzip because base64 of a JPEG is
 * already-compressed data. A browser cannot cache an image that arrives inside
 * a JSON body, so every visit paid for all of them again.
 *
 * As an image request it is cached, revalidated with an ETag, and fetched only
 * for the covers actually on screen.
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

        // A cover hosted elsewhere is already an address; send the caller there.
        if (/^https?:\/\//.test(image)) {
            res.redirect(302, image);
            return;
        }

        const match = DATA_URI.exec(image);
        // The type is read from the record, and a record written before uploads
        // were type-checked could say anything. Only image types are served.
        if (!match || !IMAGE_TYPES.has(match[1])) {
            res.status(404).json({ message: 'Cover not found' });
            return;
        }

        const bytes = Buffer.from(match[2], 'base64');
        const etag = `"${createHash('sha1').update(bytes).digest('base64url')}"`;

        if (req.headers['if-none-match'] === etag) {
            res.status(304).end();
            return;
        }

        res.setHeader('ETag', etag);
        // A seller can replace a cover, so not immutable - but a day of cache
        // with revalidation after it costs one 304 rather than a re-download.
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.type(match[1]).send(bytes);
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
 * That table used to fetch the entire catalogue and then, to fill its "Owner"
 * column, the entire user list as well - two unbounded requests to draw
 * twenty-five rows, and a search that could only look at what had already been
 * downloaded. It is a query now, and the sellers resolved are the ones on the
 * page.
 *
 * Separate from the shopper's catalogue because it asks a different question:
 * "who put this here" is an administrator's concern, and a search matching a
 * seller's e-mail address is not something a shop's search box should do.
 */
export const adminBookList: RequestHandler = async (req, res) => {
  const { search, page, pageSize } = validatedQuery<AdminBookQuery>(req);

  const pattern = search ? contains(search) : null;
  const filter = pattern
    ? { $or: [{ title: pattern }, { author: pattern }, { sellerEmail: pattern }] }
    : {};

  try {
    const [items, total] = await Promise.all([
      AddBook.find(filter, LIST_IMAGE_PROJECTION)
        .sort({ createdAt: -1, _id: -1 })
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
        // The column showed the e-mail for everyone when this was read from a
        // field called `name`, which no account has ever had.
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
