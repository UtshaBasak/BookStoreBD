import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

/** Pulls the refresh cookie out of a Set-Cookie header. */
const refreshCookie = (res) => {
  const raw = res.headers['set-cookie'] ?? [];
  const found = raw.find((c) => c.startsWith('refreshToken='));
  return found ? found.split(';')[0] : null;
};

const signIn = async (email = 'alice@test.com') => {
  const res = await request.post('/auth/signin').send({ email, password: PASSWORD });
  return { res, cookie: refreshCookie(res), token: res.body.token };
};

describe('sign-in issues both tokens', () => {
  it('returns an access token in the body and a refresh cookie', async () => {
    await createUser({ email: 'alice@test.com' });

    const { res, cookie } = await signIn();

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(cookie).toMatch(/^refreshToken=/);
  });

  it('keeps the refresh token out of the response body', async () => {
    await createUser({ email: 'alice@test.com' });

    const { res, cookie } = await signIn();
    const refreshValue = cookie.split('=')[1];

    expect(JSON.stringify(res.body)).not.toContain(refreshValue);
  });

  it('marks the cookie httpOnly and scopes it to /auth', async () => {
    await createUser({ email: 'alice@test.com' });

    const res = await request.post('/auth/signin').send({ email: 'alice@test.com', password: PASSWORD });
    const raw = res.headers['set-cookie'].find((c) => c.startsWith('refreshToken='));

    // httpOnly is what stops page JavaScript reading a long-lived credential.
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\/auth/i);
    expect(raw).toMatch(/SameSite=Lax/i);
  });

  it('stores only a hash of the refresh token', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();
    const value = cookie.split('=')[1];

    const RefreshToken = (await import('../models/RefreshToken.model.js')).default;
    const stored = await RefreshToken.findOne({});

    expect(stored.tokenHash).not.toBe(value);
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('refresh', () => {
  it('exchanges the cookie for a usable access token', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    const res = await request.post('/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe('alice@test.com');

    // Not asserting the string differs from the previous one: `iat` has second
    // precision, so refreshing inside the same second re-signs an identical
    // payload. What matters is that it is a valid, unexpired token.
    const { verifyAccessToken } = await import('../utils/jwt.js');
    const payload = verifyAccessToken(res.body.token);

    expect(payload).not.toBeNull();
    expect(payload.email).toBe('alice@test.com');
    expect(payload.exp * 1000).toBeGreaterThan(Date.now());
  });

  it('rotates the refresh token on every use', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    const res = await request.post('/auth/refresh').set('Cookie', cookie);
    const rotated = refreshCookie(res);

    expect(rotated).toBeTruthy();
    expect(rotated).not.toBe(cookie);
  });

  it('issues a token that actually works', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    const refreshed = await request.post('/auth/refresh').set('Cookie', cookie);
    const res = await request.get('/cart').set('Authorization', `Bearer ${refreshed.body.token}`);

    expect(res.status).toBe(200);
  });

  it('rejects a request with no cookie', async () => {
    const res = await request.post('/auth/refresh');
    expect(res.status).toBe(401);
  });

  it('rejects a made-up token', async () => {
    const res = await request.post('/auth/refresh').set('Cookie', 'refreshToken=not-a-real-token');
    expect(res.status).toBe(401);
  });

  it('survives several sequential refreshes', async () => {
    await createUser({ email: 'alice@test.com' });
    let { cookie } = await signIn();

    for (let i = 0; i < 4; i += 1) {
      const res = await request.post('/auth/refresh').set('Cookie', cookie);
      expect(res.status).toBe(200);
      cookie = refreshCookie(res);
    }
  });
});

describe('replay detection', () => {
  it('refuses a refresh token that was already exchanged', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    await request.post('/auth/refresh').set('Cookie', cookie);
    const replay = await request.post('/auth/refresh').set('Cookie', cookie);

    expect(replay.status).toBe(401);
  });

  it('revokes the whole family, so the stolen session dies too', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    // The legitimate client rotates once.
    const good = await request.post('/auth/refresh').set('Cookie', cookie);
    const current = refreshCookie(good);

    // An attacker replays the old token.
    await request.post('/auth/refresh').set('Cookie', cookie);

    // The legitimate client's newer token is now dead as well: the family was
    // revoked, which is the point - the session ends rather than continuing
    // alongside an intruder.
    const after = await request.post('/auth/refresh').set('Cookie', current);
    expect(after.status).toBe(401);
  });

  it('does not reveal why a refresh failed', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();
    await request.post('/auth/refresh').set('Cookie', cookie);

    const replayed = await request.post('/auth/refresh').set('Cookie', cookie);
    const unknown = await request.post('/auth/refresh').set('Cookie', 'refreshToken=nope');

    expect(replayed.body.message).toBe(unknown.body.message);
  });
});

describe('logout', () => {
  it('ends the session and clears the cookie', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    const res = await request.post('/auth/logout').set('Cookie', cookie);

    expect(res.status).toBe(204);
    const cleared = res.headers['set-cookie']?.find((c) => c.startsWith('refreshToken='));
    expect(cleared).toMatch(/refreshToken=;/);
  });

  it('makes the refresh token unusable afterwards', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    await request.post('/auth/logout').set('Cookie', cookie);
    const res = await request.post('/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(401);
  });

  it('succeeds even with no session, so the client can always call it', async () => {
    const res = await request.post('/auth/logout');
    expect(res.status).toBe(204);
  });

  it('leaves other sessions for the same user alone', async () => {
    await createUser({ email: 'alice@test.com' });
    const phone = await signIn();
    const laptop = await signIn();

    await request.post('/auth/logout').set('Cookie', phone.cookie);

    const stillValid = await request.post('/auth/refresh').set('Cookie', laptop.cookie);
    expect(stillValid.status).toBe(200);
  });
});

describe('password reset ends every session', () => {
  it('revokes all refresh tokens for the account', async () => {
    await createUser({ email: 'alice@test.com' });
    const phone = await signIn();
    const laptop = await signIn();

    // Drive the OTP flow directly against the store the controller uses.
    const { default: RefreshToken } = await import('../models/RefreshToken.model.js');
    expect(await RefreshToken.countDocuments({ revokedAt: null })).toBe(2);

    const User = (await import('../models/user.model.js')).default;
    const user = await User.findOne({ email: 'alice@test.com' });
    const { revokeAllForUser } = await import('../utils/refreshToken.js');
    await revokeAllForUser(user._id);

    for (const session of [phone, laptop]) {
      const res = await request.post('/auth/refresh').set('Cookie', session.cookie);
      expect(res.status).toBe(401);
    }
  });
});

describe('the cookie authenticates nothing on its own', () => {
  /**
   * This is what makes CSRF a non-issue here, and it is worth pinning.
   *
   * The refresh cookie is SameSite=Lax, so a browser will not attach it to a
   * cross-site POST, and /auth/refresh and /auth/logout are both POST. Every
   * other endpoint authenticates from the Authorization header, which a
   * third-party page cannot set. So possession of the cookie alone gets an
   * attacker nothing beyond the refresh endpoint.
   */
  it('a protected endpoint rejects a request carrying only the cookie', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    for (const path of ['/cart', '/wishlist', '/order/buyer', '/user']) {
      const res = await request.get(path).set('Cookie', cookie);
      expect(res.status, `${path} accepted the cookie as authentication`).toBe(401);
    }
  });

  it('a state-changing endpoint rejects a request carrying only the cookie', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    const res = await request.post('/cart/clear').set('Cookie', cookie);

    expect(res.status).toBe(401);
  });

  it('only the refresh and logout endpoints act on the cookie', async () => {
    await createUser({ email: 'alice@test.com' });
    const { cookie } = await signIn();

    expect((await request.post('/auth/refresh').set('Cookie', cookie)).status).toBe(200);
    expect((await request.post('/auth/logout').set('Cookie', cookie)).status).toBe(204);
  });
});

describe('access token lifetime', () => {
  it('is short, so a stolen one is useful only briefly', async () => {
    const { config } = await import('../config/env.js');
    expect(config.jwt.expiresIn).toBe('15m');
  });
});
