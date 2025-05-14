import AddBook from '../models/AddBook.model.js';
import Order from '../models/Order.model.js';
import Purchase from '../models/Purchase.model.js';

// Generate a unique 16-character order number (uppercase letters and numbers)
async function generateUniqueOrderNumber() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let orderNumber;
  let exists = true;
  while (exists) {
    orderNumber = '';
    for (let i = 0; i < 16; i++) {
      orderNumber += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check if this orderNumber already exists
    exists = await Order.exists({ orderNumber });
  }
  return orderNumber;
}

export const decreaseStock = async (req, res) => {
  try {
    const { items, email, shippingCharge, discount, promo, promoApplied } = req.body;
    if (!Array.isArray(items)) return res.status(400).json({ message: 'Invalid items' });

    // Generate unique order number
    const orderNumber = await generateUniqueOrderNumber();

    // Save order(s)
    for (const item of items) {
      const { bookId, quantity } = item;
      if (!bookId || !quantity || quantity < 1) continue;
      const book = await AddBook.findById(bookId);
      if (!book) continue;
      await Order.create({
        orderNumber, // save the same orderNumber for all books in this order
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
        // --- New fields for full order info ---
        paymentMethod: req.body.paymentMethod || '',
        contactName: req.body.contactName || '',
        contactPhone: req.body.contactPhone || '',
        deliveryDivision: req.body.deliveryDivision || '',
        deliveryDistrict: req.body.deliveryDistrict || '',
        deliveryAddress: req.body.deliveryAddress || '',
        // ---
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
    res.status(200).json({ message: 'Stock updated & order saved', orderNumber });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all orders for a buyer
export const getOrdersByBuyer = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ message: 'Email required' });
    const orders = await Order.find({ buyerEmail: email }).sort({ createdAt: -1 }).lean();
    // Group by orderNumber
    const grouped = {};
    orders.forEach(order => {
      const key = order.orderNumber || order._id;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(order);
    });
    // For each group, add order-level fields to each book
    const result = [];
    Object.values(grouped).forEach(orderBooks => {
      // Get the first book for order-level fields
      const orderLevel = orderBooks[0];
      const booksTotal = orderBooks.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
      const shippingCost = orderLevel.shippingCharge || 0;
      const discount = orderLevel.discount || 0;
      const totalCost = booksTotal + Number(shippingCost) - Number(discount);
      orderBooks.forEach(book => {
        result.push({
          ...book,
          booksTotal,
          shippingCost,
          discount,
          totalCost,
        });
      });
    });
    res.status(200).json(result);
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

// Get order by orderNumber
export const getOrderByOrderNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    if (!orderNumber) return res.status(400).json({ message: 'Order number required' });
    const orders = await Order.find({ orderNumber }).lean();
    if (!orders || orders.length === 0) return res.status(404).json({ message: 'Order not found' });
    // Group and summarize as in getOrdersByBuyer
    const booksTotal = orders.reduce((sum, ob) => sum + (Number(ob.price) * Number(ob.quantity)), 0);
    const shippingCost = orders[0].shippingCharge || 0;
    const discount = orders[0].discount || 0;
    const totalCost = booksTotal + Number(shippingCost) - Number(discount);
    res.status(200).json({
      orderNumber: orders[0].orderNumber,
      status: orders[0].status || 'Order Confirmed',
      paymentMethod: orders[0].paymentMethod || '',
      contactName: orders[0].contactName || '',
      contactPhone: orders[0].contactPhone || '',
      deliveryDivision: orders[0].deliveryDivision || '',
      deliveryDistrict: orders[0].deliveryDistrict || '',
      deliveryAddress: orders[0].deliveryAddress || '',
      ...orders[0],
      books: orders,
      booksTotal,
      shippingCost,
      discount,
      totalCost
    });
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

// Update order status by orderNumber (for all books in the order)
export const updateOrderStatusByOrderNumber = async (req, res) => {
  try {
    const { orderNumber } = req.params;
    const { status } = req.body;
    const orders = await Order.updateMany({ orderNumber }, { status });
    if (!orders || orders.matchedCount === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    // Optionally, return the updated orders
    const updatedOrders = await Order.find({ orderNumber });
    res.status(200).json(updatedOrders);
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

export const createPurchase = async (req, res) => {
  const { bookId, userEmail, quantity } = req.body;

  try {
    const newPurchase = new Purchase({
      bookId,
      userEmail,
      quantity,
    });

    await newPurchase.save();
    res.status(201).json({ message: 'Purchase created successfully', purchase: newPurchase });
  } catch (error) {
    res.status(500).json({ message: error.message });
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
