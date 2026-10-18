/**
 * Listings that say only what the seller filled in, discounts that save
 * something, saved books and purchases that exist, a Wanted board that keeps
 * its limit, buyers' stock alerts under deals, a chat deleted from one side,
 * and the clean-up of data saved before these fixes.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createUserWithToken, PNG_PIXEL } from './helpers/factories.js';
import AddBook from '../models/AddBook.model.js';
import ChatMessage from '../models/Chat.model.js';
import Notification from '../models/Notification.model.js';
import Order from '../models/Order.model.js';
import Purchase from '../models/Purchase.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import Review from '../models/Review.model.js';
import WantedBook from '../models/WantedBook.model.js';
import Wishlist from '../models/Wishlist.model.js';
import { cleanUpData } from '../utils/dataCleanUp.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const SELLER = 'seller@test.com';
const BUYER = 'buyer@test.com';

// --------------------------------------------------------------- listings
describe('a new listing', () => {
  const list = (auth: string, fields: Record<string, string>) => {
    let call = request.post('/user/add-book').set('Authorization', auth);
    for (const [name, value] of Object.entries({ title: 'Deyal', author: 'Humayun Ahmed', price: '300', category: 'Fiction', ...fields })) {
      call = call.field(name, value);
    }
    return call.attach('images', PNG_PIXEL, 'cover.png');
  };

  it('leaves blank what the seller left blank, and reads "N/A" as blank', async () => {
    const seller = await createUserWithToken({ email: SELLER });

    const res = await list(seller.auth, { bookType: 'new', publisher: 'N/A', desc: 'n/a' });

    expect(res.status).toBe(201);
    const book = await AddBook.findOne({ title: 'Deyal' }).lean();
    expect(book).toMatchObject({ publisher: '', desc: '', isbn: '', country: '', language: '' });
  });

  it('gives a new book no condition', async () => {
    const seller = await createUserWithToken({ email: SELLER });

    await list(seller.auth, { bookType: 'new', condition: 'mint' });

    expect((await AddBook.findOne({ title: 'Deyal' }).lean())?.condition).toBe('');
  });

  it("keeps a second-hand copy's condition", async () => {
    const seller = await createUserWithToken({ email: SELLER });

    await list(seller.auth, { bookType: 'old', condition: 'good', conditionDetails: 'Spine creased' });

    expect(await AddBook.findOne({ title: 'Deyal' }).lean()).toMatchObject({ condition: 'good', conditionDetails: 'Spine creased' });
  });
});

describe('a discount', () => {
  it('that rounds to nothing off is refused, rather than reported as saved', async () => {
    const seller = await createUserWithToken({ email: SELLER });
    const book = await createBook({ sellerEmail: SELLER, price: 10 });

    const res = await request.put(`/book/discount/${String(book._id)}`).set('Authorization', seller.auth).send({ type: 'percent', value: 1 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/less than 1 Tk/);
    expect((await AddBook.findById(book._id).lean())?.discountType ?? null).toBeNull();
  });
});

// --------------------------------------------------- wishlist and purchase
describe('saving and recording', () => {
  it('a wishlist only takes a book that exists', async () => {
    const buyer = await createUserWithToken({ email: BUYER });

    const res = await request.post(`/wishlist/add/${new mongoose.Types.ObjectId().toString()}`).set('Authorization', buyer.auth);

    expect(res.status).toBe(404);
    expect(await Wishlist.countDocuments({})).toBe(0);
  });

  it('a purchase only names a book that exists, and keeps how many', async () => {
    const buyer = await createUserWithToken({ email: BUYER });
    const book = await createBook({ sellerEmail: SELLER });

    expect((await request.post('/purchase').set('Authorization', buyer.auth).send({ bookId: new mongoose.Types.ObjectId().toString() })).status).toBe(404);
    const res = await request.post('/purchase').set('Authorization', buyer.auth).send({ bookId: String(book._id), quantity: 3 });

    expect(res.status).toBe(201);
    expect((await Purchase.findOne({}).lean())?.quantity).toBe(3);
  });
});

// ----------------------------------------------------------------- wanted
describe('the Wanted board', () => {
  const ask = (auth: string, body: Record<string, string>) => request.post('/wanted').set('Authorization', auth).send(body);

  it('counts joining a request through "Ask for a book" towards the limit', async () => {
    const first = await createUserWithToken({ email: 'first@test.com' });
    const busy = await createUserWithToken({ email: 'busy@test.com' });
    await ask(first.auth, { title: 'Aranyak' });
    // Twenty different books, open at once: the limit.
    for (const id of Array.from({ length: 20 }, (_, n) => new mongoose.Types.ObjectId().toString().slice(-8) + n)) {
      await WantedBook.create({ title: id, titleKey: id, requesters: [{ email: 'busy@test.com' }], requesterCount: 1, createdBy: 'busy@test.com' });
    }

    const res = await ask(busy.auth, { title: 'Aranyak' });

    expect(res.status).toBe(429);
    expect((await WantedBook.findOne({ title: 'Aranyak' }).lean())?.requesterCount).toBe(1);
  });

  it('keeps what a reader adds under "Anything else?" when they join', async () => {
    const first = await createUserWithToken({ email: 'first@test.com' });
    const second = await createUserWithToken({ email: 'second@test.com' });
    await ask(first.auth, { title: 'Aranyak' });

    await ask(second.auth, { title: 'Aranyak', details: 'The 1976 edition' });

    const entry = await WantedBook.findOne({ title: 'Aranyak' }).lean();
    expect(entry?.details).toBe('The 1976 edition');
    expect(entry?.requesters.find((r) => r.email === 'second@test.com')?.details).toBe('The 1976 edition');
  });

  it('counts two joins at once as one', async () => {
    const first = await createUserWithToken({ email: 'first@test.com' });
    const second = await createUserWithToken({ email: 'second@test.com' });
    const created = await ask(first.auth, { title: 'Aranyak' });
    const id = String(created.body.item._id);

    await Promise.all([
      request.post(`/wanted/${id}/join`).set('Authorization', second.auth),
      request.post(`/wanted/${id}/join`).set('Authorization', second.auth),
    ]);

    const entry = await WantedBook.findById(id).lean();
    expect(entry?.requesterCount).toBe(2);
    expect(entry?.requesters).toHaveLength(2);
  });
});

// ----------------------------------------------------------------- alerts
describe("a buyer's selling-out alert", () => {
  it('follows "Deals and price drops", not the seller\'s "Your stock"', async () => {
    const seller = await createUserWithToken({ email: SELLER });
    const buyer = await createUserWithToken({ email: BUYER, bkashMerchant: null });
    const book = await createBook({ sellerEmail: SELLER, stock: 8 });
    await request.post(`/cart/add/${String(book._id)}`).set('Authorization', buyer.auth);
    // Off: their own stock alerts. On: deals.
    await request.put('/user/me/notifications').set('Authorization', buyer.auth).send({ prefs: { stock: { inApp: false, email: false } } });

    await request.put(`/book/update-stock/${String(book._id)}`).set('Authorization', seller.auth).send({ stock: 4 });
    expect(await Notification.countDocuments({ recipient: BUYER, type: 'selling-out' })).toBe(1);

    await request.put('/user/me/notifications').set('Authorization', buyer.auth).send({ prefs: { deals: { inApp: false, email: false } } });
    await request.put(`/book/update-stock/${String(book._id)}`).set('Authorization', seller.auth).send({ stock: 9 });
    await request.put(`/book/update-stock/${String(book._id)}`).set('Authorization', seller.auth).send({ stock: 3 });
    expect(await Notification.countDocuments({ recipient: BUYER, type: 'selling-out' })).toBe(1);
  });
});

// ------------------------------------------------------------------- chat
describe('deleting a conversation', () => {
  it("takes it off the caller's side, with its unread messages, and leaves the other person's", async () => {
    const alice = await createUserWithToken({ email: 'alice@test.com' });
    const bob = await createUserWithToken({ email: 'bob@test.com' });
    await request.post('/chat/message').set('Authorization', bob.auth).field('receiver', 'alice@test.com').field('message', 'Is it still there?');

    expect((await request.get('/chat/unread/alice@test.com').set('Authorization', alice.auth)).body.count).toBe(1);
    await request.delete('/chat/delete').set('Authorization', alice.auth).send({ user1: 'alice@test.com', user2: 'bob@test.com' });

    expect((await request.get('/chat/unread/alice@test.com').set('Authorization', alice.auth)).body.count).toBe(0);
    const aliceThread = await request
      .get('/chat/messages?sender=alice@test.com&receiver=bob@test.com')
      .set('Authorization', alice.auth);
    expect(aliceThread.body.messages).toHaveLength(0);
    const bobThread = await request
      .get('/chat/messages?sender=bob@test.com&receiver=alice@test.com')
      .set('Authorization', bob.auth);
    expect(bobThread.body.messages).toHaveLength(1);

    // A new message starts the conversation again on Alice's side.
    await request.post('/chat/message').set('Authorization', bob.auth).field('receiver', 'alice@test.com').field('message', 'Hello again');
    expect((await request.get('/chat/history/alice@test.com').set('Authorization', alice.auth)).body[0].lastMessage).toBe('Hello again');
    expect(await ChatMessage.countDocuments({})).toBe(2);
  });
});

// --------------------------------------------------------------- clean-up
describe('cleaning up data saved before the fixes', () => {
  const seed = async () => {
    const book = await createBook({ sellerEmail: SELLER, bookType: 'new', condition: 'mint', publisher: 'N/A', desc: 'N/A' });
    const line = (status: string, extra: Record<string, unknown> = {}) =>
      Order.create({
        orderNumber: `ORDER${Math.random().toString(36).slice(2, 13).toUpperCase()}`,
        status,
        buyerEmail: BUYER,
        sellerEmail: SELLER,
        bookId: book._id,
        bookType: 'new',
        condition: 'mint',
        title: book.title,
        price: 100,
        quantity: 1,
        ...extra,
      });
    const rejected = await line('Delivered', { isReturned: 1 });
    await ReturnRequest.create({ orderId: rejected._id, bookId: book._id, bookTitle: 'x', userEmail: BUYER, sellerEmail: SELLER, defectDescription: 'x', status: 'rejected' });
    const approved = await line('Delivered', { isReturned: 1 });
    await ReturnRequest.create({ orderId: approved._id, bookId: book._id, bookTitle: 'x', userEmail: BUYER, sellerEmail: SELLER, defectDescription: 'x', status: 'approved' });
    // A review whose only order was cancelled, by somebody else.
    const other = await createBook({ sellerEmail: SELLER, title: 'Other' });
    await Order.create({ orderNumber: 'CANCELLED0000001', status: 'Cancelled', buyerEmail: 'gone@test.com', sellerEmail: SELLER, bookId: other._id, price: 1, quantity: 1 });
    await Review.create({ book: other._id, reviewerEmail: 'gone@test.com', reviewerName: 'gone', rating: 1 });
    await Review.create({ book: book._id, reviewerEmail: BUYER, reviewerName: 'reader', rating: 5 });
    return { book, rejected, approved };
  };

  it('says what it would change without changing it', async () => {
    await seed();

    const report = await cleanUpData({ dryRun: true });

    expect(report).toEqual({
      returnFlagsCleared: 1,
      listingFieldsCleared: 2,
      newBookConditionsCleared: 1,
      orderConditionsCleared: 2,
      reviewsRemoved: 1,
      sellerRatingsRemoved: 0,
    });
    expect(await Review.countDocuments({})).toBe(2);
  });

  it('repairs it, and a second run finds nothing more', async () => {
    const { book, rejected, approved } = await seed();

    await cleanUpData({ dryRun: false });

    expect((await Order.findById(rejected._id).lean())?.isReturned).toBe(0);
    expect((await Order.findById(approved._id).lean())?.isReturned).toBe(1);
    expect(await AddBook.findById(book._id).lean()).toMatchObject({ publisher: '', desc: '', condition: '' });
    expect(await Review.countDocuments({})).toBe(1);
    expect(Object.values(await cleanUpData({ dryRun: true })).every((n) => n === 0)).toBe(true);
  });
});
