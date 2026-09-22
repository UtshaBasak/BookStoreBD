import express, { type Request, type Response } from 'express';

import { optionalAuth } from '../middleware/auth.js';
import { clientErrorLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { captureException } from '../config/sentry.js';
import { createLogger } from '../config/logger.js';
import { clientErrorSchemas, type ClientErrorBody } from '../schemas/index.js';

const log = createLogger('client-error');

const router = express.Router();

/**
 * What went wrong in somebody's browser.
 *
 * `reportError` used to write to the console in development and do nothing at
 * all in a build, so a page that broke for a real visitor broke silently: the
 * only person who ever saw it was the person it happened to, and they are not
 * the one who can fix it.
 *
 * Reports land in the same structured log as everything else, with the request
 * id, and go to Sentry when a DSN is configured. That is deliberately not the
 * Sentry browser SDK: it is about 30 KB on a site that has just spent a lot of
 * effort not sending 30 KB, it needs another origin in the Content-Security-
 * Policy, and it is inert until somebody signs up for an account. What it would
 * add - source-mapped stacks, breadcrumbs, alerting - is worth having later,
 * and this endpoint is not in the way of it.
 *
 * Open to anyone, because a page breaks for signed-out visitors too, but
 * limited hard: an endpoint that writes a log line per request is an easy way
 * to fill a log.
 */
router.post(
  '/',
  clientErrorLimiter,
  optionalAuth,
  validate(clientErrorSchemas.report),
  (req: Request<unknown, unknown, ClientErrorBody>, res: Response) => {
    const { context, message, stack, url, userAgent } = req.body;

    log.warn(
      {
        client: {
          context,
          message,
          stack,
          url,
          userAgent,
          // Who it happened to, when they were signed in. The logger redacts
          // tokens; an e-mail is what makes a report answerable.
          email: req.user?.email,
        },
      },
      'Client error'
    );

    // Only when a DSN is configured; a no-op otherwise.
    captureException(new Error(`${context}: ${message}`), { stack, url, userAgent });

    // 204: the browser has nothing to do with the answer, and a body would
    // only be another thing to go wrong while reporting that something did.
    res.status(204).end();
  }
);

export default router;
