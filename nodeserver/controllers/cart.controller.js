import Cart from '../models/Cart.model.js';
import AddBook from '../models/AddBook.model.js';
import User from '../models/user.model.js';

export const Cart_get = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const cartEntries = await Cart.find({ user: user._id }).populate('book');
    const books = cartEntries.map(entry => entry.book);
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const Cart_add = async (req, res) => {
  try {
    const { email } = req.body;
    const { id: bookId } = req.params;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Cart.findOneAndUpdate(
      { user: user._id, book: bookId },
      { user: user._id, book: bookId },
      { upsert: true, new: true }
    );

    const cartEntries = await Cart.find({ user: user._id }).populate('book');
    const books = cartEntries.map(entry => entry.book);
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const Cart_remove = async (req, res) => {
  try {
    const { email } = req.body;
    const { id: bookId } = req.params;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    await Cart.deleteOne({ user: user._id, book: bookId });

    const cartEntries = await Cart.find({ user: user._id }).populate('book');
    const books = cartEntries.map(entry => entry.book);
    res.status(200).json(books);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
