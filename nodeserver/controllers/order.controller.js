import AddBook from '../models/AddBook.model.js';

export const decreaseStock = async (req, res) => {
  try {
    const { items } = req.body; // [{ bookId, quantity }]
    if (!Array.isArray(items)) return res.status(400).json({ message: 'Invalid items' });

    for (const item of items) {
      const { bookId, quantity } = item;
      if (!bookId || !quantity || quantity < 1) continue;
      await AddBook.updateOne(
        { _id: bookId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } }
      );
    }
    res.status(200).json({ message: 'Stock updated' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
