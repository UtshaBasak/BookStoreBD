import type { HelmetOptions } from 'helmet';

import { config } from './env.js';

/**
 * The response headers a browser uses to constrain what a page may do.
 *
 * Absent entirely until now: the site could be framed by any origin, responses
 * could be MIME-sniffed, full URLs leaked in referrers, and there was no second
 * line of defence if a script injection ever landed.
 */

/**
 * Hosts the client legitimately loads images from.
 *
 * Enumerated rather than blanket-allowing `https:`, so adding a new one is a
 * deliberate edit. `data:` covers the base64 covers stored on a document when
 * image hosting is off; `blob:` covers the preview of a file the user has just
 * picked, which `safeObjectUrl` produces.
 */
const IMAGE_SOURCES = [
  "'self'",
  'data:',
  'blob:',
  'https://res.cloudinary.com',
  'https://ui-avatars.com',
  'https://images.unsplash.com',
  'https://a-static.besthdwallpaper.com',
];

/**
 * `VITE_API_URL` is empty for the same-origin deployments, where `'self'`
 * already covers the API and the Socket.IO upgrade. A cross-origin deployment
 * has to be named explicitly or the browser blocks every request.
 */
const connectSources = (): string[] => {
  const extra = (process.env.CLIENT_API_ORIGIN ?? '').trim();
  return extra ? ["'self'", extra] : ["'self'"];
};

export const securityHeaders = (): HelmetOptions => ({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      // No inline scripts and no eval anywhere in the bundle, so this needs no
      // escape hatch - which is the directive that actually stops an injection.
      scriptSrc: ["'self'"],
      // React sets styles through the CSSOM, which CSP does not govern, but
      // libraries that inject a <style> element at runtime do need this.
      // Style injection is a far weaker vector than script injection.
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: IMAGE_SOURCES,
      connectSrc: connectSources(),
      fontSrc: ["'self'", 'data:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // Clickjacking: nothing may frame this site.
      frameAncestors: ["'none'"],
      workerSrc: ["'self'", 'blob:'],
      // Only meaningful where TLS terminates in front, and harmless locally.
      ...(config.env === 'production' ? { upgradeInsecureRequests: [] } : {}),
    },
  },

  // Sent only over HTTPS, so it is inert on a local HTTP stack. Two years,
  // subdomains included, which is what preload lists expect.
  strictTransportSecurity: {
    maxAge: 63072000,
    includeSubDomains: true,
  },

  // Matches the nginx configuration in front of the client, rather than
  // helmet's SAMEORIGIN default. Nothing here is meant to be framed.
  xFrameOptions: { action: 'deny' },

  // Send the origin to other sites but the full URL to our own: an order
  // tracking URL should not travel in a Referer header to a third party.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },

  // The app is same-origin; nothing should be embedding its responses.
  crossOriginResourcePolicy: { policy: 'same-origin' },

  // COEP would require every cross-origin image to send CORP, which the
  // avatar and cover hosts do not. Off deliberately rather than by oversight.
  crossOriginEmbedderPolicy: false,
});

export default securityHeaders;
