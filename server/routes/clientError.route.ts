import express, { type Request, type Response } from 'express';

import { bestEffortAuth } from '../middleware/auth.js';
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
 * Reports land in the same structured log as everything else, with the request
 * id, and go to Sentry when a DSN is configured, so a page that breaks for a
 * visitor reaches the people who can fix it.
 *
 * By design this is not the Sentry browser SDK, which adds about 30 KB to the
 * bundle and another origin to the Content-Security-Policy. What it would add
 * - source-mapped stacks, breadcrumbs, alerting - remains an option, and this
 * endpoint does not stand in its way.
 *
 * Open to anyone, because a page breaks for signed-out visitors too, but
 * limited hard: an endpoint that writes a log line per request is an easy way
 * to fill a log.
 */
router.post(
  '/',
  clientErrorLimiter,
  bestEffortAuth,
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
