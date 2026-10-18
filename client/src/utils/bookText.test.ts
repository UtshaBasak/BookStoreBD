import { describe, expect, it } from 'vitest';

import { conditionOf, given } from './bookText.js';

describe('what a listing shows', () => {
  it('nothing for a blank field or an "N/A" placeholder', () => {
    expect(given('N/A')).toBe('');
    expect(given(' n/a ')).toBe('');
    expect(given('')).toBe('');
    expect(given(undefined)).toBe('');
    expect(given('Ananda')).toBe('Ananda');
  });

  it('a condition only for a second-hand copy', () => {
    expect(conditionOf({ bookType: 'new', condition: 'mint' })).toBe('');
    expect(conditionOf({ bookType: 'old', condition: 'good' })).toBe('good');
  });
});
