/**
 * Security events: each control's decision written as one JSON line, with
 * nothing in it that is a secret or names a person. The catalogue is
 * docs/SECURITY-EVENTS.md; these prove each event fires where it should and
 * that the answers the caller gets have not changed.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';

import { createTestContext, clearDatabase, closeTestContext, setCookies, type PrefixedRequest } from './helpers/testApp.js';
import { createUser, createUserWithToken, PASSWORD } from './helpers/factories.js';
import { makePhone, signedHeaders, REFRESH_PATH } from './helpers/appDevice.js';
import { captureSecurityEvents, type SecurityCapture } from './helpers/securityEvents.js';
import { hmacEmail, securityEvent } from '../utils/securityLog.js';

const { sendMail } = vi.hoisted(() => {
  process.env.SMTP_USER = 'tests@example.com';
  process.env.SMTP_PASS = 'test-password';
  return { sendMail: vi.fn() };
});
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail }) } }));

let request: PrefixedRequest;
let events: SecurityCapture;

beforeAll(async () => {
  ({ request } = await createTestContext());
  events = captureSecurityEvents();
});
afterAll(async () => {
  events.stop();
  await closeTestContext();
});

// Each test from its own address, so the sign-in rate limit counts it alone.
let clientIp = '';
let nextIp = 1;
beforeEach(async () => {
  await clearDatabase();
  sendMail.mockClear();
  events.clear();
  clientIp = `198.51.100.${nextIp++}`;
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

const from = <T extends { set: (name: string, value: string) => T }>(test: T): T => test.set('X-Forwarded-For', clientIp);
const post = (path: string) => from(request.post(path));
const put = (path: string) => from(request.put(path));
const get = (path: string) => from(request.get(path));

const EMAIL = 'reader@test.com';

const signIn = (email = EMAIL, password = PASSWORD) => post('/auth/signin').send({ email, password });

const lastCode = async (): Promise<string> => {
  const { mailSettled } = await import('../controllers/auth.controller.js');
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await Promise.all([mailSettled(), shopMailSettled()]);
  const text = String((sendMail.mock.calls.at(-1)?.[0] as { text?: string } | undefined)?.text ?? '');
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (!code) throw new Error('no code was sent');
  return code;
};

const cookieNamed = (res: { headers: Record<string, unknown> }, name: string): string =>
  setCookies(res as never).find((cookie) => cookie.startsWith(`${name}=`))?.split(';')[0] ?? '';

describe('the shape of an event', () => {
  it('carries the request id, the visitor, the route without its query, and a keyed hash of the address', async () => {
    await createUser({ email: EMAIL });
    const res = await post('/auth/signin?next=/secret-token').set('User-Agent', 'Probe/1.0').send({ email: 'Reader@Test.com', password: 'wrong' });

    const [line] = events.of('auth.signin.failure');
    expect(line).toMatchObject({
      log_type: 'security',
      event: { action: 'auth.signin.failure', category: 'authentication', outcome: 'failure', severity: 'low', reason: 'bad_password' },
      request_id: res.headers['x-request-id'],
      source: { ip: clientIp },
      user_agent: 'Probe/1.0',
      client: 'web',
      http: { method: 'POST', route: '/api/auth/signin' },
      user: { email_hash: hmacEmail(EMAIL) },
    });
    expect(line.time).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(events.raw.join('')).not.toMatch(/reader@test\.com/i);
    expect(events.raw.join('')).not.toContain('wrong');
  });

  it('hashes an address the same whatever its case, and differently under another key', () => {
    expect(hmacEmail('Reader@Test.com')).toBe(hmacEmail('reader@test.com'));
    expect(hmacEmail('reader@test.com')).toMatch(/^[0-9a-f]{64}$/);
    expect(hmacEmail('reader@test.com', 'another-key')).not.toBe(hmacEmail('reader@test.com'));
  });

  it('never throws, whatever the request is missing', () => {
    expect(() => securityEvent(undefined, 'auth.token.invalid')).not.toThrow();
    expect(() => securityEvent({}, 'auth.token.invalid', { email: 'a@test.com' })).not.toThrow();
    expect(() => securityEvent({ headers: {} }, 'authz.denied')).not.toThrow();
    expect(events.of('auth.token.invalid')).toHaveLength(2);
    expect(events.of('auth.token.invalid')[0].client).toBe('web');
  });

  it('records the Android app by its own header, and anything else that claims a client as "other"', async () => {
    await createUser({ email: EMAIL });
    await post('/auth/signin').set('X-Client', 'android/10203').send({ email: EMAIL, password: 'wrong' });
    await post('/auth/signin').set('X-Client', '<script>').send({ email: EMAIL, password: 'wrong' });

    expect(events.of('auth.signin.failure').map((line) => line.client)).toEqual(['android/10203', 'other']);
  });
});

describe('sign-in', () => {
  it('logs five wrong passwords and the lock they start, and the answers stay as they were', async () => {
    const user = await createUser({ email: EMAIL });
    const answers = [];
    for (let i = 0; i < 5; i += 1) answers.push(await signIn(EMAIL, 'wrong'));

    expect(answers.map((res) => res.status)).toEqual([401, 401, 401, 401, 401]);
    expect(new Set(answers.map((res) => res.body.message))).toEqual(new Set(['Invalid email or password']));
    const failures = events.of('auth.signin.failure');
    expect(failures).toHaveLength(5);
    expect(failures.every((line) => line.event.reason === 'bad_password' && line.user?.id === String(user._id))).toBe(true);
    expect(events.of('auth.lockout')).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ severity: 'high', reason: 'too_many_failures' }) }),
    ]);
  });

  it('logs an attempt while locked, with the same 429 as before', async () => {
    await createUser({ email: EMAIL });
    for (let i = 0; i < 5; i += 1) await signIn(EMAIL, 'wrong');
    events.clear();

    const locked = await signIn(EMAIL, PASSWORD);

    expect(locked.status).toBe(429);
    expect(locked.body.message).toMatch(/^Too many wrong passwords\. Try again in \d+ minutes?, or reset your password\.$/);
    expect(events.of('auth.lockout')).toEqual([expect.objectContaining({ event: expect.objectContaining({ reason: 'locked' }) })]);
    expect(events.of('auth.signin.failure')).toHaveLength(0);
  });

  it('tells an unknown address from a wrong password in the log, never in the answer', async () => {
    const res = await signIn('nobody@test.com', 'wrong');

    expect(res.body.message).toBe('Invalid email or password');
    const [line] = events.of('auth.signin.failure');
    expect(line.event.reason).toBe('unknown_user');
    expect(line.user).toEqual({ email_hash: hmacEmail('nobody@test.com') });
  });

  it('logs a sign-in, and whether the browser is new to the account', async () => {
    const user = await createUser({ email: EMAIL });
    const first = await signIn();
    const device = cookieNamed(first, 'device');
    await signIn().set('Cookie', device);

    expect(events.of('auth.signin.success').map((line) => [line.user?.id, line.extra])).toEqual([
      [String(user._id), { method: 'password', new_browser: true }],
      [String(user._id), { method: 'password', new_browser: false }],
    ]);
  });

  it('logs the same events from the Android app, marked as the app', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    await post('/api/v1/app/auth/signin').set('X-Client', 'android/100').send({ email: EMAIL, password: 'wrong', device: phone.device });
    const ok = await post('/api/v1/app/auth/signin').set('X-Client', 'android/100').send({ email: EMAIL, password: PASSWORD, device: phone.device });

    expect(ok.status).toBe(200);
    expect(events.of('auth.signin.failure')[0]).toMatchObject({ client: 'android/100', http: { route: '/api/v1/app/auth/signin' } });
    expect(events.of('auth.signin.success')[0]).toMatchObject({ client: 'android/100', extra: { method: 'password', new_browser: true } });
  });

  it('logs the promotion of an ADMIN_EMAILS address', async () => {
    const admin = await createUser({ email: 'admin@test.com', role: 'user' });
    await signIn('admin@test.com');

    expect(events.of('admin.role.granted')).toEqual([
      expect.objectContaining({ user: { id: String(admin._id), email_hash: hmacEmail('admin@test.com') } }),
    ]);
  });
});

describe('two-step sign-in', () => {
  it('logs a wrong code, then the right one and the session it starts', async () => {
    const user = await createUser({ email: EMAIL });
    const User = (await import('../models/user.model.js')).default;
    await User.updateOne({ _id: user._id }, { twoFactor: true });
    const challenge = await signIn();
    expect(challenge.body).toMatchObject({ twoFactor: true });
    const code = await lastCode();

    const wrong = await post('/auth/signin/verify').send({ email: EMAIL, code: code === '111111' ? '222222' : '111111' });
    const right = await post('/auth/signin/verify').send({ email: EMAIL, code });

    expect([wrong.status, right.status]).toEqual([400, 200]);
    expect(events.of('auth.2fa.failure')).toEqual([expect.objectContaining({ event: expect.objectContaining({ severity: 'medium' }) })]);
    expect(events.of('auth.2fa.success')).toHaveLength(1);
    expect(events.of('auth.signin.success')[0].extra).toMatchObject({ method: 'two_step' });
  });
});

describe('one-time codes and password reset', () => {
  it('logs a code sent, a wrong one, and the reset, and never the code', async () => {
    const user = await createUser({ email: EMAIL });
    await post('/auth/send-otp').send({ email: EMAIL, purpose: 'reset' });
    const code = await lastCode();
    await post('/auth/verify-otp').send({ email: EMAIL, code: code === '111111' ? '222222' : '111111' });
    const reset = await post('/auth/reset-password').send({ email: EMAIL, otp: code, newPassword: 'Another-Lantern-77!' });

    expect(reset.status).toBe(200);
    expect(events.of('auth.otp.sent')[0].extra).toEqual({ purpose: 'reset' });
    expect(events.of('auth.otp.failure')[0]).toMatchObject({ event: { reason: 'invalid_code' }, extra: { step: 'verify' } });
    expect(events.of('auth.password.reset')[0].user?.id).toBe(String(user._id));
    expect(events.raw.join('')).not.toContain(code);
    expect(events.raw.join('')).not.toContain('Another-Lantern-77!');
  });

  it('logs nothing as sent when no code goes out', async () => {
    await post('/auth/send-otp').send({ email: 'nobody@test.com', purpose: 'reset' });

    expect(events.of('auth.otp.sent')).toHaveLength(0);
  });
});

describe('bot check and Google', () => {
  it('logs a failed bot check', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    const res = await signIn();

    expect(res.status).toBe(400);
    expect(events.of('turnstile.failed')).toEqual([expect.objectContaining({ event: expect.objectContaining({ reason: 'missing' }) })]);
  });

  it('logs a Google callback whose state does not match, but not a sign-in the person cancelled', async () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
    const forged = await get('/auth/google/callback?code=abc&state=forged');
    await get('/auth/google/callback?error=access_denied');

    expect(forged.headers.location).toBe('/sign-in#google-error=expired');
    const failures = events.of('auth.google.failure');
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ event: { reason: 'expired' }, http: { route: '/api/auth/google/callback' } });
    expect(events.raw.join('')).not.toContain('forged');
  });
});

describe('sessions and tokens', () => {
  it('logs a refresh token presented a second time', async () => {
    await createUser({ email: EMAIL });
    const cookie = cookieNamed(await signIn(), 'refreshToken');
    await post('/auth/refresh').set('Cookie', cookie);
    const replay = await post('/auth/refresh').set('Cookie', cookie);

    expect(replay.status).toBe(401);
    expect(events.of('session.refresh.reuse_detected')).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ severity: 'high', reason: 'reused' }) }),
    ]);
    expect(events.raw.join('')).not.toContain(cookie.split('=')[1]);
  });

  it("logs an Android refresh without its phone's signature", async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const signedIn = await post('/api/v1/app/auth/signin').set('X-Client', 'android/100').send({ email: EMAIL, password: PASSWORD, device: phone.device });
    const refreshToken = String(signedIn.body.refreshToken);

    const res = await post(REFRESH_PATH).set('X-Client', 'android/100').set(signedHeaders(makePhone(), refreshToken)).send({ refreshToken });

    expect(res.status).toBe(401);
    expect(events.of('session.refresh.device_mismatch')).toEqual([expect.objectContaining({ client: 'android/100' })]);
    expect(events.raw.join('')).not.toContain(refreshToken);
  });

  it('logs an access token this server did not sign, but not one that has simply expired', async () => {
    const user = await createUser({ email: EMAIL });
    const expired = jwt.sign({ sub: String(user._id), email: EMAIL, role: 'user' }, String(process.env.JWT_SECRET), { expiresIn: -10 });
    const forged = jwt.sign({ sub: String(user._id), email: EMAIL, role: 'admin' }, 'not-our-secret-not-our-secret-not-ours');

    const answers = [
      await get('/user/me/export').set('Authorization', `Bearer ${expired}`),
      await get('/user/me/export').set('Authorization', `Bearer ${forged}`),
      await get('/user/me/export').set('Authorization', 'Bearer not.a.token'),
    ];

    expect(answers.map((res) => res.status)).toEqual([401, 401, 401]);
    expect(events.of('auth.token.invalid')).toHaveLength(2);
    expect(events.raw.join('')).not.toContain(forged);
  });

  it('logs signing out everywhere else, with how many sessions ended', async () => {
    const user = await createUser({ email: EMAIL });
    await signIn();
    const current = await signIn();
    await post('/auth/logout-others').set('Authorization', `Bearer ${String(current.body.token)}`).set('Cookie', cookieNamed(current, 'refreshToken'));

    expect(events.of('session.logout_others')).toEqual([
      expect.objectContaining({ user: { id: String(user._id) }, extra: { sessions_ended: 1 } }),
    ]);
  });
});

describe('account changes', () => {
  it('logs a changed bKash number without the number', async () => {
    const { user, auth } = await createUserWithToken({ email: EMAIL, bkashMerchant: '01710000009' });
    const res = await put('/user/profile').set('Authorization', auth).field('bkashMerchant', '01899998888').field('currentPassword', PASSWORD);

    expect(res.status).toBe(200);
    expect(events.of('account.bkash.changed')).toEqual([
      expect.objectContaining({ user: { id: String(user._id) }, extra: { change: 'changed' } }),
    ]);
    const written = events.raw.join('');
    expect(written).not.toContain('01899998888');
    expect(written).not.toContain('01710000009');
  });

  it('logs a wrong current password, and a changed password', async () => {
    const { auth } = await createUserWithToken({ email: EMAIL });
    const refused = await put('/user/profile').set('Authorization', auth).field('password', 'Another-Lantern-77!').field('currentPassword', 'wrong');
    const changed = await put('/user/profile').set('Authorization', auth).field('password', 'Another-Lantern-77!').field('currentPassword', PASSWORD);

    expect([refused.status, changed.status]).toEqual([403, 200]);
    expect(events.of('account.reauth.failure')[0]).toMatchObject({ event: { reason: 'bad_password' }, extra: { change: 'password' } });
    expect(events.of('account.password.changed')).toHaveLength(1);
    expect(events.raw.join('')).not.toContain('Another-Lantern-77!');
  });

  it('logs two-step sign-in turned on and off', async () => {
    const { auth } = await createUserWithToken({ email: EMAIL });
    await put('/user/me/two-factor').set('Authorization', auth).send({ enabled: true });
    await put('/user/me/two-factor').set('Authorization', auth).send({ enabled: false, password: PASSWORD });

    expect(events.of('account.2fa.enabled')).toHaveLength(1);
    expect(events.of('account.2fa.disabled')).toEqual([expect.objectContaining({ event: expect.objectContaining({ severity: 'medium' }) })]);
  });

  it('logs a change of address with hashes of both, and neither address', async () => {
    const { auth } = await createUserWithToken({ email: EMAIL });
    await post('/user/me/email').set('Authorization', auth).send({ newEmail: 'moved@test.com', password: PASSWORD });
    const code = await lastCode();
    const res = await post('/user/me/email/confirm').set('Authorization', auth).send({ code });

    expect(res.status).toBe(200);
    expect(events.of('account.email.changed')).toEqual([
      expect.objectContaining({ user: expect.objectContaining({ email_hash: hmacEmail(EMAIL) }), extra: { new_email_hash: hmacEmail('moved@test.com') } }),
    ]);
    expect(events.raw.join('')).not.toMatch(/reader@test\.com|moved@test\.com/);
  });

  it('logs a data export and an account deletion', async () => {
    const { auth } = await createUserWithToken({ email: EMAIL, bkashMerchant: null });
    await get('/user/me/export').set('Authorization', auth);
    const deleted = await from(request.delete('/user/me')).set('Authorization', auth).send({ password: PASSWORD });

    expect(deleted.status).toBe(200);
    expect(events.of('account.data_exported')).toHaveLength(1);
    expect(events.of('account.deleted')).toHaveLength(1);
  });
});

describe('access control', () => {
  it('logs a member calling an administrator route', async () => {
    const { auth } = await createUserWithToken();
    const res = await get('/admin/analytics').set('Authorization', auth);

    expect(res.status).toBe(403);
    expect(res.body).toEqual({ message: 'Administrator access required' });
    expect(events.of('authz.denied')).toEqual([
      expect.objectContaining({ event: expect.objectContaining({ reason: 'not_admin' }), extra: { required_role: 'admin' } }),
    ]);
  });

  it("logs a member reaching for another member's listing", async () => {
    const { createBook } = await import('./helpers/factories.js');
    const book = await createBook({ sellerEmail: 'seller@test.com' });
    const { auth } = await createUserWithToken();
    const res = await put(`/book/update-stock/${String(book._id)}`).set('Authorization', auth).send({ stock: 1 });

    expect(res.status).toBe(403);
    expect(events.of('authz.denied')[0]).toMatchObject({ event: { reason: 'not_owner' }, extra: { resource_type: 'book' } });
  });

  it('logs image URLs that are not ours, which are dropped as before', async () => {
    const { collectImages } = await import('../utils/uploadedImages.js');
    const collected = collectImages({ body: { images: ['https://evil.example/x.png'] }, files: [], method: 'POST', originalUrl: '/api/user/add-book' });

    expect(collected.images).toEqual([]);
    expect(events.of('upload.url_rejected')).toEqual([expect.objectContaining({ extra: { dropped: 1 } })]);
  });
});

describe('administrator actions', () => {
  it('logs deleting a member, naming both by id', async () => {
    const admin = await createUserWithToken({ email: 'boss@test.com', role: 'admin' });
    const member = await createUser({ bkashMerchant: null });
    const res = await from(request.delete(`/user/${String(member._id)}`)).set('Authorization', admin.auth);

    expect(res.status).toBe(200);
    expect(events.of('admin.user.deleted')).toEqual([
      expect.objectContaining({ user: { id: String(admin.user._id) }, extra: { target_user_id: String(member._id), target_role: 'user' } }),
    ]);
  });

  it('logs a payout recorded, by order, without the bKash number', async () => {
    const Order = (await import('../models/Order.model.js')).default;
    const admin = await createUserWithToken({ email: 'boss@test.com', role: 'admin' });
    await createUser({ email: 'seller@test.com', bkashMerchant: '01712345678' });
    await Order.create({
      orderNumber: 'PAYOUT0000000001',
      status: 'Delivered',
      deliveredAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      buyerEmail: 'buyer@test.com',
      sellerEmail: 'seller@test.com',
      bookId: new mongoose.Types.ObjectId(),
      title: 'Book',
      price: 1000,
      quantity: 1,
    });

    const res = await post('/order/admin/payouts/paid')
      .set('Authorization', admin.auth)
      .send({ orderNumber: 'PAYOUT0000000001', sellerEmail: 'seller@test.com', reference: '8n7a2b3c4d' });

    expect(res.status).toBe(200);
    expect(events.of('admin.payout.recorded')).toEqual([
      expect.objectContaining({ extra: { order_number: 'PAYOUT0000000001', lines: 1, amount: 950 } }),
    ]);
    expect(events.raw.join('')).not.toMatch(/01712345678|seller@test\.com/);
  });

  it('logs a message sent, with its audience and how many it reached', async () => {
    const admin = await createUserWithToken({ email: 'boss@test.com', role: 'admin' });
    await createUser();
    await createUser();
    const res = await post('/admin/message')
      .set('Authorization', admin.auth)
      .send({ channel: 'notification', audience: 'all', title: 'Hello', body: 'News from the shop' });

    expect(res.status).toBe(200);
    expect(events.of('admin.message.sent')).toEqual([
      expect.objectContaining({ extra: { audience: 'all', channel: 'notification', recipient_count: 2 } }),
    ]);
  });
});
