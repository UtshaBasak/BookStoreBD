/**
 * A whole visit - signing up, signing in, filling in a profile, buying a book
 * and changing the password - with every request line and security event
 * read back, and none of them holding a secret or a personal detail.
 *
 * Its own file, apart from regressions.test.ts, because it needs e-mail
 * switched on to receive its codes, which would change what the tests there
 * see.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import pino from 'pino';
import supertest from 'supertest';

import { createTestContext, closeTestContext, setCookies } from './helpers/testApp.js';
import { createBook, CHECKOUT } from './helpers/factories.js';
import { captureSecurityEvents, type SecurityCapture } from './helpers/securityEvents.js';

const { sendMail } = vi.hoisted(() => {
  process.env.SMTP_USER = 'tests@example.com';
  process.env.SMTP_PASS = 'test-password';
  return { sendMail: vi.fn() };
});
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

const EMAIL = 'private.person@test.com';
const USERNAME = 'private_person';
const PASSWORD = 'Secret-Quokka-Garden-93!';
const NEW_PASSWORD = 'Hidden-Walrus-Meadow-58!';
const PHONE = '01876543210';
const ADDRESS = 'House 7, Quiet Lane, Gulshan';
const BKASH = '01998877665';

let agent: ReturnType<typeof supertest>;
let events: SecurityCapture;
const requestLines: string[] = [];

beforeAll(async () => {
  await createTestContext();
  const { createApp } = await import('../app.js');
  const { createRequestLogger } = await import('../middleware/requestLogger.js');
  const capturing = pino({ level: 'info' }, { write: (line: string) => void requestLines.push(line) });
  agent = supertest(createApp({ requestLogger: createRequestLogger(capturing) }));
  events = captureSecurityEvents();
});
afterAll(async () => {
  events.stop();
  await closeTestContext();
});

const lastCode = async (): Promise<string> => {
  const { mailSettled } = await import('../controllers/auth.controller.js');
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await Promise.all([mailSettled(), shopMailSettled()]);
  const text = String((sendMail.mock.calls.at(-1)?.[0] as { text?: string } | undefined)?.text ?? '');
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (!code) throw new Error('no code was sent');
  return code;
};

const cookieValue = (res: supertest.Response, name: string): string =>
  setCookies(res).find((cookie) => cookie.startsWith(`${name}=`))?.split(';')[0].split('=')[1] ?? '';

describe('what a visit leaves in the logs', () => {
  it('holds no password, code, token, cookie, address, phone or bKash number', async () => {
    const secrets: string[] = [PASSWORD, NEW_PASSWORD, EMAIL, PHONE, ADDRESS, BKASH];

    // Sign up.
    await agent.post('/api/auth/send-otp').send({ email: EMAIL, username: USERNAME, purpose: 'register' });
    const signupCode = await lastCode();
    secrets.push(signupCode);
    await agent.post('/api/auth/verify-otp').send({ email: EMAIL, code: signupCode });
    const signedUp = await agent.post('/api/auth/signup').send({ username: USERNAME, email: EMAIL, password: PASSWORD });
    expect(signedUp.status).toBe(201);
    secrets.push(String(signedUp.body.token), cookieValue(signedUp, 'refreshToken'));

    // A mistyped password, then the right one.
    await agent.post('/api/auth/signin').send({ email: EMAIL, password: `${PASSWORD}x` });
    const signedIn = await agent.post('/api/auth/signin').send({ email: EMAIL, password: PASSWORD });
    expect(signedIn.status).toBe(200);
    const token = String(signedIn.body.token);
    const refreshCookie = cookieValue(signedIn, 'refreshToken');
    const deviceCookie = cookieValue(signedUp, 'device');
    secrets.push(token, refreshCookie, deviceCookie, `${PASSWORD}x`);
    const auth = `Bearer ${token}`;

    // A refresh, and the lookups that put an address in the URL.
    const refreshed = await agent.post('/api/auth/refresh').set('Cookie', `refreshToken=${refreshCookie}`);
    secrets.push(String(refreshed.body.token), cookieValue(refreshed, 'refreshToken'));
    await agent.get(`/api/user/profile?email=${encodeURIComponent(EMAIL)}`).set('Authorization', auth);
    await agent.get(`/api/book/seller/${encodeURIComponent(EMAIL)}`);

    // The profile, with everything personal in it.
    const profile = await agent
      .put('/api/user/profile')
      .set('Authorization', auth)
      .field('phone', PHONE)
      .field('address', ADDRESS)
      .field('bkashMerchant', BKASH);
    expect(profile.status).toBe(200);

    // A purchase, delivered to that address.
    const book = await createBook({ stock: 2 });
    const bought = await agent
      .post('/api/order/decrease-stock')
      .set('Authorization', auth)
      .send({ ...CHECKOUT, contactPhone: PHONE, deliveryAddress: ADDRESS, items: [{ bookId: String(book._id), quantity: 1 }] });
    expect(bought.status).toBe(200);

    // A new password.
    const changed = await agent
      .put('/api/user/profile')
      .set('Authorization', auth)
      .field('password', NEW_PASSWORD)
      .field('currentPassword', PASSWORD);
    expect(changed.status).toBe(200);

    // Something was written, or the assertions below would prove nothing.
    expect(requestLines.length).toBeGreaterThan(10);
    expect(events.of('auth.signin.success').length).toBeGreaterThan(0);
    expect(events.of('account.bkash.changed')).toHaveLength(1);
    expect(events.of('account.password.changed')).toHaveLength(1);

    const written = [...requestLines, ...events.raw].join('\n');
    for (const secret of secrets.filter(Boolean)) {
      expect(written, `found ${secret.slice(0, 12)}... in a log line`).not.toContain(secret);
      expect(written).not.toContain(encodeURIComponent(secret));
    }
    expect(written).not.toMatch(/private\.person/i);
  });
});
