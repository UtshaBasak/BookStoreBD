/**
 * Automatic moderation: each rule with a positive and a negative case, flags
 * that are idempotent and never hide anything, shadow mode, the model layer
 * (replaced, never Google), chat kept away from the model, and the
 * administrators' decisions.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import type { Types } from 'mongoose';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUserWithToken } from './helpers/factories.js';
import AuditLog from '../models/AuditLog.model.js';
import ChatMessage from '../models/Chat.model.js';
import ModerationFlag from '../models/ModerationFlag.model.js';
import ModerationJob from '../models/ModerationJob.model.js';
import Notification from '../models/Notification.model.js';
import Review from '../models/Review.model.js';
import SellerReview from '../models/SellerReview.model.js';
import { resetGeminiBudgetForTesting, setGeminiTransportForTesting } from '../utils/gemini.js';
import { abuseReasons, bannedItemReasons, contactReasons } from '../utils/moderation/rules.js';
import { enqueueModeration, runModerationOnce, scanContent } from '../utils/moderation/queue.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(async () => {
  await clearDatabase();
  resetGeminiBudgetForTesting();
  process.env.MODERATION_MODE = 'on';
});
afterEach(() => {
  setGeminiTransportForTesting(null);
  delete process.env.MODERATION_MODE;
  delete process.env.GEMINI_API_KEY;
  delete process.env.MODERATION_DISABLED_RULES;
  vi.restoreAllMocks();
});

const writeReview = async (book: { _id: Types.ObjectId }, email: string, title: string, body: string, rating = 4) =>
  Review.create({ book: book._id, reviewerEmail: email, reviewerName: email.split('@')[0], rating, title, body });

/** Records every call to the model, and answers with `answer`. */
const model = (answer: string | { status: number }) => {
  process.env.GEMINI_API_KEY = 'test-key';
  const calls: string[] = [];
  setGeminiTransportForTesting(async (_url, body) => {
    calls.push(JSON.stringify(body));
    if (typeof answer !== 'string') return { status: answer.status, body: {} };
    return { status: 200, body: { candidates: [{ content: { parts: [{ text: answer }] }, finishReason: 'STOP' }] } };
  });
  return calls;
};

describe('the rules', () => {
  it('flag severe abuse on its own, and harsh words only in numbers', () => {
    expect(abuseReasons('you are a bastard and I will kill you').map((item) => item.code)).toEqual(['threat']);
    expect(abuseReasons('এই বিক্রেতা চোর')).toEqual([]);
    expect(abuseReasons('The seller is a fraud. Late delivery.')).toEqual([]);
    expect(abuseReasons('idiot, stupid, liar seller')).toHaveLength(1);
  });

  it('spare everyday slang, and words that name a book’s subject or an author', () => {
    for (const text of [
      'Holy shit this book was good, the ending is bullshit though',
      'Damn, the delivery sucked but what a bloody good read',
      'ধুর, ডেলিভারি ফালতু দেরি করেছে',
      'dhur bhai, faltu packaging, pagol kora ending',
      'Do Androids Dream of Electric Sheep? by Philip K. Dick',
      'A novel about survivors of rape and war, 1971',
    ]) {
      expect(abuseReasons(text), text).toEqual([]);
    }
  });

  it('leave honest reviews and ordinary book titles alone', () => {
    for (const text of ['Great book, fast delivery!', 'The Naked Sun by Isaac Asimov', 'Hell Bent — a thriller', 'বইটি খুব ভালো, ধন্যবাদ']) {
      expect(abuseReasons(text)).toEqual([]);
      expect(contactReasons(text)).toEqual([]);
    }
  });

  it('find contact details and requests to deal off the site', () => {
    expect(contactReasons('Call me on 01712345678').map((item) => item.code)).toContain('contact-details');
    expect(contactReasons('whatsapp me for cheaper price').map((item) => item.code)).toContain('off-site');
  });

  it('find prohibited items by the owner’s list, but not books about a subject', () => {
    expect(bannedItemReasons('Full PDF copy available, scan copy')[0]?.code).toBe('banned:pirated-copies');
    expect(bannedItemReasons('A history of photography and print')).toEqual([]);
  });

  it('can be switched off by code', async () => {
    process.env.MODERATION_DISABLED_RULES = 'contact-details';
    const seller = await createUserWithToken({ email: 'sam@test.com', username: 'sam' });
    const book = await createBook({ sellerEmail: seller.user.email, desc: 'Call 01712345678' });
    await scanContent('listing', book._id);
    expect(await ModerationFlag.countDocuments()).toBe(0);
  });
});

describe('listings', () => {
  it('flag a price far below the same book elsewhere, and not an ordinary one', async () => {
    const listing = (price: number) =>
      createBook({ title: 'Aguner Poroshmoni', author: 'Humayun Ahmed', isbn: '', price, images: [`data:image/png;base64,P${price}`] });
    for (const price of [300, 320, 310]) await listing(price);
    const cheap = await listing(20);
    const fair = await listing(280);
    await scanContent('listing', cheap._id);
    await scanContent('listing', fair._id);
    const flags = await ModerationFlag.find().lean();
    expect(flags).toHaveLength(1);
    expect(String(flags[0]?.targetId)).toBe(String(cheap._id));
    expect(flags[0]?.reasons.map((item) => item.code)).toContain('price-outlier');
  });

  it('flag a placeholder price', async () => {
    const book = await createBook({ price: 1 });
    await scanContent('listing', book._id);
    expect((await ModerationFlag.findOne().lean())?.reasons.map((item) => item.code)).toContain('placeholder-price');
  });

  it('flag the same inline photo on another seller’s listing', async () => {
    await createBook({ sellerEmail: 'a@test.com', images: ['data:image/png;base64,SAME'] });
    const copy = await createBook({ sellerEmail: 'b@test.com', images: ['data:image/png;base64,SAME'] });
    const first = await createBook({ sellerEmail: 'a@test.com', images: ['data:image/png;base64,SAME'], title: 'Another' });
    await scanContent('listing', first._id);
    await scanContent('listing', copy._id);
    const flag = await ModerationFlag.findOne({ targetId: copy._id }).lean();
    expect(flag?.reasons.map((item) => item.code)).toContain('duplicate-photo');
  });

  it('never hides or changes a flagged listing', async () => {
    const book = await createBook({ desc: 'pdf copy available, whatsapp 01712345678' });
    await scanContent('listing', book._id);
    expect(await ModerationFlag.countDocuments()).toBe(1);
    const res = await request.get(`/book/${String(book._id)}`);
    expect(res.status).toBe(200);
    expect(res.body.desc).toContain('pdf copy');
  });
});

describe('reviews', () => {
  it('flag the same text from several accounts, and an ordinary short review not at all', async () => {
    const book = await createBook();
    const spam = 'Amazing book, visit my page for the best prices in Dhaka today!';
    await writeReview(book, 'x1@test.com', '', spam);
    const second = await writeReview(book, 'x2@test.com', '', spam);
    const fine = await writeReview(book, 'x3@test.com', 'Good', 'Nice');
    await scanContent('review', second._id);
    await scanContent('review', fine._id);
    const flag = await ModerationFlag.findOne({ targetId: second._id }).lean();
    expect(flag?.reasons.map((item) => item.code)).toEqual(expect.arrayContaining(['duplicate-text', 'promotion']));
    expect(await ModerationFlag.countDocuments({ targetId: fine._id })).toBe(0);
  });

  it('flag a review again only when it changes', async () => {
    const book = await createBook();
    const review = await writeReview(book, 'r@test.com', 'Bad', 'Call me 01712345678');
    expect((await scanContent('review', review._id)).outcome).toBe('created');
    expect((await scanContent('review', review._id)).outcome).toBe('unchanged');
    await ModerationFlag.updateOne({}, { status: 'cleared' });
    expect((await scanContent('review', review._id)).outcome).toBe('unchanged');
    await Review.updateOne({ _id: review._id }, { body: 'Call me 01812345678 now' });
    expect((await scanContent('review', review._id)).outcome).toBe('reopened');
    expect(await ModerationFlag.countDocuments()).toBe(1);
  });

  it('asks the model about wording, and flags what it labels', async () => {
    const calls = model('{"label":"personal_attack","confidence":0.9,"reason":"insults the seller"}');
    const book = await createBook();
    const review = await writeReview(book, 'r@test.com', 'Seller', 'The seller is an ugly old man who should not run a shop.');
    await scanContent('review', review._id);
    expect(calls).toHaveLength(1);
    const flag = await ModerationFlag.findOne().lean();
    expect(flag?.reasons[0]).toMatchObject({ code: 'model:personal_attack', source: 'model' });
  });

  it('treats a malformed or unsure model answer as no flag', async () => {
    model('this is not json');
    const book = await createBook();
    const review = await writeReview(book, 'r@test.com', 'Hmm', 'An ordinary review of a fine book indeed.');
    await scanContent('review', review._id);
    model('{"label":"spam","confidence":0.3,"reason":"maybe"}');
    await scanContent('review', review._id);
    expect(await ModerationFlag.countDocuments()).toBe(0);
  });

  it('removes contact details before the model sees the text', async () => {
    const calls = model('{"label":"ok","confidence":0.9,"reason":"fine"}');
    const book = await createBook();
    const review = await writeReview(book, 'r@test.com', 'Hi', 'Lovely book, mail me at me@example.com for more stories.');
    await scanContent('review', review._id);
    expect(calls.join('')).not.toContain('me@example.com');
  });
});

describe('the queue', () => {
  it('does nothing while moderation is off', async () => {
    process.env.MODERATION_MODE = 'off';
    const book = await createBook();
    await enqueueModeration('listing', book._id);
    expect(await ModerationJob.countDocuments()).toBe(0);
  });

  it('runs due jobs once, and keeps one pending job per item', async () => {
    const book = await createBook({ price: 1 });
    await enqueueModeration('listing', book._id);
    await enqueueModeration('listing', book._id);
    expect(await ModerationJob.countDocuments({ status: 'pending' })).toBe(1);
    expect(await runModerationOnce()).toBe(1);
    expect(await ModerationJob.countDocuments({ status: 'done' })).toBe(1);
    expect(await ModerationFlag.countDocuments()).toBe(1);
  });

  it('saves the rule flags and tries the model again later when it is busy', async () => {
    model({ status: 429 });
    const book = await createBook();
    const review = await writeReview(book, 'r@test.com', 'Hi', 'Whatsapp me for a cheaper copy of this lovely book.');
    await enqueueModeration('review', review._id);
    await runModerationOnce();
    const job = await ModerationJob.findOne().lean();
    expect(job).toMatchObject({ status: 'pending', attempts: 1, lastError: 'model-later' });
    expect(new Date(job?.runAfter ?? 0).getTime()).toBeGreaterThan(Date.now());
    expect(await ModerationFlag.countDocuments()).toBe(1);
  });

  it('never stands in the way of a chat message', async () => {
    vi.spyOn(ModerationJob, 'create').mockRejectedValue(new Error('database down'));
    await createUserWithToken({ email: 'alice@test.com', username: 'alice' });
    const bob = await createUserWithToken({ email: 'bob@test.com', username: 'bob' });
    const res = await request.post('/chat/message').set('Authorization', bob.auth).field('receiver', 'alice@test.com').field('message', 'Is it still there?');
    expect(res.status).toBe(201);
  });
});

describe('chat', () => {
  it('flags the same message sent to many people, by rules alone - never the model', async () => {
    const calls = model('{"label":"spam","confidence":1,"reason":"x"}');
    const spammer = await createUserWithToken({ email: 'spam@test.com', username: 'spammer' });
    for (let i = 0; i < 6; i += 1) {
      await ChatMessage.create({ sender: 'spam@test.com', receiver: `r${i}@test.com`, message: 'Cheap books at my page, message me now', timestamp: new Date() });
    }
    await scanContent('chat', spammer.user._id);
    expect(calls).toHaveLength(0);
    const flag = await ModerationFlag.findOne().lean();
    expect(flag?.reasons.map((item) => item.code)).toContain('chat-broadcast');
    expect(flag?.excerpt).toBe('');
    expect(flag?.messageIds.length).toBeGreaterThan(0);
  });
});

describe('the admin queue', () => {
  const setUp = async () => {
    const admin = await createUserWithToken({ email: 'admin@test.com', username: 'admin', role: 'admin' });
    const book = await createBook();
    const review = await writeReview(book, 'author@test.com', 'Bad', 'Call me on 01712345678 for a better deal');
    await scanContent('review', review._id);
    const flag = await ModerationFlag.findOne().lean();
    return { admin, book, review, flagId: String(flag?._id) };
  };

  it('is for administrators only', async () => {
    const user = await createUserWithToken({ email: 'u@test.com', username: 'u' });
    expect((await request.get('/moderation/flags').set('Authorization', user.auth)).status).toBe(403);
    expect((await request.get('/moderation/flags')).status).toBe(401);
  });

  it('lists open flags with their reasons and a link to the content', async () => {
    const { admin } = await setUp();
    const res = await request.get('/moderation/flags').set('Authorization', admin.auth);
    expect(res.status).toBe(200);
    expect(res.body.items[0]).toMatchObject({ targetType: 'review', exists: true, status: 'open' });
    expect(res.body.items[0].link).toMatch(/^\/book\/.+#reviews$/);
  });

  it('keeps shadow-mode flags out of the queue', async () => {
    process.env.MODERATION_MODE = 'shadow';
    const { admin } = await setUp();
    expect((await request.get('/moderation/flags').set('Authorization', admin.auth)).body.items).toHaveLength(0);
    expect((await request.get('/moderation/flags?shadow=1').set('Authorization', admin.auth)).body.items).toHaveLength(1);
    expect((await request.get('/moderation/stats').set('Authorization', admin.auth)).body.shadowOpen).toBe(1);

    // Switching moderation on brings the trial's open flags into the queue.
    process.env.MODERATION_MODE = 'on';
    expect((await request.get('/moderation/flags').set('Authorization', admin.auth)).body.items).toHaveLength(1);
    expect((await request.get('/moderation/stats').set('Authorization', admin.auth)).body.open.review).toBe(1);
  });

  it('clears a flag, and counts it against the rule’s precision', async () => {
    const { admin, flagId } = await setUp();
    const res = await request.post(`/moderation/flags/${flagId}/decision`).set('Authorization', admin.auth).send({ decision: 'cleared' });
    expect(res.status).toBe(200);
    const stats = await request.get('/moderation/stats').set('Authorization', admin.auth);
    expect(stats.body.rules.find((row: { code: string }) => row.code === 'contact-details')).toMatchObject({ cleared: 1, precision: 0 });
    expect(await AuditLog.countDocuments({ action: 'moderation.cleared' })).toBe(1);
  });

  it('records a removal only once the content is gone, then tells the author why', async () => {
    const { admin, flagId, book } = await setUp();
    const early = await request.post(`/moderation/flags/${flagId}/decision`).set('Authorization', admin.auth).send({ decision: 'removed', reason: 'Contact details' });
    expect(early.status).toBe(409);

    // The usual delete, as the admin page calls it.
    await request.delete(`/review/${String(book._id)}?email=author@test.com`).set('Authorization', admin.auth).expect(200);
    const done = await request.post(`/moderation/flags/${flagId}/decision`).set('Authorization', admin.auth).send({ decision: 'removed', reason: 'Contact details are not allowed in reviews.' });
    expect(done.status).toBe(200);
    const notice = await Notification.findOne({ recipient: 'author@test.com' }).lean();
    expect(notice?.type).toBe('shop-message');
    expect(JSON.stringify(notice)).toContain('Contact details are not allowed');
  });

  it('names what the usual delete takes: the book for a review, the seller for a rating', async () => {
    const { admin, flagId, book } = await setUp();
    expect((await request.get(`/moderation/flags/${flagId}`).set('Authorization', admin.auth)).body.subjectId).toBe(String(book._id));

    const seller = await createUserWithToken({ email: 'seller2@test.com', username: 'seller2' });
    const rating = await SellerReview.create({
      seller: seller.user._id,
      sellerEmail: seller.user.email,
      reviewerEmail: 'author@test.com',
      reviewerName: 'author',
      rating: 1,
      title: 'Bad',
      body: 'Call me on 01712345678 instead',
    });
    await scanContent('seller-review', rating._id);
    const flag = await ModerationFlag.findOne({ targetId: rating._id }).lean();
    const detail = await request.get(`/moderation/flags/${String(flag?._id)}`).set('Authorization', admin.auth);
    expect(detail.body.subjectId).toBe(String(seller.user._id));
  });

  it('clears many flags at once', async () => {
    const { admin, flagId } = await setUp();
    const res = await request.post('/moderation/flags/clear').set('Authorization', admin.auth).send({ ids: [flagId] });
    expect(res.body.cleared).toBe(1);
  });

  it('shows an administrator the flagged chat messages, and records that they looked', async () => {
    const admin = await createUserWithToken({ email: 'admin@test.com', username: 'admin', role: 'admin' });
    const spammer = await createUserWithToken({ email: 'spam@test.com', username: 'spammer' });
    for (let i = 0; i < 6; i += 1) {
      await ChatMessage.create({ sender: 'spam@test.com', receiver: `r${i}@test.com`, message: 'Cheap books at my page, message me now', timestamp: new Date() });
    }
    await scanContent('chat', spammer.user._id);
    const flag = await ModerationFlag.findOne().lean();
    const res = await request.get(`/moderation/flags/${String(flag?._id)}`).set('Authorization', admin.auth);
    expect(res.body.messages.length).toBeGreaterThan(0);
    expect(await AuditLog.countDocuments({ action: 'moderation.chat.viewed' })).toBe(1);
  });
});
