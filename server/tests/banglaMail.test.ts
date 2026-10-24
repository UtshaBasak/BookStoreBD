/**
 * E-mails arrive in the language the recipient reads: their account's, or
 * the request's where there is no account yet.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUserWithToken, CHECKOUT } from './helpers/factories.js';
import User from '../models/user.model.js';
import { codeEmail } from '../utils/emailTemplates.js';

const { sendMail } = vi.hoisted(() => {
  process.env.SMTP_USER = 'tests@example.com';
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

type Sent = { to: string; subject: string; text: string; html: string };

const BANGLA = /[ঀ-৿]/;

const outbox = async (): Promise<Sent[]> => {
  const { mailSettled } = await import('../controllers/auth.controller.js');
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await Promise.all([mailSettled(), shopMailSettled()]);
  return sendMail.mock.calls.map(([mail]) => mail as Sent);
};

const orderAs = async (language: 'en' | 'bn') => {
  const buyer = await createUserWithToken({ email: 'buyer@test.com', bkashMerchant: null });
  await User.updateOne({ _id: buyer.user._id }, { $set: { language } });
  const book = await createBook({ sellerEmail: 'seller@test.com', stock: 3 });
  const res = await request
    .post('/order/decrease-stock')
    .set('Authorization', buyer.auth)
    .send({ ...CHECKOUT, items: [{ bookId: String(book._id), quantity: 1 }] });
  expect(res.status).toBe(200);
  const mail = (await outbox()).find((sent) => sent.to === 'buyer@test.com');
  expect(mail).toBeDefined();
  return { mail: mail as Sent, orderNumber: String(res.body.orderNumber) };
};

describe('the order e-mail', () => {
  it('is in Bangla for an account that reads Bangla', async () => {
    const { mail, orderNumber } = await orderAs('bn');

    expect(mail.subject).toMatch(BANGLA);
    expect(mail.subject).toContain(orderNumber);
    expect(mail.text).toMatch(BANGLA);
    expect(mail.text).toContain('টাকা');
    expect(mail.html).toContain('<html lang="bn">');
  });

  it('is in English for an account that reads English', async () => {
    const { mail, orderNumber } = await orderAs('en');

    expect(mail.subject).toBe(`Order ${orderNumber} is confirmed`);
    expect(mail.subject).not.toMatch(BANGLA);
    expect(mail.html).toContain('<html lang="en">');
  });
});

describe('a sign-up code', () => {
  it('arrives in Bangla when the request asks for Bangla', async () => {
    const res = await request.post('/auth/send-otp').set('Accept-Language', 'bn').send({
      email: 'newreader@test.com',
      username: 'newreader',
      purpose: 'register',
    });
    expect(res.status).toBe(200);

    const [mail] = await outbox();
    expect(mail?.subject).toMatch(BANGLA);
    expect(mail?.html).toContain('lang="bn"');
    expect(mail?.text).toMatch(/\b\d{6}\b/);
  });

  it('arrives in English when the request names no language', async () => {
    await request.post('/auth/send-otp').send({ email: 'newreader@test.com', username: 'newreader', purpose: 'register' });

    const [mail] = await outbox();
    expect(mail?.subject).toBe('Your BookStoreBD sign-up code');
  });
});

describe('the templates', () => {
  it('write the minutes in Bangla digits, and keep the code as it is', () => {
    const mail = codeEmail('reset', '490870')('bn');

    expect(mail.text).toContain('490870');
    expect(mail.text).toMatch(/[০-৯]+ মিনিট/);
  });
});
