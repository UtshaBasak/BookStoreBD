import type { Request } from 'express';

import { config } from './env.js';

/** A host header we are willing to build a public URL from. */
const SAFE_HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * The origin this deployment is reached at, for the absolute URLs a sitemap and
 * a `robots.txt` have to carry.
 *
 * Derived from the request rather than configured, so a fresh deployment is
 * correct on whatever domain it happens to get without anyone remembering to
 * set a variable. `PUBLIC_SITE_URL` overrides it, and should be set once the
 * canonical domain is known - it is the only way to be sure a sitemap served
 * from two hostnames advertises the same one.
 *
 * The Host header is supplied by the caller, so it is checked rather than
 * trusted: a crawler that asked for the sitemap on the real domain gets URLs on
 * the real domain, and a request carrying a nonsense host gets nothing usable.
 */
export const publicSiteUrl = (req: Request): string => {
  if (config.publicSiteUrl) return config.publicSiteUrl;

  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim();
  const protocol = forwardedProto || req.protocol || 'https';

  const forwardedHost = String(req.headers['x-forwarded-host'] ?? '').split(',')[0].trim();
  const host = forwardedHost || req.headers.host || '';

  if (!SAFE_HOST.test(host)) return '';
  return `${protocol}://${host}`;
};

export default publicSiteUrl;
