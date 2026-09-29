/**
 * Link previews for a shared book.
 *
 * Facebook, WhatsApp, Messenger, X and Slack build a link's preview card from
 * the HTML the server sends, and do not run JavaScript. The app sets each
 * book's title and picture in the browser, which Google sees, but a scraper
 * only ever saw `index.html`'s site-wide tags - so every shared book looked
 * like the homepage. For `/book/:id` the server now writes that book's title,
 * price and cover into the page before sending it. People get the same page
 * as before; only the head differs.
 */
import { readFileSync } from 'fs';

/** The book fields a preview is made from. */
export interface PreviewBook {
  _id: unknown;
  title: string;
  author: string;
  price: number;
  bookType: 'new' | 'old';
  stock?: number;
  images?: string[];
}

const SITE = 'BookStoreBD';

/** A book's own page: `/book/` and a 24-character ObjectId. */
export const BOOK_PAGE = /^\/book\/([0-9a-f]{24})\/?$/i;

/** Attribute values are the only place book text lands, so this is enough. */
export const escapeAttribute = (value: string): string =>
  value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/**
 * What the preview says. Worded as the book page words it (`BookView.tsx`), so
 * the card and the page it opens agree.
 */
export const describeBook = (book: PreviewBook): string =>
  `${book.title} by ${book.author}. ${book.bookType === 'old' ? 'Second-hand' : 'New'}, ${book.price} Tk${
    (book.stock ?? 0) > 0 ? ', in stock' : ', out of stock'
  }.`;

const CLOUDINARY_UPLOAD = '/image/upload/';

/**
 * The picture for the card, as an absolute URL, and its size when known.
 *
 * A Cloudinary cover is asked for as a 1200x630 JPEG with the cover centred on
 * the shop's violet tint: previews are landscape, and a portrait cover sent as
 * it is gets cropped to a strip across its middle. JPEG rather than `f_auto`,
 * as not every scraper takes WebP. A cover kept on the record as base64 is
 * served by the API's cover endpoint; anything else falls back to the shop's
 * own card.
 */
export const previewImage = (
  book: PreviewBook,
  origin: string
): { url: string; width?: number; height?: number } => {
  const cover = book.images?.[0];

  if (typeof cover === 'string') {
    try {
      const url = new URL(cover);
      const at = url.pathname.indexOf(CLOUDINARY_UPLOAD);
      if (url.protocol === 'https:' && url.hostname === 'res.cloudinary.com' && at !== -1) {
        const cut = at + CLOUDINARY_UPLOAD.length;
        url.pathname = `${url.pathname.slice(0, cut)}c_pad,w_1200,h_630,b_rgb:f3efff,f_jpg,q_auto/${url.pathname.slice(cut)}`;
        return { url: url.href, width: 1200, height: 630 };
      }
    } catch {
      // Not an absolute URL: a data URI, handled below.
    }
    if (cover.startsWith('data:image/')) {
      return { url: `${origin}/api/book/${String(book._id)}/cover` };
    }
  }

  return { url: `${origin}/og-image.jpg`, width: 1200, height: 630 };
};

/** The tags a preview is read from, which the book's own replace. */
const REPLACED = [
  'description',
  'og:type',
  'og:title',
  'og:description',
  'og:url',
  'og:image',
  'og:image:width',
  'og:image:height',
  'og:image:alt',
  'twitter:card',
  'twitter:title',
  'twitter:description',
  'twitter:image',
];

const tag = (attribute: 'name' | 'property', key: string, content: string): string =>
  `<meta ${attribute}="${key}" content="${escapeAttribute(content)}" />`;

/**
 * `index.html` with the book's title, description, address and cover in its
 * head. The site-wide versions of those tags are taken out first, so a scraper
 * never sees two titles and picks the wrong one.
 */
export const renderBookPage = (template: string, book: PreviewBook, origin: string): string => {
  const title = `${book.title} · ${SITE}`;
  const description = describeBook(book);
  const url = `${origin}/book/${String(book._id)}`;
  const image = previewImage(book, origin);

  let html = template.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeAttribute(title)}</title>`);
  for (const key of REPLACED) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    html = html.replace(new RegExp(`\\s*<meta\\b[^>]*\\b(?:name|property)="${escaped}"[^>]*>`, 'gi'), '');
  }

  const tags = [
    tag('name', 'description', description),
    tag('property', 'og:type', 'product'),
    tag('property', 'og:title', title),
    tag('property', 'og:description', description),
    tag('property', 'og:url', url),
    tag('property', 'og:image', image.url),
    ...(image.width && image.height
      ? [tag('property', 'og:image:width', String(image.width)), tag('property', 'og:image:height', String(image.height))]
      : []),
    tag('property', 'og:image:alt', `Cover of ${book.title}`),
    tag('property', 'product:price:amount', String(book.price)),
    tag('property', 'product:price:currency', 'BDT'),
    tag('name', 'twitter:card', 'summary_large_image'),
    tag('name', 'twitter:title', title),
    tag('name', 'twitter:description', description),
    tag('name', 'twitter:image', image.url),
    `<link rel="canonical" href="${escapeAttribute(url)}" />`,
  ];

  return html.replace(/<\/head>/i, `    ${tags.join('\n    ')}\n  </head>`);
};

/**
 * `index.html` for every other page, with its picture's address made absolute.
 *
 * The build cannot know the domain, so the file says `/og-image.jpg`, and not
 * every scraper resolves that against the page: Facebook's documentation asks
 * for an absolute URL, and opengraph.xyz showed a broken image. The server
 * does know the domain, so it writes it in. Left as it is when the request's
 * host is not one a URL can be built from.
 */
export const renderSitePage = (template: string, origin: string): string =>
  origin ? template.replace(/(<meta\b[^>]*content=")(\/[^/"][^"]*\.(?:jpe?g|png|webp))"/gi, `$1${origin}$2"`) : template;

/**
 * `index.html`, read once. It only changes with a deploy, which restarts the
 * process, so there is no reason to read it from disk on every book view.
 */
export const templateLoader = (file: string): (() => string) => {
  let cached: string | null = null;
  return () => (cached ??= readFileSync(file, 'utf8'));
};
