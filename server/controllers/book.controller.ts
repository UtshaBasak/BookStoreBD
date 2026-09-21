import { createHash } from 'crypto';

import type { RequestHandler } from 'express';

import AddBook from '../models/AddBook.model.js';
import { LIST_IMAGE_PROJECTION, withCoverUrls } from '../utils/projections.js';
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
