/**
 * Every route used to ship the same static title and description, and a shared
 * link previewed as nothing at all. These pin what each page now says about
 * itself - and that a book title cannot break out of the structured data block
 * it is written into.
 */
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { useSeo, type SeoOptions } from './useSeo.js';

const Page = (options: SeoOptions) => {
  useSeo(options);
  return <p>page</p>;
};

const show = (options: SeoOptions) => render(<Page {...options} />);

const meta = (attribute: 'name' | 'property', key: string): string | null =>
  document.head.querySelector(`meta[${attribute}="${key}"]`)?.getAttribute('content') ?? null;

const jsonLd = (): string | null =>
  document.head.querySelector('script[data-seo-jsonld]')?.textContent ?? null;

describe('useSeo', () => {
  it('names the page and the shop in the title', () => {
    show({ title: 'Clean Code' });

    expect(document.title).toBe('Clean Code · BookStoreBD');
  });

  it('falls back to the shop and its tagline when a page has no title', () => {
    show({});

    expect(document.title).toMatch(/^BookStoreBD — /);
  });

  it('describes the page for a search result and for a shared link', () => {
    show({ title: 'Clean Code', description: 'A handbook of craftsmanship.' });

    expect(meta('name', 'description')).toBe('A handbook of craftsmanship.');
    expect(meta('property', 'og:title')).toBe('Clean Code · BookStoreBD');
    expect(meta('property', 'og:description')).toBe('A handbook of craftsmanship.');
    expect(meta('name', 'twitter:card')).toBe('summary_large_image');
  });

  it('makes the preview image absolute, whatever it was given', () => {
    show({ image: '/banner.png' });

    expect(meta('property', 'og:image')).toBe(`${window.location.origin}/banner.png`);
  });

  it('points a canonical link at the page itself', () => {
    const canonical = () =>
      document.head.querySelector('link[rel="canonical"]')?.getAttribute('href');

    show({ title: 'Clean Code' });

    expect(canonical()).toBe(`${window.location.origin}${window.location.pathname}`);
  });

  it('keeps a private page out of the index, and lets a public one back in', () => {
    const robots = () => meta('name', 'robots');

    const view = show({ noIndex: true });
    expect(robots()).toBe('noindex, nofollow');

    // A route change must not leave the previous page's rule behind, or a
    // public page inherits a noindex it never asked for.
    view.rerender(<Page title="Clean Code" />);
    expect(robots()).toBeNull();
  });

  it('publishes structured data for the page', () => {
    show({
      title: 'Clean Code',
      jsonLd: { '@context': 'https://schema.org', '@type': 'Book', name: 'Clean Code' },
    });

    expect(JSON.parse(jsonLd() ?? '{}')).toMatchObject({ '@type': 'Book', name: 'Clean Code' });
  });

  it('does not let a book title end the script block it sits in', () => {
    // A seller can name a book anything. Unescaped, this closes the tag and
    // everything after it becomes markup.
    show({ jsonLd: { name: '</script><img src=x onerror=alert(1)>' } });

    const text = jsonLd() ?? '';
    expect(text).not.toContain('</script>');
    expect(text).toContain('\\u003c');
    // Still valid JSON, and still the same string.
    expect(JSON.parse(text).name).toBe('</script><img src=x onerror=alert(1)>');
  });

  it('replaces the structured data on a route change rather than stacking it', () => {
    const blocks = () => document.head.querySelectorAll('script[data-seo-jsonld]').length;

    const view = show({ jsonLd: { name: 'One' } });
    view.rerender(<Page jsonLd={{ name: 'Two' }} />);

    expect(blocks()).toBe(1);
    expect(JSON.parse(jsonLd() ?? '{}').name).toBe('Two');
  });
});
