import AddBook from '../models/AddBook.model.js';
import { LIST_IMAGE_PROJECTION } from '../utils/projections.js';

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
const escapeRegex = (value) =>
    String(value)
        .split('')
        .map((char) => {
            if (char === String.fromCharCode(92)) return char + char;
            return REGEX_SPECIAL_CHARS.has(char) ? String.fromCharCode(92) + char : char;
        })
        .join('');

export const Booklist = async (req, res) => {
    try {
        const booklist = await AddBook.find({}, LIST_IMAGE_PROJECTION);
        res.status(200).json(booklist);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const Booklist_filter = async (req, res) => {
    const filter_key = req.body.filter_key;
    const filter_input = req.body.filter_input;

    if (!FILTERABLE_FIELDS.has(filter_key)) {
        return res.status(400).json({ message: `Cannot filter on "${filter_key}"` });
    }

    try {
        const filteredBooks = await AddBook.find({ [filter_key]: filter_input }, LIST_IMAGE_PROJECTION);
        res.status(200).json(filteredBooks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

export const Booklist_search = async (req, res) => {
    const search_input = req.body.search_input;

    try {
        const searchedBooks = await AddBook.find(
            { title: { $regex: escapeRegex(search_input), $options: 'i' } },
            LIST_IMAGE_PROJECTION
        );

        res.status(200).json(searchedBooks);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};
