import path from 'path';
import { existsSync } from 'fs';

import express, { type Express } from 'express';
import type { Logger } from 'pino';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

import { config } from './config/env.js';
import { createLogger } from './config/logger.js';
import { corsOptions } from './config/cors.js';
import { isApiPath, API_PREFIX } from './config/apiPaths.js';
import { robots, sitemap } from './controllers/seo.controller.js';
import auditRouter from './routes/audit.route.js';
import reviewRouter from './routes/review.route.js';
import { CLIENT_DIST, UPLOADS_DIR } from './config/paths.js';
import { securityHeaders } from './config/securityHeaders.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { sanitizeRequest } from './middleware/sanitizeRequest.js';
import { requestLogger } from './middleware/requestLogger.js';
import { crawlerLimiter, apiLimiter, authLimiter, writeLimiter } from './middleware/rateLimit.js';

import authRouter from './routes/auth.route.js';
import bookRouter from './routes/book.route.js';
import cartRouter from './routes/cart.route.js';
import chatRouter from './routes/chat.route.js';
import clientErrorRouter from './routes/clientError.route.js';
import filterRouter from './routes/filter.route.js';
import orderRouter from './routes/order.route.js';
import purchaseRouter from './routes/purchase.route.js';
import returnRouter from './routes/return.route.js';
import uploadRouter from './routes/upload.route.js';
import userRouter from './routes/user.route.js';
import wishlistRouter from './routes/wishlist.route.js';

const log = createLogger('app');

export interface CreateAppOptions {
  /**
   * Where the built client lives. Defaulted from the package root; a test
   * points it somewhere known so both branches below can be exercised without
   * depending on whether anyone has run a build.
   */
  clientDist?: string;
  /** Overridden in tests so the start-up warning can be asserted on. */
  logger?: Logger;
}

/**
 * Builds the Express application. Kept free of side effects (no listen, no DB
 * connection) so it can be imported by tests or a serverless adapter.
 */
export const createApp = ({
  clientDist = CLIENT_DIST,
  logger: appLog = log,
}: CreateAppOptions = {}): Express => {
  const app = express();

  // Behind Render's proxy, so the rate limiter keys on the real client IP
  // rather than on the proxy's.
  app.set('trust proxy', 1);

  // Nothing to gain from telling the world which framework this is.
  app.disable('x-powered-by');

  // First, so every downstream log line carries the request id and a failure
  // during body parsing is still recorded.
  app.use(requestLogger);

  // Before any route, so an error response carries the same protections as a
  // successful one.
  app.use(helmet(securityHeaders()));

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

  // Crawler endpoints. At the root because that is the only place a crawler
  // looks for them, and before the rate limiter because a search engine asking
  // for a sitemap is not the traffic that limiter exists to stop.
  app.get('/robots.txt', crawlerLimiter, robots);
  app.get('/sitemap.xml', crawlerLimiter, sitemap);

  app.use(apiLimiter);

  app.use(`${API_PREFIX}/auth`, authLimiter, authRouter);
  app.use(`${API_PREFIX}/audit`, auditRouter);
  app.use(`${API_PREFIX}/book`, bookRouter);
  app.use(`${API_PREFIX}/cart`, cartRouter);
  app.use(`${API_PREFIX}/chat`, writeLimiter, chatRouter);
  app.use(`${API_PREFIX}/client-error`, clientErrorRouter);
  app.use(`${API_PREFIX}/filter`, filterRouter);
  app.use(`${API_PREFIX}/order`, orderRouter);
  app.use(`${API_PREFIX}/purchase`, purchaseRouter);
  app.use(`${API_PREFIX}/return`, writeLimiter, returnRouter);
  app.use(`${API_PREFIX}/review`, writeLimiter, reviewRouter);
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
  if (config.serveClient) {
    if (existsSync(clientDist)) {
      app.use(express.static(clientDist));

      app.get(/.*/, (req, res, next) => {
        // A miss under an API prefix is a 404, not the app shell — otherwise a
        // typo'd endpoint would return HTML and a fetch would fail confusingly.
        if (isApiPath(req.path)) return next();
        return res.sendFile(path.join(clientDist, 'index.html'));
      });
    } else {
      // Asked to serve the app with nothing to serve. Mounting it anyway would
      // answer every page with a 500 from sendFile, so the API carries on
      // serving only itself - but doing that *silently* is how this went
      // unnoticed in Docker the first time, so it is said out loud.
      appLog.warn(
        { clientDist },
        'SERVE_CLIENT is on but no client build was found; the API will not serve the app. ' +
          'Run `npm run build` in client/, or unset SERVE_CLIENT if something else serves it.'
      );
    }
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

export default createApp;
