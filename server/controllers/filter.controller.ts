import type { Request, RequestHandler, Response } from 'express';

import AddBook from '../models/AddBook.model.js';
import type { FilterBody, SearchBody } from '../schemas/index.js';
import { errorMessage } from '../utils/error.js';
import { LIST_IMAGE_PROJECTION, withCoverUrls } from '../utils/projections.js';

// Whitelisted so a client cannot query arbitrary document paths (or inject a
// query operator object) through `filter_key`.
const FILTERABLE_FIELDS = new Set([
    'title',
    'author',
    'publisher',
    'country',
    'language',
    'isbn',
    'category',
    'bookType',
    'condition',
    'sellerEmail',
]);

const REGEX_SPECIAL_CHARS = new Set(['.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', ']', '/']);

// Escape regex metacharacters so a search for "C++" matches literally instead
// of throwing an "Invalid regular expression" error.
const escapeRegex = (value: string): string =>
    String(value)
        .split('')
        .map((char) => {
            if (char === String.fromCharCode(92)) return char + char;
            return REGEX_SPECIAL_CHARS.has(char) ? String.fromCharCode(92) + char : char;
        })
        .join('');

export const Booklist: RequestHandler = async (req, res) => {
    try {
        const booklist = await AddBook.find({}, LIST_IMAGE_PROJECTION).lean();
        res.status(200).json(booklist.map(withCoverUrls));
    } catch (error) {
        res.status(500).json({ message: errorMessage(error) });
    }
};

// The body types come from the schema the route validates against, so what a
// handler reads and what the middleware accepted are the same declaration.
export const Booklist_filter = async (
    req: Request<unknown, unknown, FilterBody>,
    res: Response
): Promise<void> => {
    const filter_key = req.body.filter_key;
    const filter_input = req.body.filter_input;

    if (!FILTERABLE_FIELDS.has(filter_key)) {
        res.status(400).json({ message: `Cannot filter on "${filter_key}"` });
        return;
    }

    try {
        const filteredBooks = await AddBook.find(
            { [filter_key]: filter_input },
            LIST_IMAGE_PROJECTION
        ).lean();
        res.status(200).json(filteredBooks.map(withCoverUrls));
    } catch (error) {
        res.status(500).json({ message: errorMessage(error) });
    }
};

export const Booklist_search = async (
    req: Request<unknown, unknown, SearchBody>,
    res: Response
): Promise<void> => {
    const search_input = req.body.search_input;

    try {
        const searchedBooks = await AddBook.find(
            { title: { $regex: escapeRegex(search_input), $options: 'i' } },
            LIST_IMAGE_PROJECTION
        ).lean();

        res.status(200).json(searchedBooks.map(withCoverUrls));
    } catch (error) {
        res.status(500).json({ message: errorMessage(error) });
    }
};
