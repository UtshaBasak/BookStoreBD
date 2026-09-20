import Cart from '../models/Cart.model.js';
import User from '../models/user.model.js';
import { asTrimmedString } from '../utils/sanitize.js';

export const Cart_get = async (req, res) => {
  try {
    const email = asTrimmedString(req.query.email);
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const cartEntries = await Cart.find({ user: user._id }).populate('book');
    // Only return books that are not stock out
    const books = cartEntries
      .map(entry => entry.book)
      .filter(book => book && book.stock > 0); // Remove nulls and stock out books
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const Cart_add = async (req, res) => {
  try {
    const email = asTrimmedString(req.body.email);
    const bookId = asTrimmedString(req.params.id);
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Cart.findOneAndUpdate(
      { user: user._id, book: bookId },
      { user: user._id, book: bookId },
      { upsert: true, returnDocument: 'after' }
    );

    const cartEntries = await Cart.find({ user: user._id }).populate('book');
    const books = cartEntries
      .map(entry => entry.book)
      .filter(book => book); // Remove nulls
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const Cart_remove = async (req, res) => {
  try {
    const email = asTrimmedString(req.body.email);
    const bookId = asTrimmedString(req.params.id);
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Cart.deleteOne({ user: user._id, book: bookId });

    const cartEntries = await Cart.find({ user: user._id }).populate('book');
    const books = cartEntries
      .map(entry => entry.book)
      .filter(book => book); // Remove nulls
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const Cart_clear = async (req, res) => {
  try {
    const email = asTrimmedString(req.body.email);
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Cart.deleteMany({ user: user._id });
    res.status(200).json({ message: 'Cart cleared' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
