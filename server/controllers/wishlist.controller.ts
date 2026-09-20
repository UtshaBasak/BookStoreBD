import type { RequestHandler } from 'express';
import type { Types } from 'mongoose';

import Wishlist from '../models/Wishlist.model.js';
import User from '../models/user.model.js';
import type { LeanBook } from '../models/AddBook.model.js';
import { actingUser } from '../middleware/auth.js';
import { errorMessage } from '../utils/error.js';
import { toListBook } from '../utils/projections.js';

/** The books on a wishlist, trimmed to what a list view renders. */
const booksInWishlist = async (userId: Types.ObjectId): Promise<LeanBook[]> => {
  const entries = await Wishlist.find({ user: userId })
    .populate<{ book: LeanBook | null }>('book')
    .lean();

  return entries
    .map((entry) => entry.book)
    .filter((book): book is LeanBook => book != null) // Remove nulls
    .map(toListBook);
};

// Fetch wishlist for a specific user
export const Wishlist_get: RequestHandler = async (req, res) => {
  try {
    // Identity comes from the verified token, never from the request.
    const { email } = actingUser(req);
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    res.status(200).json(await booksInWishlist(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

// Add a book to user's wishlist
export const Wishlist_add: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const bookId = req.params.id;
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    // Prevent duplicate wishlist entry
    await Wishlist.findOneAndUpdate(
      { user: user._id, book: bookId },
      { user: user._id, book: bookId },
      { upsert: true, returnDocument: 'after' }
    );

    // Return updated wishlist
    res.status(200).json(await booksInWishlist(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

// Remove a book from user's wishlist
export const Wishlist_remove: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const bookId = req.params.id;
    const user = await User.findOne({ email });
    if (!user) {
      res.status(404).json({ message: 'User not found' });
      return;
    }

    await Wishlist.deleteOne({ user: user._id, book: bookId });

    // Return updated wishlist
    res.status(200).json(await booksInWishlist(user._id));
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};
