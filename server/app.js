import express from 'express';
import cors from 'cors';

import { corsOptions } from './config/cors.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { sanitizeRequest } from './middleware/sanitizeRequest.js';
import { apiLimiter, authLimiter, writeLimiter } from './middleware/rateLimit.js';

import authRouter from './routes/auth.route.js';
import bookRouter from './routes/book.route.js';
import cartRouter from './routes/cart.route.js';
import chatRouter from './routes/chat.route.js';
import filterRouter from './routes/filter.route.js';
import orderRouter from './routes/order.route.js';
import purchaseRouter from './routes/purchase.route.js';
import returnRouter from './routes/return.route.js';
import userRouter from './routes/user.route.js';
import wishlistRouter from './routes/wishlist.route.js';

/**
 * Builds the Express application. Kept free of side effects (no listen, no DB
 * connection) so it can be imported by tests or a serverless adapter.
 */
export const createApp = () => {
  const app = express();

  // Behind Render's proxy, so the rate limiter keys on the real client IP
  // rather than on the proxy's.
  app.set('trust proxy', 1);

  app.use(cors(corsOptions));
  // Book covers and chat attachments are sent as base64, so the default 100kb
  // body limit is far too small.
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(sanitizeRequest);

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(apiLimiter);

  app.use('/auth', authLimiter, authRouter);
  app.use('/book', bookRouter);
  app.use('/cart', cartRouter);
  app.use('/chat', writeLimiter, chatRouter);
  app.use('/filter', filterRouter);
  app.use('/order', orderRouter);
  app.use('/purchase', purchaseRouter);
  app.use('/return', writeLimiter, returnRouter);
  app.use('/user', writeLimiter, userRouter);
  app.use('/wishlist', wishlistRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
