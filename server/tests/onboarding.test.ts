/**
 * A new member's welcome: an e-mail, a tour of the shop, and their profile
 * set-up, both as notifications.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { PASSWORD } from './helpers/factories.js';
import Notification from '../models/Notification.model.js';

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

const settled = async () => {
  const { mailSettled } = await import('../controllers/auth.controller.js');
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await Promise.all([mailSettled(), shopMailSettled()]);
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });
};

/** The whole sign-up: a code, its check, and the account. */
const signUp = async (email: string, username: string) => {
  await request.post('/auth/send-otp').send({ email, username, purpose: 'register' });
  const code = /\b(\d{6})\b/.exec((await settled()).at(-1)?.text ?? '')?.[1];
  await request.post('/auth/verify-otp').send({ email, code });
  return request.post('/auth/signup').send({ email, username, password: PASSWORD });
};

describe('a new member', () => {
  it('gets a welcome e-mail, a tour and a set-up reminder', async () => {
    const res = await signUp('newreader@test.com', 'newreader');
    expect(res.status).toBe(201);

    const mail = await settled();
    const welcome = mail.find((m) => m.subject.startsWith('Welcome to BookStoreBD'));
    expect(welcome).toMatchObject({ to: 'newreader@test.com' });
    expect(welcome?.text).toMatch(/Thank you for joining BookStoreBD/);

    const notes = await Notification.find({ recipient: 'newreader@test.com', type: 'welcome' }).sort({ _id: -1 }).lean();
    expect(notes.map((n) => n.link)).toEqual(['/how-it-works', '/profile#setup']);
  });
});
