/**
 * Buyer or seller, remembered: coming back from the seller's pages used to
 * land on the buyer profile every time.
 */
import { describe, expect, it } from 'vitest';

import { readProfileMode, rememberProfileMode } from './profileMode.js';
import { getRecentlyViewed, recordView } from './recentlyViewed.js';

describe('profile mode', () => {
  it('is buyer when nothing says otherwise', () => {
    expect(readProfileMode(null)).toBe('buyer');
  });

  it('follows the address first', () => {
    rememberProfileMode('buyer');
    expect(readProfileMode('seller')).toBe('seller');
  });

  it('falls back to the last one chosen on this device', () => {
    rememberProfileMode('seller');
    expect(readProfileMode(null)).toBe('seller');
    expect(readProfileMode('nonsense')).toBe('seller');
  });
});

describe('recently viewed', () => {
  const a = 'aaaaaaaaaaaaaaaaaaaaaaaa';
  const b = 'bbbbbbbbbbbbbbbbbbbbbbbb';

  it('keeps the most recent first, once each', () => {
    recordView(a);
    recordView(b);
    recordView(a);

    expect(getRecentlyViewed()).toEqual([a, b]);
  });

  it('ignores anything that is not a book id', () => {
    recordView('<script>');
    localStorage.setItem('recentlyViewed', JSON.stringify([a, 42, 'nope']));

    expect(getRecentlyViewed()).toEqual([a]);
  });

  it('keeps twenty at most', () => {
    for (let i = 0; i < 25; i++) recordView(i.toString(16).padStart(24, '0'));

    expect(getRecentlyViewed()).toHaveLength(20);
  });
});
