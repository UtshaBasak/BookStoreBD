/**
 * The assistant's knowledge base: well formed, links only to pages that exist,
 * and quoting the figures the shop enforces.
 */
import { describe, it, expect } from 'vitest';

import { DELIVERY } from '../config/commerce.js';
import { bnDigits } from '../utils/language.js';
import { knowledgeBase, SITE_PAGES } from '../utils/assistant/knowledge.js';

/** Routes whose address has more after the prefix, such as /shop/<username>. */
const ROUTE_PREFIXES = ['/shop/', '/book/'];

describe('assistant knowledge base', () => {
  const chunks = knowledgeBase();

  it('has unique, kebab-case ids', () => {
    const ids = chunks.map((chunk) => chunk.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('links only to pages of the site', () => {
    const paths = SITE_PAGES.map((page) => page.path);
    for (const chunk of chunks) {
      expect(chunk.link.startsWith('/')).toBe(true);
      const path = chunk.link.split(/[?#]/)[0] ?? '';
      const known = paths.includes(path) || ROUTE_PREFIXES.some((prefix) => path.startsWith(prefix));
      expect(known, `${chunk.id} links to ${chunk.link}`).toBe(true);
    }
  });

  it('has plain text in both languages and enough keywords', () => {
    for (const chunk of chunks) {
      for (const language of ['en', 'bn'] as const) {
        expect(chunk.text[language].trim().length, `${chunk.id} ${language} text`).toBeGreaterThan(0);
        expect(chunk.title[language].trim().length, `${chunk.id} ${language} title`).toBeGreaterThan(0);
        expect(chunk.text[language]).not.toContain('<');
        expect(chunk.text[language]).not.toContain('undefined');
      }
      expect(chunk.keywords.length, `${chunk.id} keywords`).toBeGreaterThanOrEqual(6);
      for (const keyword of chunk.keywords) expect(keyword).toBe(keyword.toLowerCase());
    }
  });

  it('quotes the delivery charge from the shop config', () => {
    const delivery = chunks.find((chunk) => chunk.id === 'delivery-charge');
    expect(delivery).toBeDefined();
    expect(delivery?.text.en).toContain(String(DELIVERY.insideDhaka));
    expect(delivery?.text.en).toContain(String(DELIVERY.outsideDhaka));
    expect(delivery?.text.bn).toContain(bnDigits(DELIVERY.insideDhaka));
    expect(delivery?.text.bn).toContain(bnDigits(DELIVERY.outsideDhaka));
  });
});
