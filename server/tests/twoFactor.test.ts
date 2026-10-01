/**
 * Two-step sign-in: after the password, a code sent by e-mail. The owner turns
 * it on from their profile, and needs their password to turn it off.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser, PASSWORD } from './helpers/factories.js';
import User from '../models/user.model.js';

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
beforeEach(async () => {
  await clearDatabase();
  sendMail.mockClear();
});

const EMAIL = 'reader@test.com';

/** Every mail sent so far, once the background sends have settled. */
const outbox = async (): Promise<{ to: string; subject: string; text: string }[]> => {
  const { mailSettled } = await import('../controllers/auth.controller.js');
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await Promise.all([mailSettled(), shopMailSettled()]);
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });
};

const lastCode = async (): Promise<string> => {
  const mail = (await outbox()).at(-1);
  const code = /\b(\d{6})\b/.exec(mail?.text ?? '')?.[1];
  if (!code) throw new Error('no code was sent');
  return code;
};

const signIn = () => request.post('/auth/signin').send({ email: EMAIL, password: PASSWORD });

describe('two-step sign-in', () => {
  it('is off by default: the password alone signs in', async () => {
    await createSignedInUser(request, { email: EMAIL });
    const res = await signIn();
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
  });

  it('can be turned on from the profile, and the owner is told', async () => {
    const { auth } = await createSignedInUser(request, { email: EMAIL });

    const res = await request.put('/user/me/two-factor').set('Authorization', auth).send({ enabled: true });
    expect(res.status).toBe(200);
    expect((await User.findOne({ email: EMAIL }).lean())!.twoFactor).toBe(true);
    expect((await request.get('/user/profile').set('Authorization', auth)).body.twoFactor).toBe(true);
    expect((await outbox()).map((mail) => mail.subject)).toContain('Two-step sign-in is on');
  });

  it('then asks for the e-mailed code before starting a session', async () => {
    await createSignedInUser(request, { email: EMAIL });
    await User.updateOne({ email: EMAIL }, { twoFactor: true });

    const first = await signIn();
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ twoFactor: true, sentTo: 'r•••@test.com' });
    expect(first.body.token).toBeUndefined();
    expect(first.headers['set-cookie']).toBeUndefined();

    const code = await lastCode();
    const wrong = await request.post('/auth/signin/verify').send({ email: EMAIL, code: code === '000000' ? '111111' : '000000' });
    expect(wrong.status).toBe(400);

    const done = await request.post('/auth/signin/verify').send({ email: EMAIL, code });
    expect(done.status).toBe(200);
    expect(done.body.token).toBeTruthy();
    expect(done.body.user.email).toBe(EMAIL);

    // Used once.
    expect((await request.post('/auth/signin/verify').send({ email: EMAIL, code })).status).toBe(400);
  });

  it('sends no code for a wrong password', async () => {
    await createSignedInUser(request, { email: EMAIL });
    await User.updateOne({ email: EMAIL }, { twoFactor: true });

    const res = await request.post('/auth/signin').send({ email: EMAIL, password: 'Not-The-Password-1!' });
    expect(res.status).toBe(401);
    expect(await outbox()).toHaveLength(0);
  });

  it('keeps sign-in codes apart from password reset codes', async () => {
    await createSignedInUser(request, { email: EMAIL });
    await User.updateOne({ email: EMAIL }, { twoFactor: true });

    await signIn();
    const code = await lastCode();
    expect((await request.post('/auth/verify-otp').send({ email: EMAIL, code })).status).toBe(400);
  });

  it('needs the password to be turned off', async () => {
    const { auth } = await createSignedInUser(request, { email: EMAIL });
    await User.updateOne({ email: EMAIL }, { twoFactor: true });

    const refused = await request.put('/user/me/two-factor').set('Authorization', auth).send({ enabled: false, password: 'wrong' });
    expect(refused.status).toBe(403);
    expect((await User.findOne({ email: EMAIL }).lean())!.twoFactor).toBe(true);

    const off = await request.put('/user/me/two-factor').set('Authorization', auth).send({ enabled: false, password: PASSWORD });
    expect(off.status).toBe(200);
    expect((await User.findOne({ email: EMAIL }).lean())!.twoFactor).toBe(false);
    expect((await outbox()).map((mail) => mail.subject)).toContain('Two-step sign-in is off');
  });
});
