import { useEffect } from 'react';

import { site } from '../config/site.js';

/** The picture a shared link previews with, when a page has nothing better. */
const DEFAULT_IMAGE = '/banner.png';

export interface SeoOptions {
  /** The page's own title. The site name is appended. */
  title?: string;
  description?: string;
  /** Root-relative or absolute; made absolute before it is published. */
  image?: string;
  /** Open Graph type. `product` for a listing, `website` for everything else. */
  type?: 'website' | 'article' | 'product';
  /** Keep the page out of search results. True for anything behind a sign-in. */
  noIndex?: boolean;
  /**
   * schema.org data for this page, as a plain object. Rendered into a
   * `application/ld+json` block, which is what produces a rich result rather
   * than a plain blue link.
   */
  jsonLd?: Record<string, unknown> | null;
}

/** Finds a managed tag or creates it, so index.html's own tags are reused. */
const upsert = (selector: string, create: () => HTMLElement): HTMLElement => {
  const existing = document.head.querySelector<HTMLElement>(selector);
  if (existing) return existing;

  const element = create();
  element.setAttribute('data-seo', '');
  document.head.appendChild(element);
  return element;
};

const setMeta = (attribute: 'name' | 'property', key: string, content: string): void => {
  const element = upsert(`meta[${attribute}="${key}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute(attribute, key);
    return meta;
  });
  element.setAttribute('content', content);
};

const removeMeta = (attribute: 'name' | 'property', key: string): void => {
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.remove();
};

/**
 * A closing tag inside a JSON string ends the script block that contains it, so
 * a book called `</script>` would otherwise be an injection point. Escaping the
 * angle bracket keeps the JSON identical and the document intact.
 */
const safeJsonLd = (data: Record<string, unknown>): string =>
  JSON.stringify(data).replace(/</g, '\\u003c');

/**
 * Per-page metadata: title, description, canonical URL, Open Graph and Twitter
 * cards, and optional schema.org data.
 *
 * Written by hand rather than with a helmet library: this is a few dozen lines
 * against a dependency, and every route in the application is either a page
 * that wants all of it or a page behind a sign-in that wants `noIndex`.
 *
 * The tags are set in the browser, which Google renders. Facebook, WhatsApp and
 * the other link scrapers do not run JavaScript, so what they see is whatever
 * `index.html` ships with - which is why that file carries a full set of
 * site-level defaults. Per-book previews on those would need the HTML rendered
 * on the server.
 */
export const useSeo = ({
  title,
  description = site.tagline,
  image = DEFAULT_IMAGE,
  type = 'website',
  noIndex = false,
  jsonLd = null,
}: SeoOptions): void => {
  // Serialised out here so the effect depends on the content rather than on the
  // object's identity: a caller passing an object literal would otherwise
  // rebuild the script block on every single render.
  const jsonLdText = jsonLd ? safeJsonLd(jsonLd) : null;

  useEffect(() => {
    const fullTitle = title ? `${title} · ${site.name}` : `${site.name} — ${site.seoTagline}`;
    const url = `${window.location.origin}${window.location.pathname}`;
    const absoluteImage = new URL(image, window.location.origin).href;

    document.title = fullTitle;

    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', type);
    setMeta('property', 'og:url', url);
    setMeta('property', 'og:image', absoluteImage);
    setMeta('property', 'og:site_name', site.name);
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', fullTitle);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', absoluteImage);

    // The canonical URL is what stops a page indexed at two addresses - with a
    // query string, with a trailing slash - from competing with itself.
    const canonical = upsert('link[rel="canonical"]', () => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      return link;
    });
    canonical.setAttribute('href', url);

    if (noIndex) {
      setMeta('name', 'robots', 'noindex, nofollow');
    } else {
      removeMeta('name', 'robots');
    }

    // Replaced rather than appended: a route change must not leave the previous
    // page's structured data behind, describing a book nobody is looking at.
    document.head.querySelector('script[data-seo-jsonld]')?.remove();
    if (jsonLdText) {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.setAttribute('data-seo-jsonld', '');
      script.textContent = jsonLdText;
      document.head.appendChild(script);
    }
  }, [title, description, image, type, noIndex, jsonLdText]);
};

export default useSeo;
