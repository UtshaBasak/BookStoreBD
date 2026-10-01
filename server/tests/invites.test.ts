/**
 * Inviting friends: an e-mail saying who invited them and what the shop is,
 * the same answer whether or not an address has an account, limits that keep
 * it from being spam, and a notice to the inviter when a friend joins.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createUserWithToken } from './helpers/factories.js';
import Invite from '../models/Invite.model.js';
import Notification from '../models/Notification.model.js';
import { creditInvites } from '../utils/invites.js';

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

const outbox = async () => {
  const { shopMailSettled } = await import('../utils/shopMail.js');
  await shopMailSettled();
  return sendMail.mock.calls.map(([mail]) => mail as { to: string; subject: string; text: string });
};
const invite = (auth: string, emails: string[], note?: string) =>
  request.post('/user/me/invites').set('Authorization', auth).send({ emails, ...(note ? { note } : {}) });

describe('inviting friends', () => {
  it('e-mails each friend who invited them, with their note', async () => {
    const rahim = await createUserWithToken({ email: 'rahim@test.com', username: 'rahim_reads' });
    const res = await invite(rahim.auth, ['Friend@Test.com', 'other@test.com'], 'You will love the Bangla section!');
    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(2);

    const mail = await outbox();
    expect(mail.map((m) => m.to).sort()).toEqual(['friend@test.com', 'other@test.com']);
    expect(mail[0].subject).toBe('rahim_reads invited you to BookStoreBD');
    expect(mail[0].text).toMatch(/You will love the Bangla section!/);
  });

  it('answers the same for an existing member, without e-mailing them', async () => {
    const rahim = await createUserWithToken({ email: 'rahim@test.com' });
    await createUserWithToken({ email: 'member@test.com' });
    const res = await invite(rahim.auth, ['member@test.com']);
    expect(res.body).toMatchObject({ sent: 1 });
    expect(await outbox()).toHaveLength(0);
  });

  it('e-mails an address at most once a week, and refuses links in the note', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    const b = await createUserWithToken({ email: 'b@test.com' });
    await invite(a.auth, ['friend@test.com']);
    await invite(a.auth, ['friend@test.com']);
    await invite(b.auth, ['friend@test.com']);
    expect((await outbox()).length).toBe(1);

    expect((await invite(a.auth, ['x@test.com'], 'Free books at www.example.com')).status).toBe(400);
    expect((await invite(a.auth, ['x@test.com'], 'see https://evil.test')).status).toBe(400);
  });

  it('limits how many a member may send in a day', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    for (let i = 0; i < 4; i += 1) {
      await invite(a.auth, [0, 1, 2, 3, 4].map((n) => `f${i}${n}@test.com`));
    }
    const over = await invite(a.auth, ['one@test.com']);
    expect(over.status).toBe(429);
    expect((await request.get('/user/me/invites').set('Authorization', a.auth)).body.remainingToday).toBe(0);
  });

  it('tells the inviter when a friend joins, and shows who joined', async () => {
    const a = await createUserWithToken({ email: 'a@test.com' });
    await invite(a.auth, ['friend@test.com', 'later@test.com']);
    await creditInvites({ email: 'friend@test.com', username: 'newfriend' });

    const notes = await Notification.find({ recipient: 'a@test.com', type: 'invite-joined' }).lean();
    expect(notes).toHaveLength(1);
    expect(notes[0].title).toBe('newfriend joined BookStoreBD');
    const list = await request.get('/user/me/invites').set('Authorization', a.auth);
    expect(list.body.items.find((i: { email: string }) => i.email === 'friend@test.com').joined).toBe(true);
    expect(await Invite.countDocuments({ joinedAt: { $ne: null } })).toBe(1);
  });
});
