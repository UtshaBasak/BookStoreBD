import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import { createBook, createSignedInUser } from './helpers/factories.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('when image hosting is not configured', () => {
  // The suite runs with no CLOUDINARY_* variables, which is also what a fresh
  // clone looks like.
  it('reports that it is unavailable rather than failing', async () => {
    const { auth } = await createSignedInUser(request);

    const res = await request.get('/upload/signature').set('Authorization', auth);

    expect(res.status).toBe(503);
    expect(res.body.fallback).toBe('inline');
  });

  it('still requires a signed-in caller', async () => {
    const res = await request.get('/upload/signature');
    expect(res.status).toBe(401);
  });

  it('accepts an inline upload, exactly as before', async () => {
    const { auth } = await createSignedInUser(request, { email: 'seller@test.com' });

    const res = await request
      .post('/user/add-book')
      .set('Authorization', auth)
      .field('title', 'Inline Cover')
      .field('author', 'A')
      .field('publisher', 'P')
      .field('country', 'BD')
      .field('language', 'en')
      .field('isbn', '111')
      .field('pages', '10')
      .field('price', '10')
      .field('desc', 'd')
      .field('category', 'tech')
      .field('bookType', 'new')
      .attach('images', Buffer.from('fake-png-bytes'), 'cover.png');

    expect(res.status).toBe(201);
    expect(res.body.book.images[0]).toMatch(/^data:/);
  });
});

describe('signature generation', () => {
  const withCredentials = async (fn) => {
    vi.resetModules();
    process.env.CLOUDINARY_CLOUD_NAME = 'testcloud';
    process.env.CLOUDINARY_API_KEY = '1234567890';
    process.env.CLOUDINARY_API_SECRET = 'test-secret';
    try {
      const mod = await import('../config/cloudinary.js');
      await fn(mod);
    } finally {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;
      vi.resetModules();
    }
  };

  it('matches the documented algorithm: sha1(sorted params + secret)', async () => {
    await withCredentials(async ({ createUploadSignature }) => {
      const { createHash } = await import('crypto');
      const sig = createUploadSignature({ folder: 'bookstorebd/books' });

      const expected = createHash('sha1')
        .update(`folder=${sig.folder}&timestamp=${sig.timestamp}test-secret`)
        .digest('hex');

      expect(sig.signature).toBe(expected);
    });
  });

  it('never returns the API secret to the browser', async () => {
    await withCredentials(async ({ createUploadSignature }) => {
      const sig = createUploadSignature();
      expect(JSON.stringify(sig)).not.toContain('test-secret');
    });
  });

  it('points at this account and uses a current timestamp', async () => {
    await withCredentials(async ({ createUploadSignature }) => {
      const sig = createUploadSignature();

      expect(sig.uploadUrl).toBe('https://api.cloudinary.com/v1_1/testcloud/image/upload');
      expect(Math.abs(sig.timestamp - Math.round(Date.now() / 1000))).toBeLessThan(5);
    });
  });
});

describe('URL ownership', () => {
  const withCloud = async (fn) => {
    vi.resetModules();
    process.env.CLOUDINARY_CLOUD_NAME = 'testcloud';
    process.env.CLOUDINARY_API_KEY = 'k';
    process.env.CLOUDINARY_API_SECRET = 's';
    try {
      await fn(await import('../config/cloudinary.js'));
    } finally {
      delete process.env.CLOUDINARY_CLOUD_NAME;
      delete process.env.CLOUDINARY_API_KEY;
      delete process.env.CLOUDINARY_API_SECRET;
      vi.resetModules();
    }
  };

  it('accepts a URL from this account', async () => {
    await withCloud(({ isOwnedCloudinaryUrl }) => {
      expect(
        isOwnedCloudinaryUrl('https://res.cloudinary.com/testcloud/image/upload/v1/a.jpg')
      ).toBe(true);
    });
  });

  it.each([
    ['another account', 'https://res.cloudinary.com/someoneelse/image/upload/v1/a.jpg'],
    ['an arbitrary host', 'https://evil.example.com/a.jpg'],
    ['a lookalike host', 'https://res.cloudinary.com.evil.com/testcloud/a.jpg'],
    ['a javascript url', 'javascript:alert(1)'],
    ['a non-string', 42],
  ])('rejects %s', async (_label, value) => {
    await withCloud(({ isOwnedCloudinaryUrl }) => {
      expect(isOwnedCloudinaryUrl(value)).toBe(false);
    });
  });
});

describe('listings only accept URLs from this account', () => {
  it('drops a URL pointing somewhere else', async () => {
    const { auth } = await createSignedInUser(request, { email: 'seller@test.com' });

    // No credentials configured here, so nothing passes the ownership check and
    // the listing falls back to having no images rather than storing the
    // attacker-chosen URL.
    const res = await request
      .post('/user/add-book')
      .set('Authorization', auth)
      .field('title', 'Hijack attempt')
      .field('author', 'A')
      .field('publisher', 'P')
      .field('country', 'BD')
      .field('language', 'en')
      .field('isbn', '222')
      .field('pages', '10')
      .field('price', '10')
      .field('desc', 'd')
      .field('category', 'tech')
      .field('bookType', 'new')
      .field('images', 'https://evil.example.com/tracker.gif');

    expect(res.status).toBe(201);
    expect(res.body.book.images).not.toContain('https://evil.example.com/tracker.gif');
  });
});

describe('deleting a listing', () => {
  it('does not fail when there are no hosted assets to remove', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const book = await createBook({ sellerEmail: 'seller@test.com' });

    const res = await request.delete(`/book/${book._id}`).set('Authorization', seller.auth);

    expect(res.status).toBe(200);
  });
});

describe('migration', () => {
  it('leaves listings alone when nothing is inline', async () => {
    await createBook({ images: ['https://res.cloudinary.com/testcloud/image/upload/a.jpg'] });

    const { migrateImages } = await import('../scripts/migrateImages.js');
    const summary = await migrateImages({ dryRun: true });

    expect(summary.migrated).toBe(0);
  });

  it('reports what it would change without writing anything', async () => {
    const book = await createBook({ images: ['data:image/png;base64,AAAA'] });

    const { migrateImages } = await import('../scripts/migrateImages.js');
    const summary = await migrateImages({ dryRun: true });

    expect(summary.migrated).toBe(1);

    const AddBook = (await import('../models/AddBook.model.js')).default;
    const after = await AddBook.findById(book._id);
    expect(after.images[0]).toBe('data:image/png;base64,AAAA');
  });

  it('respects a limit, so a first batch can be small', async () => {
    for (let i = 0; i < 3; i += 1) {
      await createBook({ isbn: `iso-${i}`, images: ['data:image/png;base64,AAAA'] });
    }

    const { migrateImages } = await import('../scripts/migrateImages.js');
    const summary = await migrateImages({ dryRun: true, limit: 2 });

    expect(summary.migrated).toBe(2);
  });
});
