/**
 * The Wanted board: asking for a book nobody has listed, one entry per book
 * however many ask, and everyone told - in the app and by e-mail - when it is
 * listed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUserWithToken, PNG_PIXEL } from './helpers/factories.js';
import Notification from '../models/Notification.model.js';
import WantedBook from '../models/WantedBook.model.js';
import { isSameBook, keyOf, normaliseIsbn } from '../utils/wanted.js';

const { sendMail } = vi.hoisted(() => {
  process.env.SMTP_USER = 'shop@example.com';
  process.env.SMTP_PASS = 'test-password';
  return { sendMail: vi.fn() };
});
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(async () => {
  await clearDatabase();
  sendMail.mockClear();
});

const outbox = async () => {
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await shopMailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string });
};

const ask = (auth: string, body: Record<string, string>) => request.post('/wanted').set('Authorization', auth).send(body);

/** A listing made the way a seller makes one. */
const list = async (auth: string, fields: Record<string, string>) =>
  request
    .post('/user/add-book')
    .set('Authorization', auth)
    .field('title', fields.title)
    .field('author', fields.author ?? 'Someone')
    .field('publisher', 'Somewhere')
    .field('country', 'BD')
    .field('language', 'bn')
    .field('isbn', fields.isbn ?? '111')
    .field('pages', '200')
    .field('price', '300')
    .field('desc', 'A copy in good shape.')
    .field('category', 'Novels')
    .field('bookType', 'new')
    .attach('images', PNG_PIXEL, 'cover.png');

describe('matching a book', () => {
  it('treats Bangla and English spellings, and both ISBN forms, as one book', () => {
    expect(normaliseIsbn('0-306-40615-2')).toBe('9780306406157');
    expect(normaliseIsbn('978-0-306-40615-7')).toBe('9780306406157');
    const wanted = { isbn: '', titleKey: keyOf('Pather Panchali'), authorKey: keyOf('Bibhutibhushan') };
    expect(isSameBook(wanted, { title: 'পথের পাঁচালী', author: '' })).toBe(true);
    expect(isSameBook(wanted, { title: 'Pather Panchali', author: 'Someone Else' })).toBe(false);
  });
});

describe('the Wanted board', () => {
  it('keeps one entry per book, however many ask', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    const b = await createUserWithToken({ email: 'b@test.com' });

    const first = await ask(a.auth, { title: 'Pather Panchali', author: 'Bibhutibhushan' });
    expect(first.status).toBe(201);
    expect(first.body.result).toBe('created');

    const second = await ask(b.auth, { title: 'পথের পাঁচালী' });
    expect(second.body).toMatchObject({ result: 'joined', item: { count: 2, wantedByMe: true } });
    expect(await WantedBook.countDocuments()).toBe(1);

    const board = await request.get('/wanted').set('Authorization', a.auth);
    expect(board.body.items).toEqual([expect.objectContaining({ title: 'Pather Panchali', count: 2, wantedByMe: true })]);
    // Who wants it is not shown.
    expect(JSON.stringify(board.body)).not.toContain('b@test.com');
  });

  it('points to the listing instead when the book is in the shop', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    const book = await createBook({ title: 'Deyal', author: 'Humayun Ahmed', stock: 2 });
    const res = await ask(a.auth, { title: 'Deyal', author: 'Humayun Ahmed' });
    expect(res.body).toMatchObject({ result: 'listed', book: { _id: String(book._id) } });
    expect(await WantedBook.countDocuments()).toBe(0);
  });

  it('tells everyone who wants it, by notification and e-mail, when it is listed', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    const b = await createUserWithToken({ email: 'b@test.com' });
    const seller = await createUserWithToken({ email: 'seller@test.com', bkashMerchant: '01710000001' });
    await ask(a.auth, { title: 'Chander Pahar', isbn: '978-984-000-000-0' });
    await request.post(`/wanted/${String((await WantedBook.findOne())!._id)}/join`).set('Authorization', b.auth);

    const listed = await list(seller.auth, { title: 'Chander Pahar', author: 'Bibhutibhushan' });
    expect(listed.status).toBe(201);
    expect(listed.body.waiting).toBe(2);

    for (const email of ['a@test.com', 'b@test.com']) {
      const notes = await Notification.find({ recipient: email, type: 'wanted-found' }).lean();
      expect(notes).toHaveLength(1);
      expect(notes[0].link).toBe(`/book/${String(listed.body.book._id)}`);
    }
    expect((await outbox()).filter((m) => m.subject === '"Chander Pahar" is here').map((m) => m.to).sort()).toEqual([
      'a@test.com',
      'b@test.com',
    ]);
    expect(await Notification.countDocuments({ recipient: 'seller@test.com', type: 'book-request' })).toBe(1);
    expect((await WantedBook.findOne().lean())!.status).toBe('found');

    const found = await request.get('/wanted?status=found');
    expect(found.body.items[0].foundBook).toMatchObject({ title: 'Chander Pahar' });
  });

  it('lets people leave, and the last one out removes the entry', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    const created = await ask(a.auth, { title: 'Himu' });
    const res = await request.delete(`/wanted/${created.body.item._id}/join`).set('Authorization', a.auth);
    expect(res.status).toBe(200);
    expect(await WantedBook.countDocuments()).toBe(0);
  });

  it('can be cleared of a request by an administrator only', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    const admin = await createUserWithToken({ email: 'admin@test.com', role: 'admin' });
    const created = await ask(a.auth, { title: 'Something rude' });
    expect((await request.delete(`/wanted/${created.body.item._id}`).set('Authorization', a.auth)).status).toBe(403);
    expect((await request.delete(`/wanted/${created.body.item._id}`).set('Authorization', admin.auth)).status).toBe(200);
  });

  it('needs an account to ask, but not to read', async () => {
    expect((await request.get('/wanted')).status).toBe(200);
    expect((await request.post('/wanted').send({ title: 'Anything' })).status).toBe(401);
  });
});
