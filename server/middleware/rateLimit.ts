import rateLimit from 'express-rate-limit';

/**
 * Limits are keyed by client IP. Users on a shared campus or office NAT all
 * present the same public IP, so the ceilings below are deliberately generous:
 * a throttle that locks out a whole classroom is worse than no throttle. They
 * are still low enough to make brute forcing and scraping impractical.
 *
 * The client does no polling — live updates arrive over Socket.IO — so normal
 * browsing stays far below these numbers.
 */
const common = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { message: 'Too many requests, please try again later.' },
} as const;

/** Broad ceiling applied to every route. */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 2000,
  ...common,
});

/**
 * Sign-in, sign-up, OTP and password reset. A 6-digit OTP has 10^6
 * possibilities, so 50 attempts per 15 minutes leaves brute forcing hopeless
 * while comfortably covering a shared network.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  ...common,
});

/**
 * `/robots.txt` and `/sitemap.xml`.
 *
 * These sit before the general limiter because a search engine asking for a
 * sitemap is not the traffic that limiter exists to stop - but the sitemap
 * reads the catalogue, so leaving them with no ceiling at all makes an
 * unauthenticated database query anyone can repeat as fast as they like.
 * Generous enough that no crawler will ever meet it: Googlebot fetches a
 * sitemap once in a while, not 120 times an hour.
 */
export const crawlerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 120,
  ...common,
});

/**
 * Reports from browsers.
 *
 * Unauthenticated, and one log line per request, so it is an easy way to fill
 * a log. A broken page produces a handful of reports, not hundreds - the
 * client de-duplicates and caps its own too.
 */
export const clientErrorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
  ...common,
});

/** Routes that accept uploads or write chat, profile and return data. */
export const writeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  ...common,
});
