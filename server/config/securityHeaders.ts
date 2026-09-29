import type { RequestHandler } from 'express';
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
 * image hosting is off; `blob:` covers an image
 * fetched with a token and shown from memory (`AuthImage`: chat pictures,
 * return photos). The Unsplash and wallpaper hosts went with the photo
 * backdrops the redesign replaced.
 */
const IMAGE_SOURCES = [
  "'self'",
  'data:',
  'blob:',
  'https://res.cloudinary.com',
  'https://ui-avatars.com',
];

/**
 * `VITE_API_URL` is empty for the same-origin deployments, where `'self'`
 * already covers the API and the Socket.IO upgrade. A cross-origin deployment
 * has to be named explicitly or the browser blocks every request.
 */
/**
 * Where the page may send a request.
 *
 * `api.cloudinary.com` is here because the browser uploads a cover straight to
 * Cloudinary - the bytes never pass through this API, which is the whole point
 * of the signed upload. Without it the upload is blocked by the policy, and the
 * only sign is a console message, which is how a deployment turns image hosting
 * on and quietly cannot upload anything.
 *
 * Listed whether or not hosting is configured, so this policy and the one nginx
 * sends with the document stay identical. nginx cannot know what the API's
 * environment holds, and two policies that disagree are worse than one that
 * names a host it is not using.
 */
const CLOUDINARY_UPLOAD = 'https://api.cloudinary.com';

const connectSources = (): string[] => {
  const extra = (process.env.CLIENT_API_ORIGIN ?? '').trim();
  const sources = ["'self'", CLOUDINARY_UPLOAD];
  return extra ? [...sources, extra] : sources;
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

/**
 * The pictures meant to be shown on other sites: the shop's share card, its
 * icon, the placeholder cover and a book's cover. A link preview is drawn by
 * whoever shows it - a preview tool's page, a chat app's web client - and with
 * the site-wide same-origin policy above, the browser refused to draw them
 * there, so the card came up with a broken picture. Everything else keeps
 * same-origin.
 */
const SHAREABLE =
  /^\/(?:og-image\.jpg|favicon\.svg|book-placeholder\.svg)$|^\/api\/book\/[0-9a-f]{24}\/cover(?:\/\d+)?$/i;

export const shareableImages: RequestHandler = (req, res, next) => {
  if (SHAREABLE.test(req.path)) res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  next();
};

export default securityHeaders;
