import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';

export const decreaseStock = async (req, res) => {
  try {
    const { items, email, orderNumber, shippingCharge, discount, promo, promoApplied } = req.body;
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
        orderNumber, // save the same orderNumber for all books in this order
        shippingCharge: typeof shippingCharge === 'number' ? shippingCharge : 0,
        discount: typeof discount === 'number' ? discount : 0,
        promo: promo || '',
        promoApplied: !!promoApplied,
        status: 'Order Confirmed',
        createdAt: new Date(),
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

// Get all orders for a seller
export const getOrdersBySeller = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const orders = await Order.find({ sellerEmail: email }).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update order status
export const updateOrderStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(id, { status }, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.status(200).json(order);
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

// Get all orders for admin
export const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find({}).sort({ createdAt: -1 });
    res.status(200).json(orders);
  } catch (err) {
    // Log the error for debugging
    console.error('Error in getAllOrders:', err);
    res.status(500).json({ message: err.message || 'Internal Server Error' });
  }
};
