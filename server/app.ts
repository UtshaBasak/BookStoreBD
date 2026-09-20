import path from 'path';
import { existsSync } from 'fs';

import express, { type Express } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';

import { config } from './config/env.js';
import { corsOptions } from './config/cors.js';
import { isApiPath, API_PREFIX } from './config/apiPaths.js';
import { CLIENT_DIST, UPLOADS_DIR } from './config/paths.js';
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
import uploadRouter from './routes/upload.route.js';
import userRouter from './routes/user.route.js';
import wishlistRouter from './routes/wishlist.route.js';

/**
 * Builds the Express application. Kept free of side effects (no listen, no DB
 * connection) so it can be imported by tests or a serverless adapter.
 */
export const createApp = (): Express => {
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
  app.use(`${API_PREFIX}/uploads`, express.static(UPLOADS_DIR));

  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
  });

  app.use(apiLimiter);

  app.use(`${API_PREFIX}/auth`, authLimiter, authRouter);
  app.use(`${API_PREFIX}/book`, bookRouter);
  app.use(`${API_PREFIX}/cart`, cartRouter);
  app.use(`${API_PREFIX}/chat`, writeLimiter, chatRouter);
  app.use(`${API_PREFIX}/filter`, filterRouter);
  app.use(`${API_PREFIX}/order`, orderRouter);
  app.use(`${API_PREFIX}/purchase`, purchaseRouter);
  app.use(`${API_PREFIX}/return`, writeLimiter, returnRouter);
  app.use(`${API_PREFIX}/upload`, writeLimiter, uploadRouter);
  app.use(`${API_PREFIX}/user`, writeLimiter, userRouter);
  app.use(`${API_PREFIX}/wishlist`, wishlistRouter);

  // ------------------------------------------------------------------------
  // Single-page app
  //
  // Serving the built client from the same origin as the API is what makes the
  // refresh cookie first-party: no CORS, no third-party cookie restrictions.
  // Registered after the routers, so an API path is never swallowed by the
  // fallback below.
  // ------------------------------------------------------------------------
  if (config.serveClient && existsSync(CLIENT_DIST)) {
    app.use(express.static(CLIENT_DIST));

    app.get(/.*/, (req, res, next) => {
      // A miss under an API prefix is a 404, not the app shell — otherwise a
      // typo'd endpoint would return HTML and a fetch would fail confusingly.
      if (isApiPath(req.path)) return next();
      return res.sendFile(path.join(CLIENT_DIST, 'index.html'));
    });
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
