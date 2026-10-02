/**
 * Defences against account takeover: a lock after repeated wrong passwords,
 * the current password for changing the password or the payout number, other
 * sessions ended when the password changes, an alert for a sign-in from a new
 * browser, and a way to sign out everywhere else.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import bcryptjs from 'bcryptjs';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';
import RefreshToken from '../models/RefreshToken.model.js';
import User from '../models/user.model.js';
import { describeBrowser } from '../utils/deviceAlert.js';
import { MAX_FAILURES } from '../utils/loginLock.js';

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

const EMAIL = 'reader@test.com';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';
const outbox = async () => {
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await shopMailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });
};
const cookieOf = (res: { headers: Record<string, unknown> }, name: string): string =>
  ((res.headers['set-cookie'] as string[] | undefined) ?? []).find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';
const signIn = (password = PASSWORD, cookie = '') =>
  request.post('/auth/signin').set('User-Agent', CHROME).set('Cookie', cookie).send({ email: EMAIL, password });

describe('repeated wrong passwords', () => {
  it('lock the address for a while, the right password included', async () => {
    await createUser({ email: EMAIL });
    for (let i = 0; i < MAX_FAILURES; i += 1) expect((await signIn('Wrong-Password-1!')).status).toBe(401);
    const locked = await signIn();
    expect(locked.status).toBe(429);
    expect(locked.body.message).toMatch(/try again in 15 minutes/i);
  });

  it('lock an address with no account the same way, so a lock says nothing', async () => {
    for (let i = 0; i < MAX_FAILURES; i += 1) await request.post('/auth/signin').send({ email: 'nobody@test.com', password: 'x' });
    expect((await request.post('/auth/signin').send({ email: 'nobody@test.com', password: 'x' })).status).toBe(429);
  });

  it('start again after a right password', async () => {
    await createUser({ email: EMAIL });
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) await signIn('Wrong-Password-1!');
    expect((await signIn()).status).toBe(200);
    for (let i = 0; i < MAX_FAILURES - 1; i += 1) await signIn('Wrong-Password-1!');
    expect((await signIn()).status).toBe(200);
  });
});

describe('a new browser', () => {
  it('is learned quietly the first time, and reported after that', async () => {
    await createUser({ email: EMAIL });
    const first = await signIn();
    const device = cookieOf(first, 'device');
    expect(device).toMatch(/^device=/);
    await signIn(PASSWORD, device);
    expect((await outbox()).filter((m) => /new sign-in/i.test(m.subject))).toHaveLength(0);

    await signIn(PASSWORD, ''); // another browser
    const alerts = (await outbox()).filter((m) => /new sign-in/i.test(m.subject));
    expect(alerts).toHaveLength(1);
    expect(alerts[0].text).toMatch(/Chrome on Windows/);
  });

  it('is described in plain words', () => {
    expect(describeBrowser('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/140.0 Mobile Safari/537.36')).toBe('Chrome on Android');
    expect(describeBrowser('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1')).toBe('Safari on iPhone or iPad');
  });
});

describe('changing the password or payout number', () => {
  const session = async () => {
    await createUser({ email: EMAIL, bkashMerchant: '01710000001' });
    const res = await signIn();
    return { auth: `Bearer ${String(res.body.token)}`, refresh: cookieOf(res, 'refreshToken') };
  };

  it('needs the current password', async () => {
    const { auth } = await session();
    const without = await request.put('/user/profile').set('Authorization', auth).field('password', 'Tangerine-Harbour-58!');
    expect(without.status).toBe(403);
    expect(without.body.code).toBe('current-password');
    const wrong = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .field('bkashMerchant', '01710000002')
      .field('currentPassword', 'not-it');
    expect(wrong.status).toBe(403);
    // Other details need nothing extra.
    expect((await request.put('/user/profile').set('Authorization', auth).field('address', 'Mirpur, Dhaka')).status).toBe(200);
  });

  it('signs out every other session and tells the owner, when the password changes', async () => {
    const { auth, refresh } = await session();
    await signIn(); // a second session elsewhere
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(2);

    const res = await request
      .put('/user/profile')
      .set('Authorization', auth)
      .set('Cookie', refresh)
      .field('password', 'Tangerine-Harbour-58!')
      .field('currentPassword', PASSWORD);
    expect(res.status).toBe(200);
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(1);
    expect((await outbox()).map((m) => m.subject)).toContain('Your BookStoreBD password was changed');
  });

  it('tells the owner when the payout number changes', async () => {
    const { auth } = await session();
    await request.put('/user/profile').set('Authorization', auth).field('bkashMerchant', '01710000009').field('currentPassword', PASSWORD);
    expect((await User.findOne({ email: EMAIL }).lean())?.bkashMerchant).toBe('01710000009');
    expect((await outbox()).map((m) => m.subject)).toContain('Your bKash payout number was changed');
  });
});

describe('signing out everywhere else', () => {
  it('ends every other session and keeps this one', async () => {
    await createUser({ email: EMAIL });
    const here = await signIn();
    await signIn();
    await signIn();
    const res = await request
      .post('/auth/logout-others')
      .set('Authorization', `Bearer ${String(here.body.token)}`)
      .set('Cookie', cookieOf(here, 'refreshToken'));
    expect(res.body.ended).toBe(2);
    expect((await request.post('/auth/refresh').set('Cookie', cookieOf(here, 'refreshToken'))).status).toBe(200);
  });
});

describe('security.txt', () => {
  it('says where to report a vulnerability', async () => {
    const res = await request.get('/.well-known/security.txt');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/^Contact: https:\/\/github\.com\/UtshaBasak\/BookStoreBD\/security\/advisories\/new$/m);
    expect(res.text).toMatch(/^Expires: \d{4}-/m);
  });
});

describe('the password hash', () => {
  it('is made again at today’s cost when its owner signs in, and keeps working', async () => {
    await createUser({ email: EMAIL }); // hashed at cost 10, as before
    const before = (await User.findOne({ email: EMAIL }).lean())?.password ?? '';
    expect(bcryptjs.getRounds(before)).toBe(10);

    process.env.BCRYPT_ROUNDS = '12';
    try {
      expect((await signIn()).status).toBe(200);
      const after = (await User.findOne({ email: EMAIL }).lean())?.password ?? '';
      expect(bcryptjs.getRounds(after)).toBe(12);
      expect(bcryptjs.compareSync(PASSWORD, after)).toBe(true);
      // Once is enough: the next sign-in leaves it alone.
      expect((await signIn()).status).toBe(200);
      expect((await User.findOne({ email: EMAIL }).lean())?.password).toBe(after);
    } finally {
      process.env.BCRYPT_ROUNDS = '10';
    }
  });

  it('is left alone after a wrong password', async () => {
    await createUser({ email: EMAIL });
    const before = (await User.findOne({ email: EMAIL }).lean())?.password;
    process.env.BCRYPT_ROUNDS = '12';
    try {
      expect((await signIn('Wrong-Password-1!')).status).toBe(401);
      expect((await User.findOne({ email: EMAIL }).lean())?.password).toBe(before);
    } finally {
      process.env.BCRYPT_ROUNDS = '10';
    }
  });

  it('defaults to cost 12', async () => {
    const { bcryptRounds } = await import('../utils/passwordHash.js');
    const saved = process.env.BCRYPT_ROUNDS;
    delete process.env.BCRYPT_ROUNDS;
    try {
      expect(bcryptRounds()).toBe(12);
      process.env.BCRYPT_ROUNDS = '4'; // out of range: ignored
      expect(bcryptRounds()).toBe(12);
    } finally {
      process.env.BCRYPT_ROUNDS = saved;
    }
  });
});
