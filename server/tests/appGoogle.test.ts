/**
 * "Continue with Google" in the Android app: an ID token from Credential
 * Manager, checked here in full. Google is stood in for by a key pair made for
 * the test, whose public half is installed as "Google's keys".
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey } from 'jose';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createUser } from './helpers/factories.js';
import { makePhone } from './helpers/appDevice.js';
import User from '../models/user.model.js';
import { setGoogleKeysForTesting } from '../controllers/appGoogle.controller.js';

vi.hoisted(() => {
  process.env.SMTP_USER = 'tests@example.com';
  process.env.SMTP_PASS = 'test-password';
});
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: vi.fn() }) } }));

const CLIENT_ID = 'web-client.apps.googleusercontent.com';

let request: PrefixedRequest;
let googleKey: CryptoKey;
let strangerKey: CryptoKey;

beforeAll(async () => {
  ({ request } = await createTestContext());
  const google = await generateKeyPair('RS256');
  googleKey = google.privateKey;
  strangerKey = (await generateKeyPair('RS256')).privateKey;
  const jwk = { ...(await exportJWK(google.publicKey)), kid: 'test-key', alg: 'RS256' };
  setGoogleKeysForTesting(createLocalJWKSet({ keys: [jwk] }));
});
afterAll(async () => {
  setGoogleKeysForTesting(null);
  await closeTestContext();
});

let clientIp = '';
let nextIp = 1;
beforeEach(async () => {
  await clearDatabase();
  process.env.GOOGLE_CLIENT_ID = CLIENT_ID;
  clientIp = `198.51.100.${nextIp++}`;
});
afterEach(() => {
  delete process.env.GOOGLE_CLIENT_ID;
  vi.useRealTimers();
});

const post = (path: string) => request.post(path).set('X-Forwarded-For', clientIp);
const get = (path: string) => request.get(path).set('X-Forwarded-For', clientIp);

const nonce = async (): Promise<string> => (await get('/api/v1/app/auth/nonce')).body.nonce;

interface TokenOptions {
  email?: string;
  verified?: boolean;
  audience?: string;
  issuer?: string;
  nonce?: string;
  key?: CryptoKey;
  expiresIn?: string;
}

const idToken = ({
  email = 'reader@gmail.com',
  verified = true,
  audience = CLIENT_ID,
  issuer = 'https://accounts.google.com',
  nonce: tokenNonce,
  key = googleKey,
  expiresIn = '10m',
}: TokenOptions = {}) =>
  new SignJWT({ email, email_verified: verified, name: 'Nusrat Jahan', ...(tokenNonce ? { nonce: tokenNonce } : {}) })
    .setProtectedHeader({ alg: 'RS256', kid: 'test-key' })
    .setSubject('google-subject-1')
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);

const signInWith = async (options: TokenOptions = {}, given?: string) => {
  const issued = given ?? (await nonce());
  return post('/api/v1/app/auth/google').send({
    idToken: await idToken({ nonce: issued, ...options }),
    nonce: issued,
    device: makePhone().device,
  });
};

describe('app Google sign-in', () => {
  it('creates an account for a new address and starts an app session', async () => {
    const res = await signInWith();

    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeTruthy();
    const user = await User.findOne({ email: 'reader@gmail.com' }).lean();
    expect(user?.googleId).toBe('google-subject-1');
    expect(user?.passwordSet).toBe(false);
  });

  it('signs in to an existing account with that address and links it', async () => {
    await createUser({ email: 'reader@gmail.com', username: 'nusrat' });

    const res = await signInWith();

    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe('nusrat');
    expect((await User.findOne({ email: 'reader@gmail.com' }).lean())?.googleId).toBe('google-subject-1');
    expect(await User.countDocuments()).toBe(1);
  });

  it('accepts each nonce once', async () => {
    const issued = await nonce();
    expect((await signInWith({}, issued)).status).toBe(200);
    expect((await signInWith({}, issued)).status).toBe(401);
  });

  it('refuses a token for another nonce, or a nonce this server never issued', async () => {
    const issued = await nonce();
    const mismatched = await post('/api/v1/app/auth/google').send({
      idToken: await idToken({ nonce: 'a-different-nonce-entirely' }),
      nonce: issued,
      device: makePhone().device,
    });
    const invented = await signInWith({}, 'never-issued-by-this-server');

    expect(mismatched.status).toBe(401);
    expect(invented.status).toBe(401);
  });

  it('refuses tokens Google did not sign for this site', async () => {
    const forgeries: TokenOptions[] = [
      { key: strangerKey },
      { audience: 'someone-else.apps.googleusercontent.com' },
      { issuer: 'https://evil.example.com' },
      { expiresIn: '-1m' },
    ];
    for (const options of forgeries) {
      const res = await signInWith(options);
      expect(res.status).toBe(401);
      expect(res.body.refreshToken).toBeUndefined();
    }
    expect(await User.countDocuments()).toBe(0);
  });

  it('refuses an address Google has not verified', async () => {
    const res = await signInWith({ verified: false });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('google-unverified');
  });

  it('still asks for the code when two-step sign-in is on, and says where it went', async () => {
    await createUser({ email: 'reader@gmail.com' });
    await User.updateOne({ email: 'reader@gmail.com' }, { twoFactor: true });

    const res = await signInWith();

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ twoFactor: true, email: 'reader@gmail.com' });
    expect(res.body.refreshToken).toBeUndefined();
  });

  it('is unavailable until a Google client is configured', async () => {
    delete process.env.GOOGLE_CLIENT_ID;
    const res = await signInWith();
    expect(res.status).toBe(503);
  });

  it('hands out a fresh, uncached nonce each time', async () => {
    const first = await get('/api/v1/app/auth/nonce');
    const second = await get('/api/v1/app/auth/nonce');
    expect(first.body.nonce).not.toBe(second.body.nonce);
    expect(first.body.nonce.length).toBeGreaterThanOrEqual(40);
    expect(first.headers['cache-control']).toBe('no-store');
  });
});
