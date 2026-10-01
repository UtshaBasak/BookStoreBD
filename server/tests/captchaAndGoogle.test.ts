/**
 * The bot check on sign-in and sign-up codes, and "Continue with Google".
 * Cloudflare and Google are stood in for; what is tested is what this server
 * does with their answers.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';
import Notification from '../models/Notification.model.js';
import User from '../models/user.model.js';

// Mail is set up, so two-step sign-in can send its code.
vi.hoisted(() => {
  process.env.SMTP_USER = 'shop@example.com';
  process.env.SMTP_PASS = 'test-password';
});
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: vi.fn() }) } }));

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const realFetch = globalThis.fetch;
/** Answers for outside services, by URL; anything else goes out as normal. */
const outside = (answers: Record<string, (body: string) => unknown>) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const match = Object.keys(answers).find((prefix) => url.startsWith(prefix));
      if (!match) return realFetch(input, init);
      return Promise.resolve(new Response(JSON.stringify(answers[match](String(init?.body ?? ''))), { status: 200 }));
    })
  );

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.TURNSTILE_SECRET_KEY;
  delete process.env.TURNSTILE_SITE_KEY;
  delete process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_SECRET;
});

describe('the bot check', () => {
  it('is off until it is configured', async () => {
    await createUser({ email: 'a@test.com' });
    expect((await request.get('/auth/config')).body).toEqual({ captchaSiteKey: null, google: false });
    expect((await request.post('/auth/signin').send({ email: 'a@test.com', password: PASSWORD })).status).toBe(200);
  });

  it('then needs a token Cloudflare accepts, on sign-in and on sign-up codes', async () => {
    process.env.TURNSTILE_SECRET_KEY = 'secret';
    process.env.TURNSTILE_SITE_KEY = 'site-key';
    outside({ 'https://challenges.cloudflare.com': (body) => ({ success: body.includes('response=good') }) });
    await createUser({ email: 'a@test.com' });

    expect((await request.get('/auth/config')).body.captchaSiteKey).toBe('site-key');

    const missing = await request.post('/auth/signin').send({ email: 'a@test.com', password: PASSWORD });
    expect(missing.status).toBe(400);
    expect(missing.body.code).toBe('captcha');
    expect((await request.post('/auth/signin').send({ email: 'a@test.com', password: PASSWORD, captchaToken: 'bad' })).status).toBe(400);
    expect((await request.post('/auth/signin').send({ email: 'a@test.com', password: PASSWORD, captchaToken: 'good' })).status).toBe(200);

    expect((await request.post('/auth/send-otp').send({ email: 'new@test.com', purpose: 'register' })).status).toBe(400);
  });
});

describe('Continue with Google', () => {
  const configure = () => {
    process.env.GOOGLE_CLIENT_ID = 'client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret';
  };
  const idToken = (claims: Record<string, unknown>) =>
    `x.${Buffer.from(JSON.stringify({ iss: 'https://accounts.google.com', aud: 'client-id', exp: Date.now() / 1000 + 600, ...claims })).toString('base64url')}.y`;

  /** Starts the sign-in and comes back from Google with a code. */
  const roundTrip = async (claims: Record<string, unknown>) => {
    outside({ 'https://oauth2.googleapis.com/token': () => ({ id_token: idToken(claims) }) });
    const start = await request.get('/auth/google?next=/wishlist');
    expect(start.status).toBe(303);
    const google = new URL(start.headers.location);
    expect(google.origin).toBe('https://accounts.google.com');
    expect(google.searchParams.get('code_challenge_method')).toBe('S256');
    const cookie = String(start.headers['set-cookie']).split(';')[0];
    return request.get(`/auth/google/callback?code=abc&state=${google.searchParams.get('state')}`).set('Cookie', cookie);
  };

  it('is offered once configured, and sends the browser to Google', async () => {
    configure();
    expect((await request.get('/auth/config')).body.google).toBe(true);
  });

  it('creates an account for a new address, welcomed like any other, and signs in', async () => {
    configure();
    const back = await roundTrip({ email: 'New.Reader@gmail.com', email_verified: true, name: 'New Reader', sub: 'g-1' });
    expect(back.status).toBe(303);
    expect(back.headers.location).toBe('/sign-in?google=done&next=%2Fwishlist');
    expect(String(back.headers['set-cookie'])).toMatch(/refreshToken=/);

    const user = await User.findOne({ email: 'new.reader@gmail.com' }).lean();
    expect(user).toMatchObject({ username: 'new_reader', googleId: 'g-1' });
    expect(await Notification.countDocuments({ recipient: 'new.reader@gmail.com', type: 'welcome' })).toBe(2);
  });

  it('signs in to the account already on that address', async () => {
    configure();
    await createUser({ email: 'reader@gmail.com', username: 'reader' });
    const back = await roundTrip({ email: 'reader@gmail.com', email_verified: true, name: 'Someone', sub: 'g-2' });
    expect(back.headers.location).toMatch(/google=done/);
    expect(await User.countDocuments()).toBe(1);
  });

  it('refuses an address Google has not verified, a stale state, and a token for another app', async () => {
    configure();
    expect((await roundTrip({ email: 'x@gmail.com', email_verified: false, sub: 'g-3' })).headers.location).toBe('/sign-in#google-error=unverified');
    expect((await roundTrip({ email: 'x@gmail.com', email_verified: true, aud: 'someone-else' })).headers.location).toBe('/sign-in#google-error=failed');

    const forged = await request.get('/auth/google/callback?code=abc&state=forged');
    expect(forged.headers.location).toBe('/sign-in#google-error=expired');
    expect(await User.countDocuments()).toBe(0);
  });

  it('still asks for the e-mailed code when two-step sign-in is on', async () => {
    configure();
    await createUser({ email: 'safe@gmail.com' });
    await User.updateOne({ email: 'safe@gmail.com' }, { twoFactor: true });
    const back = await roundTrip({ email: 'safe@gmail.com', email_verified: true, sub: 'g-4' });
    expect(back.headers.location).toMatch(/#google-2fa=safe%40gmail\.com$/);
    expect(String(back.headers['set-cookie'] ?? '')).not.toMatch(/refreshToken=/);
  });
});
