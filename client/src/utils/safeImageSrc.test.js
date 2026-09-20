import { describe, it, expect } from 'vitest';

import { safeImageSrc, safeObjectUrl, PLACEHOLDER_IMAGE } from './safeImageSrc.js';

describe('safeImageSrc', () => {
  it.each([
    ['data:image/png;base64,AAA'],
    ['data:image/jpeg;base64,BBB'],
    ['blob:http://localhost/abc-123'],
    ['https://cdn.example.com/cover.jpg'],
    ['http://localhost:4000/uploads/cover.jpg'],
    ['/uploads/cover.jpg'],
  ])('allows %s', (value) => {
    expect(safeImageSrc(value)).toBe(value);
  });

  it.each([
    ['javascript:alert(1)'],
    ['JAVASCRIPT:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['file:///etc/passwd'],
  ])('blocks %s', (value) => {
    expect(safeImageSrc(value)).toBe('');
  });

  it('returns the fallback for a blocked value when one is given', () => {
    expect(safeImageSrc('javascript:alert(1)', PLACEHOLDER_IMAGE)).toBe(PLACEHOLDER_IMAGE);
  });

  it.each([[null], [undefined], [42], [{}], [[]], ['']])(
    'returns the fallback for %s',
    (value) => {
      expect(safeImageSrc(value, PLACEHOLDER_IMAGE)).toBe(PLACEHOLDER_IMAGE);
    }
  );

  it('trims surrounding whitespace before checking the scheme', () => {
    expect(safeImageSrc('  https://example.com/a.png  ')).toBe('https://example.com/a.png');
  });

  it('is not fooled by leading whitespace around a blocked scheme', () => {
    expect(safeImageSrc('   javascript:alert(1)')).toBe('');
  });
});

describe('safeObjectUrl', () => {
  it('returns an empty string when there is no file', () => {
    expect(safeObjectUrl(null)).toBe('');
    expect(safeObjectUrl(undefined)).toBe('');
  });

  it('passes a blob URL through', () => {
    const file = new File(['x'], 'cover.png', { type: 'image/png' });
    expect(safeObjectUrl(file)).toMatch(/^blob:/);
  });
});
