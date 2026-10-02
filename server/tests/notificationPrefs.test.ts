/**
 * Notification choices: people turn categories off in the app or by e-mail,
 * and what they turned off stops arriving. Account and security mail always
 * arrives.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUserWithToken } from './helpers/factories.js';
import Notification from '../models/Notification.model.js';
import Order from '../models/Order.model.js';

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

const outbox = async () => {
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await shopMailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string });
};

const settings = (auth: string) => request.get('/user/me/notifications').set('Authorization', auth);
const save = (auth: string, prefs: Record<string, { inApp: boolean; email: boolean }>) =>
  request.put('/user/me/notifications').set('Authorization', auth).send({ prefs });

describe('notification choices', () => {
  it('start with everything on, and show administrators their own category', async () => {
    const buyer = await createUserWithToken({ email: BUYER });
    const admin = await createUserWithToken({ email: 'admin@test.com', role: 'admin' });

    const mine = await settings(buyer.auth);
    expect(mine.status).toBe(200);
    expect(mine.body.categories.every((c: { inApp: boolean }) => c.inApp)).toBe(true);
    expect(mine.body.categories.map((c: { id: string }) => c.id)).not.toContain('moderation');
    // Only what ever reaches an administrator: no payouts, Wanted board,
    // invitations or shop news, which they never get.
    expect((await settings(admin.auth)).body.categories.map((c: { id: string }) => c.id)).toEqual(['orders', 'returns', 'moderation']);
  });

  it('keep what was turned off, and only known categories', async () => {
    const buyer = await createUserWithToken({ email: BUYER });
    const res = await save(buyer.auth, { deals: { inApp: false, email: false }, nonsense: { inApp: false, email: false } });
    expect(res.status).toBe(200);
    const deals = res.body.categories.find((c: { id: string }) => c.id === 'deals');
    expect(deals).toMatchObject({ inApp: false, email: false });
    expect(res.body.categories.find((c: { id: string }) => c.id === 'nonsense')).toBeUndefined();
  });

  it('stop order notifications and e-mails for whoever turned them off', async () => {
    const buyer = await createUserWithToken({ email: BUYER });
    await createUserWithToken({ email: SELLER, bkashMerchant: '01710000001' });
    const book = await createBook({ sellerEmail: SELLER, stock: 5 });
    await save(buyer.auth, { orders: { inApp: false, email: false } });

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .send({ items: [{ bookId: String(book._id), quantity: 1 }], deliveryDistrict: 'Dhaka' });
    expect(res.status).toBe(200);

    expect(await Notification.countDocuments({ recipient: BUYER, type: 'order-placed' })).toBe(0);
    expect(await Notification.countDocuments({ recipient: SELLER, type: 'order-received' })).toBe(1);
    const mail = await outbox();
    expect(mail.some((m) => m.to === BUYER)).toBe(false);
    expect(mail.some((m) => m.to === SELLER)).toBe(true);
  });

  it('let people turn off news from the shop, but not a message sent to them', async () => {
    const buyer = await createUserWithToken({ email: BUYER, bkashMerchant: null });
    const admin = await createUserWithToken({ email: 'admin@test.com', role: 'admin' });
    await save(buyer.auth, { announcements: { inApp: false, email: false } });

    const broadcast = await request
      .post('/admin/message')
      .set('Authorization', admin.auth)
      .send({ channel: 'both', audience: 'buyers', title: 'Eid sale', body: 'Ten per cent off.' });
    expect(broadcast.body).toMatchObject({ notified: 0, emailed: 0 });

    const direct = await request
      .post('/admin/message')
      .set('Authorization', admin.auth)
      .send({ channel: 'both', audience: 'users', emails: [BUYER], title: 'About your order', body: 'It ships tomorrow.' });
    expect(direct.body).toMatchObject({ notified: 1, emailed: 1 });
    expect(await Notification.countDocuments({ recipient: BUYER, type: 'shop-message' })).toBe(1);
  });
});

describe('a payout', () => {
  const payOut = async (sellerPrefs?: Record<string, { inApp: boolean; email: boolean }>) => {
    const admin = await createUserWithToken({ email: 'admin@test.com', role: 'admin' });
    const seller = await createUserWithToken({ email: SELLER });
    if (sellerPrefs) await save(seller.auth, sellerPrefs);
    const book = await createBook({ sellerEmail: SELLER });
    await Order.create({
      orderNumber: 'PAYOUT0000000001',
      status: 'Delivered',
      deliveredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      buyerEmail: BUYER,
      sellerEmail: SELLER,
      bookId: book._id,
      title: 'Gitanjali',
      price: 1000,
      quantity: 1,
    });
    const res = await request
      .post('/order/admin/payouts/paid')
      .set('Authorization', admin.auth)
      .send({ orderNumber: 'PAYOUT0000000001', sellerEmail: SELLER, reference: '8n7a2b3c4d' });
    expect(res.status).toBe(200);
    return (await outbox()).filter((m) => m.to === SELLER);
  };

  it('is e-mailed to the seller by default, with the amount and transaction ID', async () => {
    const mail = await payOut();
    expect(mail.map((m) => m.subject)).toContain('You have been paid 950 Tk for order PAYOUT0000000001');
    expect((sendMail.mock.calls.at(-1)?.[0] as { text: string }).text).toMatch(/8N7A2B3C4D/);
  });

  it('is not e-mailed to a seller who turned payout e-mails off, but still notified', async () => {
    const mail = await payOut({ payouts: { inApp: true, email: false } });
    expect(mail.filter((m) => /paid/.test(m.subject))).toHaveLength(0);
    expect(await Notification.countDocuments({ recipient: SELLER, type: 'payout' })).toBe(1);
  });
});
