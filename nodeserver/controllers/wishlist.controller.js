import Wishlist from '../models/Wishlist.model.js';
import AddBook from '../models/AddBook.model.js';
import User from '../models/user.model.js';

// Fetch wishlist for a specific user
export const Wishlist_get = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const wishlistEntries = await Wishlist.find({ user: user._id }).populate('book');
    const books = wishlistEntries
      .map(entry => entry.book)
      .filter(book => book); // Remove nulls
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Add a book to user's wishlist
export const Wishlist_add = async (req, res) => {
  try {
    const { email } = req.body;
    const { id: bookId } = req.params;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Prevent duplicate wishlist entry
    await Wishlist.findOneAndUpdate(
      { user: user._id, book: bookId },
      { user: user._id, book: bookId },
      { upsert: true, new: true }
    );

    // Return updated wishlist
    const wishlistEntries = await Wishlist.find({ user: user._id }).populate('book');
    const books = wishlistEntries
      .map(entry => entry.book)
      .filter(book => book); // Remove nulls
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Remove a book from user's wishlist
export const Wishlist_remove = async (req, res) => {
  try {
    const { email } = req.body;
    const { id: bookId } = req.params;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Wishlist.deleteOne({ user: user._id, book: bookId });

    // Return updated wishlist
    const wishlistEntries = await Wishlist.find({ user: user._id }).populate('book');
    const books = wishlistEntries
      .map(entry => entry.book)
      .filter(book => book); // Remove nulls
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

