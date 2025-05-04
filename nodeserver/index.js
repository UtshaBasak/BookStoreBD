import express from 'express';
import { MongoServerClosedError } from 'mongodb';
import cors from 'cors';
import dotenv from 'dotenv';
import bodyParser from 'body-parser';
dotenv.config();
import Bookdetails from './bookdetails.model.js';
import AddBook from './models/AddBook.model.js';
import Cart from './models/Cart.model.js';
import { Cart_clear } from './controllers/cart.controller.js';
 

// MongoDB connection
import mongoose from 'mongoose';

mongoose.connect(process.env.MONGO, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('MongoDB connected');
})
.catch((err) => {
  console.error('MongoDB connection error:', err);
});

// Configure CORS
const corsOptions = {
    origin: 'http://localhost:5173', // Allow requests from this origin
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allowed HTTP methods
    credentials: true, // Allow cookies if needed
};

const app = express();

// Serve static files from the uploads directory
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

import userRouter from './routes/user.route.js';
import authRouter from './routes/auth.route.js';
import bookRouter from './routes/book.route.js';
import filterRouter from './routes/filter.route.js';
import wishlistRouter from './routes/wishlist.route.js';
import cartRouter from './routes/cart.route.js';
import orderRouter from './routes/order.route.js';
import returnRoutes from './routes/return.route.js';
import purchaseRoutes from './routes/purchase.route.js';

app.use(bodyParser.json());

app.use(express.json());
app.use(cors(corsOptions));
app.use('/user', userRouter);
app.use('/auth', authRouter);
app.use('/book', bookRouter);
app.use('/filter', filterRouter);
app.use('/wishlist', wishlistRouter);
app.use('/cart', cartRouter);
app.use('/order', orderRouter);
app.use('/return', returnRoutes);
app.use('/purchase', purchaseRoutes);

// Update stock (non-negative integer only) - ensure stock out books are removed from all carts
app.put('/book/update-stock/:id', async (req, res) => {
  try {
    const { stock } = req.body;
    if (!Number.isInteger(stock) || stock < 0) {
      return res.status(400).json({ message: 'Stock must be a non-negative integer' });
    }
    const book = await AddBook.findByIdAndUpdate(
      req.params.id,
      { stock },
      { new: true }
    );
    if (!book) return res.status(404).json({ message: 'Book not found' });

    // If stock is now 0, remove this book from all carts
    if (book.stock === 0) {
      await Cart.deleteMany({ book: book._id });
    }

    res.status(200).json({ message: 'Stock updated', book });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Decrease stock after order confirmation
app.post('/order/decrease-stock', async (req, res) => {
  try {
    const { items, email } = req.body; // [{ bookId, quantity }], email of ordering user
    if (!Array.isArray(items)) return res.status(400).json({ message: 'Invalid items' });

    // 1. Decrease stock for each book
    const updates = [];
    const stockOutBookIds = [];
    for (const { bookId, quantity } of items) {
      const book = await AddBook.findById(bookId);
      if (!book) continue;
      const newStock = Math.max(0, (book.stock || 0) - (quantity || 1));
      book.stock = newStock;
      if (newStock === 0) stockOutBookIds.push(bookId);
      updates.push(book.save());
    }
    await Promise.all(updates);

    // 2. Remove stock-out books from all carts
    if (stockOutBookIds.length > 0) {
      await Cart.deleteMany({ book: { $in: stockOutBookIds } });
    }

    // 3. Clear the ordering user's cart
    if (email) {
      const user = await require('./models/user.model.js').default.findOne({ email });
      if (user) {
        await Cart.deleteMany({ user: user._id });
      }
    }

    res.status(200).json({ message: 'Stock updated and cart(s) cleaned' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/cart/clear', Cart_clear);

app.use((err,req,res,next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internet Server Error';
    return res.status(statusCode).json({
        success: false,
        statusCode,
        message,
    });
});

const port = 1015;
app.listen(port,()=> console.log(`Listening on port ${port}...`));
