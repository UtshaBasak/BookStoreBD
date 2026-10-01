/**
 * The third batch: stronger passwords, search across Bangla and English,
 * suggestions, stock and price alerts, asking for a sold-out book, the
 * buyer's note, order and return e-mails, and the administrator's messages.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createUserWithToken, PNG_PIXEL } from './helpers/factories.js';
import BookRequest from '../models/BookRequest.model.js';
import Notification from '../models/Notification.model.js';
import { passwordProblems } from '../utils/passwordPolicy.js';
import { phoneticKey } from '../utils/phonetic.js';

// Mail is configured for this file only, and caught: config/env.js reads the
// variables once, at import, which `vi.hoisted` runs before.
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

const BUYER = 'buyer@test.com';
const SELLER = 'seller@test.com';
const ADMIN = 'admin@test.com';

const people = async () => ({
  buyer: await createUserWithToken({ email: BUYER, username: 'reader', bkashMerchant: null }),
  seller: await createUserWithToken({ email: SELLER, username: 'bookshop', bkashMerchant: '01710000001' }),
  admin: await createUserWithToken({ email: ADMIN, username: 'admin', role: 'admin' }),
});

const checkout = (auth: string, items: { bookId: unknown; quantity: number }[], extra: Record<string, unknown> = {}) =>
  request
    .post('/order/decrease-stock')
    .set('Authorization', auth)
    .send({ items: items.map((item) => ({ ...item, bookId: String(item.bookId) })), deliveryDistrict: 'Dhaka', ...extra });

const noticesOf = (email: string, type?: string) =>
  Notification.find({ recipient: email, ...(type ? { type } : {}) }).lean();

/** What was mailed, once the background sends have settled. */
const outbox = async (): Promise<{ to: string; subject: string; text: string }[]> => {
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await shopMailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });
};

// --------------------------------------------------------------- passwords
describe('a new password', () => {
  it('must be long, mixed, and not common, personal or a run', () => {
    expect(passwordProblems('Tangerine-Lantern-42!')).toEqual([]);
    expect(passwordProblems('Short1!a')).toContain('length');
    expect(passwordProblems('alllowercase-words-42')).toContain('upper');
    expect(passwordProblems('NO-LOWER-CASE-HERE-42')).toContain('lower');
    expect(passwordProblems('No-Numbers-In-This-One')).toContain('number');
    expect(passwordProblems('NoSymbolsInThisOne42')).toContain('symbol');
    expect(passwordProblems('P@ssw0rd2024!Abc')).toContain('common');
    expect(passwordProblems('Welcome12345!', {})).toContain('common');
    expect(passwordProblems('Rahim-Reads-Books-7!', { username: 'rahim_reads' })).toContain('personal');
    expect(passwordProblems('Shelf-Owner-77!x', { email: 'owner.shelf@test.com' })).toContain('personal');
    expect(passwordProblems('Lantern-aaaa-River-9!')).toContain('pattern');
    expect(passwordProblems('Lantern-1234-River-!x')).toContain('pattern');
  });

  it('can be checked before the sign-up code is sent', async () => {
    const weak = await request.post('/auth/password-check').send({ password: 'password123', email: 'new@test.com' });
    expect(weak.status).toBe(200);
    expect(weak.body.ok).toBe(false);
    expect(weak.body.problems).toEqual(expect.arrayContaining(['length', 'upper', 'symbol', 'common']));

    const strong = await request.post('/auth/password-check').send({ password: 'Tangerine-Lantern-42!', email: 'new@test.com' });
    expect(strong.body).toMatchObject({ ok: true, problems: [], message: '' });
  });

  it('is refused when changing it on the profile, and the old one still works', async () => {
    const { buyer } = await people();
    const res = await request.put('/user/profile').set('Authorization', buyer.auth).field('password', 'abc12345');
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/at least 12 characters/i);
  });
});

// ------------------------------------------------------------------ search
describe('searching across Bangla and English', () => {
  it('keys a Bangla title and its English spelling the same', () => {
    expect(phoneticKey('পথের পাঁচালী')).toBe(phoneticKey('Pather Panchali'));
    expect(phoneticKey('হ্যারি পটার')).toBe(phoneticKey('Harry Potter'));
    expect(phoneticKey('চাঁদের পাহাড়')).toBe(phoneticKey('Chander Pahar'));
  });

  it('finds a Bangla title typed in English, and an English one typed in Bangla', async () => {
    await createBook({ title: 'পথের পাঁচালী', author: 'বিভূতিভূষণ বন্দ্যোপাধ্যায়', isbn: 'BN-1' });
    await createBook({ title: 'Harry Potter', author: 'J. K. Rowling', isbn: 'EN-1' });
    await createBook({ title: 'Unrelated', author: 'Nobody', isbn: 'EN-2' });

    const english = await request.get(`/filter/booklist?search=${encodeURIComponent('pather panchali')}`);
    expect(english.body.items.map((b: { title: string }) => b.title)).toEqual(['পথের পাঁচালী']);

    const bangla = await request.get(`/filter/booklist?search=${encodeURIComponent('হ্যারি পটার')}`);
    expect(bangla.body.items.map((b: { title: string }) => b.title)).toEqual(['Harry Potter']);
  });

  it('matches a short title at the start of a word, not inside one', async () => {
    await createBook({ title: 'Deyal', author: 'Humayun Ahmed', isbn: 'S-1' });
    await createBook({ title: 'Mandala', author: 'Someone', isbn: 'S-2' });

    const res = await request.get(`/filter/booklist?search=${encodeURIComponent('দেয়াল')}`);
    // "DL" begins Deyal; inside Mandala ("MNDL") it does not count.
    expect(res.body.items.map((b: { title: string }) => b.title)).toEqual(['Deyal']);
  });

  it('suggests books, best match first, and sellers with a shop', async () => {
    const { seller } = await people();
    await createBook({ title: 'Deyal', author: 'Humayun Ahmed', sellerEmail: SELLER, isbn: 'X-1' });
    await createBook({ title: 'A Deyal Companion', author: 'Someone', sellerEmail: SELLER, isbn: 'X-2' });
    void seller;

    const books = await request.get('/filter/suggest?q=deyal');
    expect(books.status).toBe(200);
    expect(books.body.books.map((b: { title: string }) => b.title)).toEqual(['Deyal', 'A Deyal Companion']);

    const shops = await request.get('/filter/suggest?q=bookshop');
    expect(shops.body.sellers).toEqual([expect.objectContaining({ username: 'bookshop', books: 2 })]);
    // A buyer has no books, so no shop to suggest.
    expect((await request.get('/filter/suggest?q=reader')).body.sellers).toEqual([]);
  });
});

// ------------------------------------------------------- stock and prices
describe('stock and price alerts', () => {
  it('tell the seller and the interested buyers when a book runs low, and the seller when it sells out', async () => {
    const { buyer, seller } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 8, price: 500 });
    await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth);

    await request.put(`/book/update-stock/${String(book._id)}`).set('Authorization', seller.auth).send({ stock: 4 });
    expect((await noticesOf(BUYER, 'stock'))[0]?.title).toContain('Only 4 left');
    // The seller made the change, so is not told about it.
    expect(await noticesOf(SELLER, 'stock')).toHaveLength(0);

    // An order taking the last copies: the seller hears it sold out.
    await createUserWithToken({ email: 'other@test.com', username: 'other' }).then(({ auth }) =>
      checkout(auth, [{ bookId: book._id, quantity: 4 }])
    );
    expect((await noticesOf(SELLER, 'stock')).map((n) => n.title)).toEqual([expect.stringContaining('has sold out')]);
  });

  it('tell buyers of a price below what they saw, and only then', async () => {
    const { buyer, seller } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3, price: 500 });
    await request.post(`/wishlist/add/${String(book._id)}`).set('Authorization', buyer.auth);

    // Up first: nothing to tell.
    await request.put(`/book/update-price/${String(book._id)}`).set('Authorization', seller.auth).send({ price: 600 });
    // Down, but not below the 500 it was saved at: still nothing.
    await request.put(`/book/update-price/${String(book._id)}`).set('Authorization', seller.auth).send({ price: 550 });
    expect(await noticesOf(BUYER, 'price-drop')).toHaveLength(0);

    await request.put(`/book/update-price/${String(book._id)}`).set('Authorization', seller.auth).send({ price: 450 });
    const [drop] = await noticesOf(BUYER, 'price-drop');
    expect(drop?.title).toContain('now 450 Tk');
    expect(drop?.body).toContain('500 Tk when you saved it');
  });
});

// ------------------------------------------------- asking for a sold-out book
describe('asking for a sold-out book', () => {
  it('tells the seller, then the buyer when it is back', async () => {
    const { buyer, seller } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 0 });

    const asked = await request.post(`/book/${String(book._id)}/request`).set('Authorization', buyer.auth);
    expect(asked.body).toEqual({ requested: true, count: 1 });
    expect((await noticesOf(SELLER, 'book-request'))[0]?.title).toContain('back in stock');
    // Asking twice is the same request.
    await request.post(`/book/${String(book._id)}/request`).set('Authorization', buyer.auth);
    expect(await BookRequest.countDocuments({ open: true })).toBe(1);

    const counts = await request.get('/book/requests/mine').set('Authorization', seller.auth);
    expect(counts.body).toEqual({ [String(book._id)]: 1 });

    await request.put(`/book/update-stock/${String(book._id)}`).set('Authorization', seller.auth).send({ stock: 3 });
    expect((await noticesOf(BUYER, 'back-in-stock'))[0]?.title).toContain('is back in stock');
    expect(await BookRequest.countDocuments({ open: true })).toBe(0);
  });

  it('is refused for a book in stock, or your own', async () => {
    const { buyer, seller } = await people();
    const inStock = await createBook({ sellerEmail: SELLER, stock: 2 });
    const soldOut = await createBook({ sellerEmail: SELLER, stock: 0 });
    expect((await request.post(`/book/${String(inStock._id)}/request`).set('Authorization', buyer.auth)).status).toBe(409);
    expect((await request.post(`/book/${String(soldOut._id)}/request`).set('Authorization', seller.auth)).status).toBe(400);
  });
});

// ----------------------------------------------------- orders and returns
describe('orders, by note and by e-mail', () => {
  it("carry the buyer's note, and e-mail the buyer and the seller", async () => {
    const { buyer, seller } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3, price: 300, title: 'Deyal' });
    const placed = await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }], {
      buyerNote: 'Please call before delivery',
      contactName: 'Rahim',
    });
    expect(placed.status).toBe(200);

    const detail = await request.get(`/order/${String(placed.body.orderNumber)}`).set('Authorization', seller.auth);
    expect(detail.body.buyerNote).toBe('Please call before delivery');

    const mail = await outbox();
    expect(mail.map((m) => m.to).sort()).toEqual([BUYER, SELLER]);
    expect(mail.find((m) => m.to === BUYER)?.subject).toMatch(/is confirmed/);
    expect(mail.find((m) => m.to === SELLER)?.text).toContain('Please call before delivery');
  });

  it('e-mail both on delivery and on cancelling', async () => {
    const { buyer, admin } = await people();
    const first = await createBook({ sellerEmail: SELLER, stock: 3, price: 300 });
    const { body } = await checkout(buyer.auth, [{ bookId: first._id, quantity: 1 }]);
    await outbox();
    sendMail.mockClear();

    await request.patch(`/order/status/${String(body.orderNumber)}`).set('Authorization', admin.auth).send({ status: 'Delivered' });
    let mail = await outbox();
    expect(mail.map((m) => [m.to, m.subject])).toEqual(
      expect.arrayContaining([
        [BUYER, expect.stringMatching(/has been delivered/)],
        [SELLER, expect.stringMatching(/was delivered/)],
      ])
    );

    const second = await checkout(buyer.auth, [{ bookId: first._id, quantity: 1 }]);
    await outbox();
    sendMail.mockClear();
    await request.post(`/order/${String(second.body.orderNumber)}/cancel`).set('Authorization', buyer.auth).send({ reason: 'Ordered twice' });
    mail = await outbox();
    expect(mail.map((m) => m.to).sort()).toEqual([BUYER, SELLER]);
    expect(mail[0]?.text).toContain('Ordered twice');
  });

  it('e-mail the seller of a return request, and the buyer of the decision', async () => {
    const { buyer, admin } = await people();
    const book = await createBook({ sellerEmail: SELLER, stock: 3, price: 300, title: 'Torn Copy' });
    const { body } = await checkout(buyer.auth, [{ bookId: book._id, quantity: 1 }]);
    await request.patch(`/order/status/${String(body.orderNumber)}`).set('Authorization', admin.auth).send({ status: 'Delivered' });
    const lines = (await request.get('/order/buyer').set('Authorization', buyer.auth)).body.items;
    await outbox();
    sendMail.mockClear();

    const asked = await request
      .post('/return')
      .set('Authorization', buyer.auth)
      .field('orderId', String(lines[0]._id))
      .field('defectDescription', 'The cover is torn')
      .field('refundBkash', '01710000002')
      .attach('images', PNG_PIXEL, { filename: 'damage.png', contentType: 'image/png' });
    expect(asked.status).toBe(200);
    let mail = await outbox();
    expect(mail.map((m) => m.to)).toEqual([SELLER]);
    expect(mail[0]?.text).toContain('The cover is torn');

    sendMail.mockClear();
    await request.patch(`/return/requests/${String(asked.body.returnId)}`).set('Authorization', admin.auth).send({ status: 'approved' });
    mail = await outbox();
    expect(mail.map((m) => [m.to, m.subject])).toEqual([[BUYER, expect.stringMatching(/was approved/)]]);
    expect((await noticesOf(BUYER, 'return-decided'))).toHaveLength(1);
  });
});

// ------------------------------------------------------- admin messages
describe("the administrator's messages", () => {
  it('reach a whole group, and never administrators', async () => {
    const { admin } = await people();
    const res = await request
      .post('/admin/message')
      .set('Authorization', admin.auth)
      .send({ channel: 'notification', audience: 'sellers', title: 'Eid sale', body: 'List your books by Friday.', link: '/add-book' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ recipients: 1, notified: 1, emailed: 0 });
    expect((await noticesOf(SELLER, 'announcement'))[0]).toMatchObject({ title: 'Eid sale', link: '/add-book' });
    expect(await noticesOf(BUYER, 'announcement')).toHaveLength(0);
    expect(await noticesOf(ADMIN, 'announcement')).toHaveLength(0);

    const count = await request.get('/admin/message/audience?audience=all').set('Authorization', admin.auth);
    expect(count.body).toEqual({ audience: 'all', recipients: 2 });
  });

  it('reach chosen people by e-mail too', async () => {
    const { admin } = await people();
    const res = await request
      .post('/admin/message')
      .set('Authorization', admin.auth)
      .send({ channel: 'both', audience: 'users', emails: [BUYER], title: 'About your order', body: 'It ships tomorrow.' });
    expect(res.body).toMatchObject({ recipients: 1, notified: 1, emailed: 1, failed: 0 });
    const mail = await outbox();
    expect(mail.map((m) => [m.to, m.subject])).toEqual([[BUYER, 'About your order']]);
  });

  it('are the administrator’s alone, and link only inside the site', async () => {
    const { admin, buyer } = await people();
    const message = { channel: 'notification', audience: 'all', title: 'Hi', body: 'Hello' };
    expect((await request.post('/admin/message').set('Authorization', buyer.auth).send(message)).status).toBe(403);
    expect(
      (await request.post('/admin/message').set('Authorization', admin.auth).send({ ...message, link: 'https://evil.example' })).status
    ).toBe(400);
    expect(
      (await request.post('/admin/message').set('Authorization', admin.auth).send({ ...message, audience: 'users' })).status
    ).toBe(400);
  });
});
