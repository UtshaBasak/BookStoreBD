/**
 * One-time codes used to live in a `Map` in the process.
 *
 * That works until the process restarts - which it does on every deploy, and
 * which a sleeping instance does on its own - and every code in flight went
 * with it: somebody halfway through signing up or resetting a password got
 * "invalid code" and had to start again. It also meant a second instance could
 * not see codes issued by the first.
 *
 * These pin that the state is in the database, that the code itself is not,
 * and that the rules the Map enforced still hold.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import OneTimeCode from '../models/OneTimeCode.model.js';
import {
  MAX_OTP_ATTEMPTS,
  clearCode,
  consumeOtpAttempt,
  hasVerifiedCode,
  issueCode,
  markVerified,
} from '../utils/otpStore.js';

// `vi.hoisted` runs before the imports above are evaluated, which is the only
// window in which the SMTP variables can be set: `config/env.js` reads them
// once, at import, and the shared setup file deletes them first.
const { sendMail } = vi.hoisted(() => {
  process.env.SMTP_USER = 'tests@example.com';
  process.env.SMTP_PASS = 'test-password';
  return { sendMail: vi.fn() };
});

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const EMAIL = 'someone@test.com';
const CODE = '123456';

describe('where a code lives', () => {
  it('in the database, so a restart does not lose it', async () => {
    await issueCode(EMAIL, CODE);

    // Read straight from the collection: nothing in this process is holding it.
    const stored = await OneTimeCode.findOne({ email: EMAIL }).lean();

    expect(stored).not.toBeNull();
    expect(stored?.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('and not as the code itself', async () => {
    await issueCode(EMAIL, CODE);

    const stored = await OneTimeCode.findOne({ email: EMAIL }).lean();

    // Six digits is a million possibilities, so a plain hash is recovered from
    // a table instantly. A record that survives a restart is one that can be
    // read out of a backup, which is why this is an HMAC under the server's
    // secret rather than the code.
    expect(stored?.code).not.toBe(CODE);
    expect(stored?.code).toMatch(/^[0-9a-f]{64}$/);
  });

  it('with a TTL index, so nothing has to sweep it', async () => {
    await OneTimeCode.syncIndexes();

    const indexes = await OneTimeCode.collection.indexes();
    const ttl = indexes.find((index) => index.expireAfterSeconds !== undefined);

    expect(ttl?.key).toEqual({ expiresAt: 1 });
    expect(ttl?.expireAfterSeconds).toBe(0);
  });

  it('one per address: asking again replaces the last one', async () => {
    await issueCode(EMAIL, CODE);
    await issueCode(EMAIL, '654321');

    expect(await OneTimeCode.countDocuments({ email: EMAIL })).toBe(1);
    // The old code is no longer good, which is the point of replacing it.
    expect(await consumeOtpAttempt(EMAIL, CODE)).toBeNull();
    expect(await consumeOtpAttempt(EMAIL, '654321')).not.toBeNull();
  });
});

describe('checking one', () => {
  it('accepts the right code', async () => {
    await issueCode(EMAIL, CODE);

    expect(await consumeOtpAttempt(EMAIL, CODE)).not.toBeNull();
  });

  it('refuses a wrong one, and counts it', async () => {
    await issueCode(EMAIL, CODE);

    expect(await consumeOtpAttempt(EMAIL, '000000')).toBeNull();
    expect((await OneTimeCode.findOne({ email: EMAIL }).lean())?.attempts).toBe(1);
  });

  it('throws the code away after too many guesses', async () => {
    await issueCode(EMAIL, CODE);

    for (let i = 0; i < MAX_OTP_ATTEMPTS; i += 1) {
      await consumeOtpAttempt(EMAIL, '000000');
    }

    // Gone, so even the right code is no good now.
    expect(await OneTimeCode.countDocuments({ email: EMAIL })).toBe(0);
    expect(await consumeOtpAttempt(EMAIL, CODE)).toBeNull();
  });

  it('refuses an expired one before the sweeper gets to it', async () => {
    await issueCode(EMAIL, CODE);
    // MongoDB's TTL monitor runs about once a minute, so a just-expired record
    // is still there to be found.
    await OneTimeCode.updateOne({ email: EMAIL }, { expiresAt: new Date(Date.now() - 1000) });

    expect(await consumeOtpAttempt(EMAIL, CODE)).toBeNull();
    expect(await OneTimeCode.countDocuments({ email: EMAIL })).toBe(0);
  });

  it('refuses one that was never issued', async () => {
    expect(await consumeOtpAttempt('nobody@test.com', CODE)).toBeNull();
  });
});

describe('what signup then asks', () => {
  it('whether the address has a checked code', async () => {
    await issueCode(EMAIL, CODE);
    expect(await hasVerifiedCode(EMAIL)).toBe(false);

    await consumeOtpAttempt(EMAIL, CODE);
    await markVerified(EMAIL);

    expect(await hasVerifiedCode(EMAIL)).toBe(true);
  });

  it('and a checked code that has since expired does not count', async () => {
    await issueCode(EMAIL, CODE);
    await markVerified(EMAIL);
    await OneTimeCode.updateOne({ email: EMAIL }, { expiresAt: new Date(Date.now() - 1000) });

    expect(await hasVerifiedCode(EMAIL)).toBe(false);
  });

  it('and clearing it afterwards leaves nothing behind', async () => {
    await issueCode(EMAIL, CODE);
    await clearCode(EMAIL);

    expect(await OneTimeCode.countDocuments({ email: EMAIL })).toBe(0);
  });
});

describe('through the endpoints', () => {
  it('a code asked for over HTTP is in the database, not in the process', async () => {
    const res = await request
      .post('/auth/send-otp')
      .send({ email: 'newcomer@test.com', purpose: 'register' });

    expect(res.status).toBe(200);
    expect(await OneTimeCode.countDocuments({ email: 'newcomer@test.com' })).toBe(1);
  });

  it('and a wrong code still answers the same as no code at all', async () => {
    await request.post('/auth/send-otp').send({ email: 'newcomer@test.com', purpose: 'register' });

    const wrong = await request
      .post('/auth/verify-otp')
      .send({ email: 'newcomer@test.com', code: '000000' });
    const never = await request
      .post('/auth/verify-otp')
      .send({ email: 'nobody@test.com', code: '000000' });

    expect(wrong.status).toBe(never.status);
    expect(wrong.body.message).toBe(never.body.message);
  });
});
