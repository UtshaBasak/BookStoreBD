/**
 * Account enumeration.
 *
 * The auth endpoints used to answer two different ways depending on whether an
 * address had an account: `404 "User not found!"` against `401 "Wrong
 * credentials!"` on sign-in, and `"No account found with this email."` on
 * reset. Anyone could feed in a list of addresses and learn which ones shop
 * here - a privacy leak on its own, and the first step of a credential
 * stuffing run.
 *
 * Every test below compares a known address against an unknown one. What is
 * being asserted is not any particular sentence but that the two answers are
 * indistinguishable.
 */
import bcryptjs from 'bcryptjs';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';

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

beforeEach(async () => {
  await clearDatabase();
  sendMail.mockClear();
});

interface SentMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Delivery is deliberately detached from the response, so a test that looks at
 * the outbox has to wait for it explicitly.
 */
const outbox = async (): Promise<SentMail[]> => {
  const { mailSettled } = await import('../controllers/auth.controller.js');
  await mailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as SentMail);
};

/** The six-digit code out of an OTP mail, if there is one. */
const codeIn = (text: string): string | undefined => /\b(\d{6})\b/.exec(text)?.[1];

const KNOWN = 'known@test.com';
const UNKNOWN = 'unknown@test.com';

describe('sign-in', () => {
  it('answers a wrong password and an address with no account identically', async () => {
    await createUser({ email: KNOWN });

    const wrongPassword = await request
      .post('/auth/signin')
      .send({ email: KNOWN, password: 'not-the-password' });
    const noSuchAccount = await request
      .post('/auth/signin')
      .send({ email: UNKNOWN, password: PASSWORD });

    // Anything that differs here - the status, a word of the message - is the
    // oracle this is meant to close.
    expect(wrongPassword.status).toBe(401);
    expect(noSuchAccount.status).toBe(wrongPassword.status);
    expect(noSuchAccount.body).toEqual(wrongPassword.body);
    expect(wrongPassword.body.message).toBe('Invalid email or password');
  });

  it('does the same password work whether or not the account exists', async () => {
    // Identical wording is no use if the unknown address comes back in a
    // millisecond and the real one takes the hundred that bcrypt costs. This
    // pins the dummy compare rather than a stopwatch, which would be flaky.
    const compare = vi.spyOn(bcryptjs, 'compareSync');

    await request.post('/auth/signin').send({ email: UNKNOWN, password: PASSWORD });

    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('still signs in an account that exists', async () => {
    await createUser({ email: KNOWN });

    const res = await request.post('/auth/signin').send({ email: KNOWN, password: PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
  });
});

describe('requesting a code', () => {
  it('answers a reset for a known and an unknown address identically', async () => {
    await createUser({ email: KNOWN });

    const known = await request.post('/auth/send-otp').send({ email: KNOWN, purpose: 'reset' });
    const unknown = await request.post('/auth/send-otp').send({ email: UNKNOWN, purpose: 'reset' });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(known.status);
    expect(unknown.body).toEqual(known.body);
  });

  it('sends nothing at all to an address with no account', async () => {
    await request.post('/auth/send-otp').send({ email: UNKNOWN, purpose: 'reset' });

    expect(await outbox()).toEqual([]);
  });

  it('answers a sign-up for a taken and a free address identically', async () => {
    await createUser({ email: KNOWN, username: 'taken_name' });

    const taken = await request
      .post('/auth/send-otp')
      .send({ email: KNOWN, username: 'a_free_name', purpose: 'register' });
    const free = await request
      .post('/auth/send-otp')
      .send({ email: UNKNOWN, username: 'another_free_name', purpose: 'register' });

    expect(taken.status).toBe(200);
    expect(free.status).toBe(taken.status);
    expect(free.body).toEqual(taken.body);
  });

  it('tells the owner of a taken address instead of issuing a code', async () => {
    await createUser({ email: KNOWN });

    await request
      .post('/auth/send-otp')
      .send({ email: KNOWN, username: 'a_free_name', purpose: 'register' });

    const [notice] = await outbox();
    expect(notice.to).toBe(KNOWN);
    expect(notice.subject).toMatch(/tried to sign up/i);
    // Useful to the person who owns the address, useless to anyone else - and
    // carrying no code, because there is nothing here to verify.
    expect(codeIn(notice.text)).toBeUndefined();
    expect(notice.text).toMatch(/already has an account/i);
  });

  it('will not mail a stranger when no purpose is given', async () => {
    // Without this the endpoint is an open relay for "Your verification code
    // is ..." to any address anyone types.
    const res = await request.post('/auth/send-otp').send({ email: UNKNOWN });

    expect(res.status).toBe(200);
    expect(await outbox()).toEqual([]);
  });

  it('still says when a username is taken', async () => {
    // A deliberate exception. Handles are printed on every listing, so they are
    // not a secret, and a sign-up form that will not say a name is taken is
    // unusable.
    await createUser({ username: 'bookworm' });

    const res = await request
      .post('/auth/send-otp')
      .send({ email: UNKNOWN, username: 'bookworm', purpose: 'register' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/already taken/i);
  });

  it('does not mistake a missing username for a taken one', async () => {
    // `findOne({ username: undefined })` drops the key and matches the first
    // user in the collection, so this used to answer "Username already taken".
    await createUser({ username: 'somebody_else' });

    const res = await request
      .post('/auth/send-otp')
      .send({ email: UNKNOWN, purpose: 'register' });

    expect(res.status).toBe(200);
  });
});

describe('verifying a code', () => {
  it('answers an address with no code and a wrong code identically', async () => {
    await createUser({ email: KNOWN });
    await request.post('/auth/send-otp').send({ email: KNOWN, purpose: 'reset' });

    const wrongCode = await request.post('/auth/verify-otp').send({ email: KNOWN, code: '000000' });
    const noCode = await request.post('/auth/verify-otp').send({ email: UNKNOWN, code: '000000' });

    expect(wrongCode.status).toBe(400);
    expect(noCode.status).toBe(wrongCode.status);
    expect(noCode.body).toEqual(wrongCode.body);
  });

  it('answers a reset with a wrong code and a reset for nobody identically', async () => {
    await createUser({ email: KNOWN });
    await request.post('/auth/send-otp').send({ email: KNOWN, purpose: 'reset' });

    const wrongCode = await request
      .post('/auth/reset-password')
      .send({ email: KNOWN, otp: '000000', newPassword: 'a-new-password' });
    const noAccount = await request
      .post('/auth/reset-password')
      .send({ email: UNKNOWN, otp: '000000', newPassword: 'a-new-password' });

    expect(wrongCode.status).toBe(400);
    expect(noAccount.status).toBe(wrongCode.status);
    expect(noAccount.body).toEqual(wrongCode.body);
  });
});

describe('the flows still work end to end', () => {
  it('registers a new account', async () => {
    const sent = await request
      .post('/auth/send-otp')
      .send({ email: UNKNOWN, username: 'newcomer', purpose: 'register' });
    expect(sent.status).toBe(200);

    const [mail] = await outbox();
    const code = codeIn(mail.text);
    expect(code).toBeDefined();

    const verified = await request.post('/auth/verify-otp').send({ email: UNKNOWN, code });
    expect(verified.status).toBe(200);

    const signedUp = await request
      .post('/auth/signup')
      .send({ username: 'newcomer', email: UNKNOWN, password: PASSWORD, otp: code });

    expect(signedUp.status).toBe(201);
    expect(signedUp.body.user).toMatchObject({ email: UNKNOWN, username: 'newcomer' });
  });

  it('resets the password of an account that exists', async () => {
    await createUser({ email: KNOWN });

    await request.post('/auth/send-otp').send({ email: KNOWN, purpose: 'reset' });
    const [mail] = await outbox();
    const code = codeIn(mail.text);

    const reset = await request
      .post('/auth/reset-password')
      .send({ email: KNOWN, otp: code, newPassword: 'a-brand-new-password' });
    expect(reset.status).toBe(200);

    const withNew = await request
      .post('/auth/signin')
      .send({ email: KNOWN, password: 'a-brand-new-password' });
    const withOld = await request.post('/auth/signin').send({ email: KNOWN, password: PASSWORD });

    expect(withNew.status).toBe(200);
    expect(withOld.status).toBe(401);
  });
});
