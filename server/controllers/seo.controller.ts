import type { RequestHandler } from 'express';

import AddBook from '../models/AddBook.model.js';
import { publicSiteUrl } from '../config/siteUrl.js';
import { createLogger } from '../config/logger.js';
import { DELIVERY, RETURN_WINDOW_DAYS, SELLER_FEE_PERCENT } from '../config/commerce.js';

const log = createLogger('seo');

/**
 * Pages worth a crawler's time, and how often they are worth revisiting.
 *
 * These mirror the public routes in the client's `App.tsx`. A page that needs a
 * sign-in is not listed here and is refused in `robots.txt` below - an indexed
 * URL that answers with a sign-in form is a wasted result for everyone.
 */
const STATIC_PAGES: readonly { path: string; changefreq: string; priority: string }[] = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/filter', changefreq: 'daily', priority: '0.9' },
  { path: '/how-it-works', changefreq: 'monthly', priority: '0.6' },
  { path: '/wanted', changefreq: 'daily', priority: '0.6' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
  { path: '/contact', changefreq: 'monthly', priority: '0.5' },
  { path: '/returns', changefreq: 'yearly', priority: '0.3' },
  { path: '/privacy', changefreq: 'yearly', priority: '0.3' },
  { path: '/terms', changefreq: 'yearly', priority: '0.3' },
];

/**
 * Paths a crawler should not follow: they need an account, so they answer with
 * a sign-in form, and they are nobody's search result.
 */
const PRIVATE_PATHS: readonly string[] = [
  '/api/',
  '/admin',
  '/add-book',
  '/buyer-books',
  '/buyer/',
  '/cart',
  '/chat',
  '/description-form/',
  '/order-tracking/',
  '/payment',
  '/profile',
  '/seller-books',
  '/seller-orders',
  '/seller/',
  '/sign-in',
  '/sign-up',
  '/update-profile',
  '/wishlist',
];

/** A sitemap may hold 50,000 URLs; well under it, and one query either way. */
const MAX_BOOK_URLS = 5000;

/** XML has five characters that cannot appear raw in a document. */
const escapeXml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

export const robots: RequestHandler = (req, res) => {
  const origin = publicSiteUrl(req);

  const lines = [
    'User-agent: *',
    'Allow: /',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    '',
    // Omitted rather than guessed when the host is not one we can build a URL
    // from: a sitemap line pointing at the wrong origin is worse than none.
    ...(origin ? [`Sitemap: ${origin}/sitemap.xml`, ''] : []),
  ];

  res.type('text/plain').set('Cache-Control', 'public, max-age=3600').send(lines.join('\n'));
};

export const sitemap: RequestHandler = async (req, res, next) => {
  try {
    const origin = publicSiteUrl(req);
    if (!origin) {
      // Every URL in a sitemap has to be absolute, so there is nothing to serve.
      res.status(404).type('text/plain').send('Sitemap unavailable: unknown host');
      return;
    }

    // Only what a listing page shows. A book with no stock is still a real page
    // - the record stays and may be restocked - so it is listed, at a lower
    // priority than the catalogue itself.
    const books = await AddBook.find({}, { _id: 1, createdAt: 1 })
      .sort({ createdAt: -1 })
      .limit(MAX_BOOK_URLS)
      .lean();

    const urls = [
      ...STATIC_PAGES.map(
        ({ path, changefreq, priority }) => `  <url>
    <loc>${escapeXml(origin + path)}</loc>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`
      ),
      ...books.map((book) => {
        const lastmod = book.createdAt ? new Date(book.createdAt).toISOString().slice(0, 10) : '';
        return `  <url>
    <loc>${escapeXml(`${origin}/book/${String(book._id)}`)}</loc>${lastmod ? `
    <lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
      }),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join('\n')}
</urlset>
`;

    log.debug({ urls: urls.length }, 'Sitemap served');
    res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(xml);
  } catch (error) {
    next(error);
  }
};

/**
 * `/llms.txt`: what the shop is and where things are, in Markdown, for the AI
 * assistants that read it before a site's pages (https://llmstxt.org). Served
 * from here rather than as a file so the
 * links are absolute on whatever domain the request came in on, and the
 * figures come from the rules the API enforces.
 */
export const llmsTxt: RequestHandler = (req, res) => {
  const origin = publicSiteUrl(req);
  const link = (path: string): string => `${origin}${path}`;

  const text = `# BookStoreBD

> An online marketplace for new and second-hand books in Bangladesh. Anyone can list books for sale free of charge; buyers pay cash on delivery and have ${RETURN_WINDOW_DAYS} days from delivery to ask for a return.

- Delivery by courier: ${DELIVERY.insideDhaka} Tk inside Dhaka, ${DELIVERY.outsideDhaka} Tk elsewhere in Bangladesh.
- Payment: cash on delivery only.
- Sellers keep the book total less a ${SELLER_FEE_PERCENT}% fee, paid by bKash.
- Contact: support.utsha@gmail.com. Based in Dhaka, Bangladesh.

## Shop

- [All books](${link('/filter')}): the catalogue, searchable by title, author or ISBN and filterable by category, new or second-hand, price and rating
- [New books](${link('/filter?bookType=new')})
- [Second-hand books](${link('/filter?bookType=old')})
- [In stock](${link('/filter?inStock=1')})
- [Quick deals](${link('/filter?deals=1&sort=dealPercent')}): books their sellers have discounted, the biggest share off first
- [Wanted board](${link('/wanted')}): books readers are asking for that nobody has listed yet
- [Sitemap](${link('/sitemap.xml')}): every book's own page

## About and policies

- [How it works](${link('/how-it-works')}): buying and selling, step by step, and common questions
- [About](${link('/about')}): who runs the shop and how buying and selling work
- [Contact](${link('/contact')})
- [Returns and refunds](${link('/returns')})
- [Terms of service](${link('/terms')})
- [Privacy policy](${link('/privacy')})
`;

  res.type('text/markdown').set('Cache-Control', 'public, max-age=3600').send(text);
};
