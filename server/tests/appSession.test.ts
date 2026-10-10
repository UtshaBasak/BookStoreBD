/**
 * Sign-in for the Android app: the same checks as the website's, with the
 * refresh token in the body instead of a cookie, bound to a key in the phone's
 * keystore, and kept apart from website sessions.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, setCookies, type PrefixedRequest } from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';
import { makePhone, signedHeaders, REFRESH_PATH, type TestPhone } from './helpers/appDevice.js';
import RefreshToken from '../models/RefreshToken.model.js';
import User from '../models/user.model.js';
import { hashToken, ANDROID_RETRY_WINDOW_MS } from '../utils/refreshToken.js';

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
// Each test from its own address, so the sign-in rate limit counts it alone.
let clientIp = '';
let nextIp = 1;
beforeEach(async () => {
  await clearDatabase();
  sendMail.mockClear();
  clientIp = `203.0.113.${nextIp++}`;
});
const post = (path: string) => request.post(path).set('X-Forwarded-For', clientIp);
const get = (path: string) => request.get(path).set('X-Forwarded-For', clientIp);
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
});

const EMAIL = 'reader@test.com';

const outbox = async (): Promise<{ to: string; subject: string; text: string }[]> => {
  const { mailSettled } = await import('../controllers/auth.controller.js');
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await Promise.all([mailSettled(), shopMailSettled()]);
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });
};

const lastCode = async (): Promise<string> => {
  const code = /\b(\d{6})\b/.exec((await outbox()).at(-1)?.text ?? '')?.[1];
  if (!code) throw new Error('no code was sent');
  return code;
};

const appSignIn = (phone: TestPhone, email = EMAIL) =>
  post('/api/v1/app/auth/signin').set('X-Client', 'android/100').send({ email, password: PASSWORD, device: phone.device });

const refresh = (phone: TestPhone, refreshToken: string, headers = signedHeaders(phone, refreshToken)) =>
  post(REFRESH_PATH).set(headers).send({ refreshToken });

describe('app sign-in', () => {
  it('returns the refresh token in the body and sets no cookie', async () => {
    await createUser({ email: EMAIL });
    const res = await appSignIn(makePhone());

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).toMatch(/^[\w-]{40,}$/);
    expect(new Date(res.body.refreshExpiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(res.body.user.email).toBe(EMAIL);
    expect(setCookies(res)).toEqual([]);
  });

  it("stores only a hash, marked as the phone's, with its public key and name", async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone('Samsung Galaxy A15');
    const { body } = await appSignIn(phone);

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(body.refreshToken) }).lean();
    expect(stored?.client).toBe('android');
    expect(stored?.deviceKey).toBe(phone.device.publicKey);
    expect(stored?.deviceName).toBe('Samsung Galaxy A15');
    expect(await RefreshToken.countDocuments({ tokenHash: body.refreshToken })).toBe(0);
  });

  it('answers a wrong password exactly as the website does', async () => {
    await createUser({ email: EMAIL });
    const app = await request
      .post('/api/v1/app/auth/signin')
      .send({ email: EMAIL, password: 'Wrong-password-1!', device: makePhone().device });
    const web = await post('/auth/signin').send({ email: EMAIL, password: 'Wrong-password-1!' });
    expect(app.status).toBe(401);
    expect(app.body).toEqual(web.body);
  });

  it('refuses a request without a usable device', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const noDevice = await post('/api/v1/app/auth/signin').send({ email: EMAIL, password: PASSWORD });
    const badKey = await request
      .post('/api/v1/app/auth/signin')
      .send({ email: EMAIL, password: PASSWORD, device: { ...phone.device, publicKey: 'not base64!' } });
    expect(noDevice.status).toBe(400);
    expect(badKey.status).toBe(400);
  });

  it('needs the bot check when it is on, as the website does', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    const realFetch = globalThis.fetch;
    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) =>
        new URL(String(input)).origin === 'https://challenges.cloudflare.com'
          ? Promise.resolve(new Response(JSON.stringify({ success: String(init?.body).includes('response=good') })))
          : realFetch(input, init)
      )
    );
    await createUser({ email: EMAIL });
    const phone = makePhone();

    const without = await appSignIn(phone);
    const withToken = await request
      .post('/api/v1/app/auth/signin')
      .send({ email: EMAIL, password: PASSWORD, captchaToken: 'good', device: phone.device });

    expect(without.status).toBe(400);
    expect(without.body.code).toBe('captcha');
    expect(withToken.status).toBe(200);
  });

  it('asks for the e-mailed code with two-step sign-in on, then starts an app session', async () => {
    await createUser({ email: EMAIL });
    await User.updateOne({ email: EMAIL }, { twoFactor: true });
    const phone = makePhone();

    const first = await appSignIn(phone);
    expect(first.body).toMatchObject({ twoFactor: true });
    expect(first.body.refreshToken).toBeUndefined();

    const verified = await request
      .post('/api/v1/app/auth/signin/verify')
      .send({ email: EMAIL, code: await lastCode(), device: phone.device });
    expect(verified.status).toBe(200);
    expect(verified.body.refreshToken).toBeTruthy();
    expect(setCookies(verified)).toEqual([]);
  });

  it('signs up with a verified code and starts an app session', async () => {
    const phone = makePhone();
    await post('/api/v1/auth/send-otp').send({ email: EMAIL, username: 'newreader', purpose: 'register' });
    await post('/api/v1/auth/verify-otp').send({ email: EMAIL, code: await lastCode() });

    const res = await request
      .post('/api/v1/app/auth/signup')
      .send({ username: 'newreader', email: EMAIL, password: PASSWORD, device: phone.device });

    expect(res.status).toBe(201);
    expect(res.body.refreshToken).toBeTruthy();
    expect(await User.countDocuments({ email: EMAIL })).toBe(1);
  });
});

describe('app refresh', () => {
  it('exchanges a signed refresh token for a new session', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const { body: first } = await appSignIn(phone);

    const res = await refresh(phone, first.refreshToken);

    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.refreshToken).not.toBe(first.refreshToken);
    const me = await get('/api/v1/cart').set('Authorization', `Bearer ${res.body.token}`);
    expect(me.status).toBe(200);
  });

  it('refuses a refresh with no signature, a forged one, or a stale one', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const thief = makePhone();
    const { body } = await appSignIn(phone);

    const unsigned = await post(REFRESH_PATH).send({ refreshToken: body.refreshToken });
    const otherKey = await refresh(phone, body.refreshToken, signedHeaders(thief, body.refreshToken));
    const stale = await refresh(phone, body.refreshToken, signedHeaders(phone, body.refreshToken, { timestamp: Date.now() - 10 * 60 * 1000 }));
    const otherPath = await refresh(phone, body.refreshToken, signedHeaders(phone, body.refreshToken, { path: '/api/v1/app/auth/logout' }));

    for (const res of [unsigned, otherKey, stale, otherPath]) {
      expect(res.status).toBe(401);
      expect(res.body).toEqual({ message: 'Session expired, please sign in again' });
    }
    // None of them cost the real phone its session.
    expect((await refresh(phone, body.refreshToken)).status).toBe(200);
  });

  it('lets the same phone retry a refresh whose answer it never received', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const { body: first } = await appSignIn(phone);

    const lost = await refresh(phone, first.refreshToken);
    const retried = await refresh(phone, first.refreshToken);

    expect(lost.status).toBe(200);
    expect(retried.status).toBe(200);
    // The answer that was lost is no longer good; the retry's is.
    expect((await refresh(phone, lost.body.refreshToken)).status).toBe(401);
    expect((await refresh(phone, retried.body.refreshToken)).status).toBe(200);
  });

  it('treats an old token as stolen once the retry window has passed', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const { body: first } = await appSignIn(phone);
    const { body: second } = await refresh(phone, first.refreshToken);

    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + ANDROID_RETRY_WINDOW_MS + 5000);

    expect((await refresh(phone, first.refreshToken)).status).toBe(401);
    // The whole family ends, the newer token included.
    expect((await refresh(phone, second.refreshToken)).status).toBe(401);
  });

  it('treats an old token as stolen once its successor has been used', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const { body: first } = await appSignIn(phone);
    const { body: second } = await refresh(phone, first.refreshToken);
    const { body: third } = await refresh(phone, second.refreshToken);

    expect((await refresh(phone, first.refreshToken)).status).toBe(401);
    expect((await refresh(phone, third.refreshToken)).status).toBe(401);
  });
});

describe('app and website sessions stay apart', () => {
  it('refuses a website cookie token at the app endpoint, leaving the website session alone', async () => {
    await createUser({ email: EMAIL });
    const web = await post('/auth/signin').send({ email: EMAIL, password: PASSWORD });
    const cookie = setCookies(web).find((c) => c.startsWith('refreshToken='))!.split(';')[0];
    const webToken = cookie.split('=')[1];

    const res = await refresh(makePhone(), webToken);

    expect(res.status).toBe(401);
    expect((await post('/auth/refresh').set('Cookie', cookie)).status).toBe(200);
  });

  it('refuses an app token presented as the website cookie, leaving the app session alone', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const { body } = await appSignIn(phone);

    const res = await post('/auth/refresh').set('Cookie', `refreshToken=${body.refreshToken}`);

    expect(res.status).toBe(401);
    expect((await refresh(phone, body.refreshToken)).status).toBe(200);
  });
});

describe('app sign-out', () => {
  it('ends the session, and answers 204 either way', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const { body } = await appSignIn(phone);

    expect((await post('/api/v1/app/auth/logout').send({ refreshToken: body.refreshToken })).status).toBe(204);
    expect((await refresh(phone, body.refreshToken)).status).toBe(401);
    expect((await post('/api/v1/app/auth/logout').send({ refreshToken: 'x'.repeat(40) })).status).toBe(204);
  });

  it('signs out everywhere else, keeping this phone', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const other = makePhone();
    const { body: mine } = await appSignIn(phone);
    const { body: theirs } = await appSignIn(other);
    const web = await post('/auth/signin').send({ email: EMAIL, password: PASSWORD });
    const webCookie = setCookies(web).find((c) => c.startsWith('refreshToken='))!.split(';')[0];

    const res = await request
      .post('/api/v1/app/auth/logout-others')
      .set('Authorization', `Bearer ${mine.token}`)
      .send({ refreshToken: mine.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.ended).toBe(2);
    expect((await refresh(phone, mine.refreshToken)).status).toBe(200);
    expect((await refresh(other, theirs.refreshToken)).status).toBe(401);
    expect((await post('/auth/refresh').set('Cookie', webCookie)).status).toBe(401);
  });

  it('a password reset ends app sessions too', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone();
    const { body } = await appSignIn(phone);

    await post('/api/v1/auth/send-otp').send({ email: EMAIL, purpose: 'reset' });
    const reset = await request
      .post('/api/v1/auth/reset-password')
      .send({ email: EMAIL, otp: await lastCode(), newPassword: 'Another-Lantern-77!' });

    expect(reset.status).toBe(200);
    expect((await refresh(phone, body.refreshToken)).status).toBe(401);
  });
});

describe('new-device notices', () => {
  it('e-mails the owner when a new installation signs in, naming the phone', async () => {
    await createUser({ email: EMAIL });
    // The first device an account knows is learned quietly.
    await appSignIn(makePhone('Pixel 9'));
    await outbox();
    sendMail.mockClear();

    await appSignIn(makePhone('Walton Primo'));
    const notices = (await outbox()).filter((mail) => mail.subject.startsWith('New sign-in'));

    expect(notices).toHaveLength(1);
    expect(notices[0].text).toContain('Walton Primo');
    expect(notices[0].text).toContain('Android app');
  });

  it('does not e-mail again for an installation it already knows', async () => {
    await createUser({ email: EMAIL });
    const phone = makePhone('Pixel 9');
    await appSignIn(makePhone('First phone'));
    await appSignIn(phone);
    await outbox();
    sendMail.mockClear();

    await appSignIn(phone);

    expect((await outbox()).filter((mail) => mail.subject.startsWith('New sign-in'))).toHaveLength(0);
  });
});
