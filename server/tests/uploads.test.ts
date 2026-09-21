/**
 * `multer` limited size and count and nothing else, so a text file called
 * `cover.png` was stored as a book cover: unvalidated content in the database,
 * a storage-abuse channel, and a trap for the next person to render one of
 * these without the helper that currently saves us.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser, PNG_PIXEL } from './helpers/factories.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

/** The fields `POST /user/add-book` needs, so the test is about the file. */
const listing = (req: ReturnType<PrefixedRequest['post']>) =>
  req
    .field('title', 'A Book')
    .field('author', 'An Author')
    .field('publisher', 'A Publisher')
    .field('country', 'Bangladesh')
    .field('language', 'English')
    .field('isbn', '9780000000000')
    .field('pages', '100')
    .field('price', '250')
    .field('desc', 'A description.')
    .field('category', 'fiction')
    .field('bookType', 'new')
    .field('stock', '1');

describe('uploading a book cover', () => {
  it('accepts a real image', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });

    const res = await listing(request.post('/user/add-book'))
      .set('Authorization', seller.auth)
      .attach('images', PNG_PIXEL, 'cover.png');

    expect(res.status).toBe(201);
  });

  it('refuses a text file wearing a .png name', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });

    const res = await listing(request.post('/user/add-book'))
      .set('Authorization', seller.auth)
      .attach('images', Buffer.from('not really an image'), {
        filename: 'cover.png',
        contentType: 'image/png',
      });

    // The client chooses the Content-Type, so the declared one proves nothing.
    // What refuses this is the file's own first bytes.
    expect(res.status).toBe(415);
    expect(res.body.message).toMatch(/not a PNG, JPEG, WebP or GIF/i);
  });

  it('refuses a type that was never allowed', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });

    const res = await listing(request.post('/user/add-book'))
      .set('Authorization', seller.auth)
      .attach('images', Buffer.from('%PDF-1.4'), {
        filename: 'cover.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(415);
  });

  it('stores nothing when the file is refused', async () => {
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const AddBook = (await import('../models/AddBook.model.js')).default;

    await listing(request.post('/user/add-book'))
      .set('Authorization', seller.auth)
      .attach('images', Buffer.from('not really an image'), {
        filename: 'cover.png',
        contentType: 'image/png',
      });

    expect(await AddBook.countDocuments({})).toBe(0);
  });
});

describe('uploading a profile picture', () => {
  it('accepts a real image', async () => {
    const user = await createSignedInUser(request);

    const res = await request
      .put('/user/profile')
      .set('Authorization', user.auth)
      .attach('profilePicture', PNG_PIXEL, 'me.png');

    expect(res.status).toBe(200);
  });

  it('refuses anything that is not one', async () => {
    const user = await createSignedInUser(request);

    const res = await request
      .put('/user/profile')
      .set('Authorization', user.auth)
      .attach('profilePicture', Buffer.from('<script>alert(1)</script>'), {
        filename: 'me.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(415);
  });
});

describe('a chat attachment', () => {
  it('has to be an image too', async () => {
    const sender = await createSignedInUser(request, { email: 'sender@test.com' });

    const res = await request
      .post('/chat/message')
      .set('Authorization', sender.auth)
      .field('receiver', 'receiver@test.com')
      .attach('image', Buffer.from('MZ'), { filename: 'photo.png', contentType: 'image/png' });

    expect(res.status).toBe(415);
  });
});

describe('the recorded type', () => {
  it('is what the bytes say, not what the upload claimed', async () => {
    // A PNG announced as a JPEG would otherwise be stored as
    // `data:image/jpeg;base64,<png>` - a lie carried in the database.
    const seller = await createSignedInUser(request, { email: 'seller@test.com' });
    const AddBook = (await import('../models/AddBook.model.js')).default;

    const res = await listing(request.post('/user/add-book'))
      .set('Authorization', seller.auth)
      .attach('images', PNG_PIXEL, { filename: 'cover.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(201);
    const book = await AddBook.findOne({});
    expect(book?.images?.[0]?.startsWith('data:image/png;base64,')).toBe(true);
  });
});
