import path from 'path';
import { existsSync } from 'fs';
import { fileURLToPath } from 'url';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { config } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { isApiPath } from './config/apiPaths.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { sanitizeRequest } from './middleware/sanitizeRequest.js';
import { requestLogger } from './middleware/requestLogger.js';
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

  // First, so every downstream log line carries the request id and a failure
  // during body parsing is still recorded.
  app.use(requestLogger);

  app.use(cors(corsOptions));
  // Book covers and chat attachments are sent as base64, so the default 100kb
  // body limit is far too small.
  app.use(express.json({ limit: '25mb' }));
  app.use(express.urlencoded({ extended: true, limit: '25mb' }));
  app.use(cookieParser());
  app.use(sanitizeRequest);

  // Book covers are stored on the document as base64, but the client still
  // falls back to `/uploads/<filename>` for older records that hold a bare
  // filename, so the directory stays served.
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  app.use('/uploads', express.static(path.join(currentDir, 'uploads')));

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

  // ------------------------------------------------------------------------
  // Single-page app
  //
  // Serving the built client from the same origin as the API is what makes the
  // refresh cookie first-party: no CORS, no third-party cookie restrictions.
  // Registered after the routers, so an API path is never swallowed by the
  // fallback below.
  // ------------------------------------------------------------------------
  const clientDist = path.resolve(currentDir, '..', 'client', 'dist');

  if (config.serveClient && existsSync(clientDist)) {
    app.use(express.static(clientDist));

    app.get(/.*/, (req, res, next) => {
      // A miss under an API prefix is a 404, not the app shell — otherwise a
      // typo'd endpoint would return HTML and a fetch would fail confusingly.
      if (isApiPath(req.path)) return next();
      return res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
