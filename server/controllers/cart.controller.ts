import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';

import Cart from '../models/Cart.model.js';
import User from '../models/user.model.js';
import type { LeanBook } from '../models/AddBook.model.js';
import { actingUser } from '../middleware/auth.js';
import { errorMessage } from '../utils/error.js';
import { toListBook } from '../utils/projections.js';

/**
 * The books in a cart, in the trimmed shape a list view needs.
 *
 * `populate` cannot be typed from the schema alone - the field holds an
 * ObjectId until it is populated - so the populated shape is stated here.
 */
const booksInCart = async (
  userId: Types.ObjectId,
  inStockOnly = false
): Promise<LeanBook[]> => {
  const entries = await Cart.find({ user: userId })
    .populate<{ book: LeanBook | null }>('book')
    .lean();

  return entries
    .map((entry) => entry.book)
    // Remove nulls, and books that have since gone out of stock.
    .filter((book): book is LeanBook => book != null && (!inStockOnly || book.stock > 0))
    .map(toListBook);
};

export const Cart_get: RequestHandler = async (req, res) => {
  try {
    // Identity comes from the verified token, never from the request.
    const { email } = actingUser(req);
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(await booksInCart(user._id, true));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const Cart_add: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const bookId = req.params.id;
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    await Cart.findOneAndUpdate(
      { user: user._id, book: bookId },
      { user: user._id, book: bookId },
      { upsert: true, returnDocument: 'after' }
    );

    res.status(200).json(await booksInCart(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const Cart_remove: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const bookId = req.params.id;
    const user = await User.findOne({ email });
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
    const user = await User.findOne({ email });
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
