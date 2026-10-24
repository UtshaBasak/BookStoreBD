import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  currentLanguage,
  digits,
  formatDate,
  formatNumber,
  onLanguageChange,
  readLanguageChoice,
  setLanguage,
  systemLanguage,
  t,
} from './language.js';
import { taka } from './pricing.js';

const browserLanguages = (languages: string[]) => vi.spyOn(navigator, 'languages', 'get').mockReturnValue(languages);

afterEach(() => {
  setLanguage('system');
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the language', () => {
  it("follows the browser until a choice is made: the first language the site speaks", () => {
    browserLanguages(['fr-FR', 'bn-BD', 'en-US']);
    expect(systemLanguage()).toBe('bn');
    expect(currentLanguage()).toBe('bn');

    browserLanguages(['de', 'fr']);
    expect(systemLanguage()).toBe('en');
  });

  it('keeps a choice, and sets it on <html>', () => {
    setLanguage('bn');

    expect(readLanguageChoice()).toBe('bn');
    expect(localStorage.getItem('language')).toBe('bn');
    expect(document.documentElement.lang).toBe('bn');

    setLanguage('system');
    expect(localStorage.getItem('language')).toBeNull();
  });

  it('says who needs to know when it changes, and only then', () => {
    browserLanguages(['en-US']);
    const heard = vi.fn();
    const stop = onLanguageChange(heard);
    setLanguage('bn');
    setLanguage('bn');
    setLanguage('en');
    stop();

    expect(heard.mock.calls).toEqual([['bn'], ['en']]);
  });
});

describe('text and numbers', () => {
  it('picks the text for the language being shown', () => {
    setLanguage('en');
    expect(t('Cart', 'কার্ট')).toBe('Cart');
    setLanguage('bn');
    expect(t('Cart', 'কার্ট')).toBe('কার্ট');
  });

  it('writes numbers, prices and dates with Bangla digits in Bangla', () => {
    setLanguage('bn');
    expect(formatNumber(120000)).toBe('১,২০,০০০');
    expect(taka(1200)).toBe('৳১,২০০');
    expect(digits('Order 42')).toBe('Order ৪২');
    expect(formatDate('2026-10-24T12:00:00Z', { day: 'numeric', month: 'long', timeZone: 'UTC' })).toMatch(/২৪/);

    setLanguage('en');
    expect(taka(1200)).toBe('৳1,200');
    expect(digits(42)).toBe('42');
  });
});
