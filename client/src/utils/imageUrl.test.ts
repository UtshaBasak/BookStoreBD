/**
 * Configuring Cloudinary takes the bytes out of the database; it does not make
 * them smaller. That is what the delivery URL is for, and this is the piece
 * that asks for it.
 */
import { describe, expect, it } from 'vitest';

import { sized, IMAGE_WIDTHS } from './imageUrl.js';

const UPLOADED = 'https://res.cloudinary.com/demo/image/upload/v1712345678/bookstorebd/books/abc.jpg';

describe('sized', () => {
  it('asks for a modern format, an automatic quality and the width being drawn', () => {
    expect(sized(UPLOADED, IMAGE_WIDTHS.card)).toBe(
      'https://res.cloudinary.com/demo/image/upload/f_auto,q_auto,c_limit,w_400/v1712345678/bookstorebd/books/abc.jpg'
    );
  });

  it('never scales a small cover up', () => {
    // `c_limit` is the difference between "make it 800 wide" and "no wider
    // than 800", which for a small scan is the difference between a blurry
    // upscale and the original.
    expect(sized(UPLOADED, IMAGE_WIDTHS.detail)).toContain('c_limit,w_800');
  });

  it('leaves a URL that already carries transformations alone', () => {
    const already = 'https://res.cloudinary.com/demo/image/upload/w_100/v1/x.jpg';
    expect(sized(already, 400)).toBe(already);
  });

  it('leaves everything that is not one of ours alone', () => {
    for (const other of [
      '/api/book/abc123/cover/0',
      '/book-placeholder.svg',
      'data:image/png;base64,AAAA',
      'https://images.unsplash.com/photo-1.jpg',
    ]) {
      expect(sized(other, 400)).toBe(other);
    }
  });
});
