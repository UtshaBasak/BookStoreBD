import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';

import Cart from '../models/Cart.model.js';
import User from '../models/user.model.js';
import AddBook, { type LeanBook } from '../models/AddBook.model.js';
import { actingUser } from '../middleware/auth.js';
import { errorMessage } from '../utils/error.js';
import { toListBook, withCoverUrls } from '../utils/projections.js';

/** A book in a cart: the book, how many copies, and whether that had to change. */
type CartBook = LeanBook & { cartQuantity: number; cartAdjusted: boolean };

/**
 * The books in a cart, with how many of each, in the trimmed shape a list
 * view needs.
 *
 * Stock can move after something goes in a cart - another buyer takes the
 * last copies, or the seller sells out. A quantity above what is left is
 * brought down to it here, and marked, so the page can say so rather than
 * checkout failing; a book that has sold out stays in the cart, marked by its
 * stock, so the buyer sees what happened to it instead of it vanishing.
 */
const booksInCart = async (userId: Types.ObjectId): Promise<CartBook[]> => {
  const entries = await Cart.find({ user: userId })
    .sort({ createdAt: -1, _id: -1 })
    .populate<{ book: LeanBook | null }>('book')
    .lean();

  const books: CartBook[] = [];
  for (const entry of entries) {
    const book = entry.book;
    if (!book) continue;
    const wanted = Number(entry.quantity) || 1;
    const stock = Number(book.stock) || 0;
    const quantity = stock > 0 ? Math.min(wanted, stock) : wanted;
    if (quantity !== wanted) await Cart.updateOne({ _id: entry._id }, { $set: { quantity } });
    books.push({ ...withCoverUrls(toListBook(book)), cartQuantity: quantity, cartAdjusted: quantity !== wanted });
  }
  return books;
};

const cartOwner = async (email: string) => User.findOne({ email }, { _id: 1 }).lean();

/** Why this many copies of this book cannot go in a cart, or null when they can. */
const quantityProblem = (book: { stock?: number | null } | null, quantity: number): { status: number; message: string } | null => {
  if (!book) return { status: 404, message: 'Book not found' };
  const stock = Number(book.stock) || 0;
  if (stock === 0) return { status: 409, message: 'This book has sold out.' };
  if (quantity > stock) return { status: 409, message: `Only ${stock} ${stock === 1 ? 'copy is' : 'copies are'} left.` };
  return null;
};

export const Cart_get: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const user = await cartOwner(email);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(await booksInCart(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

/**
 * Puts a book in the cart. With a quantity, that many copies - replacing what
 * was there, which is what choosing a number on the book page means; without
 * one, a single copy, or no change if it is in already.
 */
export const Cart_add: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const bookId = String(req.params.id);
    const asked = (req.body as { quantity?: number } | undefined)?.quantity;
    const user = await cartOwner(email);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    const book = await AddBook.findById(bookId, { stock: 1 }).lean();
    const existing = await Cart.findOne({ user: user._id, book: bookId }, { quantity: 1 }).lean();
    const quantity = asked ?? existing?.quantity ?? 1;
    const problem = quantityProblem(book, quantity);
    if (problem) {
      res.status(problem.status).json({ message: problem.message, available: Number(book?.stock) || 0 });
      return;
    }

    await Cart.findOneAndUpdate(
      { user: user._id, book: bookId },
      { $set: { quantity }, $setOnInsert: { user: user._id, book: bookId } },
      { upsert: true }
    );

    res.status(200).json(await booksInCart(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

/** Changes how many copies of a book already in the cart. */
export const Cart_setQuantity: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const bookId = String(req.params.id);
    const { quantity } = req.body as { quantity: number };
    const user = await cartOwner(email);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }
    if (!(await Cart.exists({ user: user._id, book: bookId }))) {
      res.status(404).json({ message: 'That book is not in your cart.' });
      return;
    }

    const book = await AddBook.findById(bookId, { stock: 1 }).lean();
    const problem = quantityProblem(book, quantity);
    if (problem) {
      res.status(problem.status).json({ message: problem.message, available: Number(book?.stock) || 0 });
      return;
    }

    await Cart.updateOne({ user: user._id, book: bookId }, { $set: { quantity } });
    res.status(200).json(await booksInCart(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const Cart_remove: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const bookId = req.params.id;
    const user = await cartOwner(email);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    await Cart.deleteOne({ user: user._id, book: bookId });

    res.status(200).json(await booksInCart(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const Cart_clear: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const user = await cartOwner(email);
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    await Cart.deleteMany({ user: user._id });
    res.status(200).json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};
