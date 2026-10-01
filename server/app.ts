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
import { llmsTxt, robots, sitemap } from './controllers/seo.controller.js';
import { publicSiteUrl } from './config/siteUrl.js';
import AddBook from './models/AddBook.model.js';
import { BOOK_PAGE, renderBookPage, renderSitePage, templateLoader, type PreviewBook } from './utils/sharePreview.js';
import auditRouter from './routes/audit.route.js';
import reviewRouter from './routes/review.route.js';
import sellerReviewRouter from './routes/sellerReview.route.js';
import wantedRouter from './routes/wanted.route.js';
import { CLIENT_DIST, UPLOADS_DIR } from './config/paths.js';
import { TRUSTED_PROXIES } from './config/trustedProxies.js';
import { securityHeaders, shareableImages } from './config/securityHeaders.js';
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
import notificationRouter from './routes/notification.route.js';
import adminRouter from './routes/admin.route.js';

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
  /** Overrides SERVE_CLIENT, so a test can serve a bundle and use the database. */
  serveClient?: boolean;
}

/**
 * Builds the Express application. Kept free of side effects (no listen, no DB
 * connection) so it can be imported by tests or a serverless adapter.
 */
export const createApp = ({
  clientDist = CLIENT_DIST,
  logger: appLog = log,
  serveClient = config.serveClient,
}: CreateAppOptions = {}): Express => {
  const app = express();

  /*
   * Who the visitor is, for the rate limits and the log.
   *
   * Cloudflare's and Render's proxies are skipped in X-Forwarded-For, and the
   * visitor is the first address reading from the right that is neither. A
   * request crosses several hops, so trusting only one would make req.ip a
   * proxy and put every visitor behind it in a single rate-limit bucket. See
   * config/trustedProxies.ts.
   */
  app.set('trust proxy', TRUSTED_PROXIES);

  // Nothing to gain from telling the world which framework this is.
  app.disable('x-powered-by');

  // First, so every downstream log line carries the request id and a failure
  // during body parsing is still recorded.
  app.use(requestLogger);

  // Before any route, so an error response carries the same protections as a
  // successful one.
  app.use(helmet(securityHeaders()));
  app.use(shareableImages);

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

  // `commit` is the deployed revision (Render sets RENDER_GIT_COMMIT), so a
  // workflow can confirm when a push is live.
  const commit = (process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || '').slice(0, 40) || null;
  app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime(), commit });
  });

  // Crawler endpoints. At the root because that is the only place a crawler
  // looks for them, and before the rate limiter because a search engine asking
  // for a sitemap is not the traffic that limiter exists to stop.
  app.get('/robots.txt', crawlerLimiter, robots);
  app.get('/sitemap.xml', crawlerLimiter, sitemap);
  app.get('/llms.txt', crawlerLimiter, llmsTxt);

  app.use(apiLimiter);

  app.use(`${API_PREFIX}/auth`, authLimiter, authRouter);
  app.use(`${API_PREFIX}/admin`, writeLimiter, adminRouter);
  app.use(`${API_PREFIX}/audit`, auditRouter);
  app.use(`${API_PREFIX}/book`, bookRouter);
  app.use(`${API_PREFIX}/cart`, cartRouter);
  app.use(`${API_PREFIX}/chat`, writeLimiter, chatRouter);
  app.use(`${API_PREFIX}/client-error`, clientErrorRouter);
  app.use(`${API_PREFIX}/filter`, filterRouter);
  app.use(`${API_PREFIX}/notification`, notificationRouter);
  app.use(`${API_PREFIX}/order`, orderRouter);
  app.use(`${API_PREFIX}/purchase`, purchaseRouter);
  app.use(`${API_PREFIX}/return`, writeLimiter, returnRouter);
  app.use(`${API_PREFIX}/review`, writeLimiter, reviewRouter);
  app.use(`${API_PREFIX}/seller-review`, writeLimiter, sellerReviewRouter);
  app.use(`${API_PREFIX}/upload`, writeLimiter, uploadRouter);
  app.use(`${API_PREFIX}/user`, writeLimiter, userRouter);
  app.use(`${API_PREFIX}/wishlist`, wishlistRouter);
  app.use(`${API_PREFIX}/wanted`, writeLimiter, wantedRouter);

  // ------------------------------------------------------------------------
  // Single-page app
  //
  // Serving the built client from the same origin as the API is what makes the
  // refresh cookie first-party: no CORS, no third-party cookie restrictions.
  // Registered after the routers, so an API path is never swallowed by the
  // fallback below.
  // ------------------------------------------------------------------------
  if (serveClient) {
    if (existsSync(clientDist)) {
      // No index: '/' is answered below with the rest of the pages, so its head
      // gets the same treatment rather than being sent straight off the disk.
      app.use(
        express.static(clientDist, {
          index: false,
          // The build names everything under assets/ after its contents, so a
          // changed file is a new address and the old one can be cached for a
          // year rather than revalidated on every visit.
          setHeaders: (res, filePath) => {
            if (path.relative(clientDist, filePath).split(path.sep)[0] === 'assets') {
              res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
            }
          },
        })
      );

      // A shared book's page carries that book's title and cover in its head,
      // for the link previews that scrapers build without running the app. See
      // utils/sharePreview.ts. Anything going wrong here costs the preview,
      // never the page: the plain app shell is sent instead.
      const indexHtml = path.join(clientDist, 'index.html');
      const template = templateLoader(indexHtml);
      app.get(BOOK_PAGE, async (req, res, next) => {
        try {
          const id = BOOK_PAGE.exec(req.path)?.[1];
          const book = id
            ? await AddBook.findById(id)
                .select({ title: 1, author: 1, price: 1, salePrice: 1, discountPercent: 1, bookType: 1, stock: 1, images: { $slice: 1 } })
                .lean<PreviewBook>()
            : null;
          // No such book: the app shows its own "not found", and a 404 keeps
          // the address out of search results.
          if (!book) {
            return res.status(404).type('html').send(renderSitePage(template(), publicSiteUrl(req)));
          }
          res.set('Cache-Control', 'no-cache');
          return res.type('html').send(renderBookPage(template(), book, publicSiteUrl(req)));
        } catch (err) {
          appLog.warn({ err, path: req.path }, 'Could not build the link preview; sending the plain page');
          return next();
        }
      });

      app.get(/.*/, (req, res, next) => {
        // A miss under an API prefix is a 404, not the app shell — otherwise a
        // typo'd endpoint would return HTML and a fetch would fail confusingly.
        if (isApiPath(req.path)) return next();
        // Nor for a file that is not there. No page of the app has a dot in
        // its address or lives under /.well-known, so these are requests for
        // files - an old asset after a deploy, a manifest a tool is looking
        // for - and answering with the app's HTML would tell them it existed
        // and was malformed (Lighthouse, for one, parses it as a broken file).
        if (/\.[a-z0-9]+$/i.test(req.path) || req.path.startsWith('/.well-known/')) return next();
        res.set('Cache-Control', 'no-cache');
        return res.type('html').send(renderSitePage(template(), publicSiteUrl(req)));
      });
    } else {
      // Asked to serve the app with nothing to serve. Mounting it anyway would
      // answer every page with a 500 from sendFile, so the API carries on
      // serving only itself, and says so in the log so the gap is visible.
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
