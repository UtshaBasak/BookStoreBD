import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';

export const decreaseStock = async (req, res) => {
  try {
    const { items, email } = req.body; // [{ bookId, quantity }], email = buyer
    if (!Array.isArray(items)) return res.status(400).json({ message: 'Invalid items' });

    // Save order(s)
    for (const item of items) {
      const { bookId, quantity } = item;
      if (!bookId || !quantity || quantity < 1) continue;
      const book = await AddBook.findById(bookId);
      if (!book) continue;
      await Order.create({
        buyerEmail: email,
        sellerEmail: book.sellerEmail,
        bookId: book._id,
        title: book.title,
        author: book.author,
        category: book.category,
        bookType: book.bookType,
        condition: book.condition,
        pages: book.pages,
        price: book.price,
        quantity,
        createdAt: new Date()
      });
      await AddBook.updateOne(
        { _id: bookId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } }
      );
    }
    res.status(200).json({ message: 'Stock updated & order saved' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all orders for a buyer
export const getOrdersByBuyer = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const orders = await Order.find({ buyerEmail: email }).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Add delete order by id
export const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    await Order.findByIdAndDelete(id);
    res.status(200).json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
