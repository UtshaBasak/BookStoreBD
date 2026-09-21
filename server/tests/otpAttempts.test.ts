/**
 * A six-digit code lives for ten minutes. The rate limiter caps an IP at 50
 * requests per 15 minutes, but nothing counted failures against the *code*, so
 * guesses coming from several addresses were never pooled.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';

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

const EMAIL = 'someone@test.com';

/** Asks for a reset code and reads it out of the mail that was sent. */
const issueCode = async (): Promise<string> => {
  await request.post('/auth/send-otp').send({ email: EMAIL, purpose: 'reset' });
  const { mailSettled } = await import('../controllers/auth.controller.js');
  await mailSettled();

  const text = String((sendMail.mock.calls.at(-1)?.[0] as { text: string }).text);
  const code = /\b(\d{6})\b/.exec(text)?.[1];
  if (!code) throw new Error('no code was sent');
  return code;
};

/** A six-digit code that is not the one issued. */
const wrongCode = (real: string): string => (real === '000000' ? '111111' : '000000');

const verify = (code: string) => request.post('/auth/verify-otp').send({ email: EMAIL, code });

describe('guessing a one-time code', () => {
  it('still lets the real code through after a few wrong ones', async () => {
    await createUser({ email: EMAIL });
    const code = await issueCode();

    for (let attempt = 0; attempt < 4; attempt += 1) {
      expect((await verify(wrongCode(code))).status).toBe(400);
    }

    expect((await verify(code)).status).toBe(200);
  });

  it('throws the code away after five', async () => {
    await createUser({ email: EMAIL });
    const code = await issueCode();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await verify(wrongCode(code));
    }

    // The code the owner of the mailbox holds no longer works. They ask for
    // another one; whoever was guessing starts from nothing.
    expect((await verify(code)).status).toBe(400);
  });

  it('says the same thing whether the code was wrong or is gone', async () => {
    await createUser({ email: EMAIL });
    const code = await issueCode();

    const firstWrong = await verify(wrongCode(code));
    for (let attempt = 0; attempt < 5; attempt += 1) await verify(wrongCode(code));
    const afterDiscard = await verify(code);

    // "Too many attempts" would be friendlier, and would confirm that a code
    // had been issued for this address at all - which is the enumeration the
    // auth responses work to avoid.
    expect(afterDiscard.status).toBe(firstWrong.status);
    expect(afterDiscard.body).toEqual(firstWrong.body);
  });

  it('pools attempts across both endpoints that check a code', async () => {
    await createUser({ email: EMAIL });
    const code = await issueCode();

    // Three guesses at one door, two at the other: one code, five tries.
    for (let attempt = 0; attempt < 3; attempt += 1) await verify(wrongCode(code));
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request
        .post('/auth/reset-password')
        .send({ email: EMAIL, otp: wrongCode(code), newPassword: 'a-new-password' });
    }

    const res = await request
      .post('/auth/reset-password')
      .send({ email: EMAIL, otp: code, newPassword: 'a-new-password' });

    expect(res.status).toBe(400);
  });

  it('gives the owner of the mailbox a fresh start', async () => {
    await createUser({ email: EMAIL });
    const first = await issueCode();
    for (let attempt = 0; attempt < 5; attempt += 1) await verify(wrongCode(first));

    const second = await issueCode();

    expect((await verify(second)).status).toBe(200);
  });

  it('still resets a password with the right code', async () => {
    await createUser({ email: EMAIL });
    const code = await issueCode();

    const reset = await request
      .post('/auth/reset-password')
      .send({ email: EMAIL, otp: code, newPassword: 'a-brand-new-password' });

    expect(reset.status).toBe(200);

    const signIn = await request
      .post('/auth/signin')
      .send({ email: EMAIL, password: 'a-brand-new-password' });
    expect(signIn.status).toBe(200);

    const oldPassword = await request.post('/auth/signin').send({ email: EMAIL, password: PASSWORD });
    expect(oldPassword.status).toBe(401);
  });
});
