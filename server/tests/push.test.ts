/**
 * Push notifications to the Android app: a phone's token is filed under the
 * session it is signed in with, every push carries only a kind and an id, and
 * signing out stops them.
 */
import { generateKeyPairSync } from 'crypto';

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';
import { makePhone } from './helpers/appDevice.js';
import Notification from '../models/Notification.model.js';
import PushDevice from '../models/PushDevice.model.js';
import { notify } from '../utils/notify.js';
import { forgetPushCredentials, pushSettled } from '../utils/push.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);

let clientIp = '';
let nextIp = 1;

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const SERVICE_ACCOUNT = JSON.stringify({
  type: 'service_account',
  project_id: 'bookstorebd-test',
  client_email: 'push@bookstorebd-test.iam.gserviceaccount.com',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  token_uri: 'https://oauth2.googleapis.com/token',
});
const PUSH_TOKEN = 'fcm-token-for-the-test-phone:APA91bExampleExampleExample';

interface Sent {
  url: string;
  body: { message: { token: string; data: Record<string, string>; android: { priority: string } } };
}
let sent: Sent[] = [];
/** What FCM answers for each token; anything not named here is accepted. */
let fcmAnswers: Record<string, Response> = {};

beforeEach(async () => {
  await clearDatabase();
  clientIp = `198.51.100.${nextIp++}`;
  sent = [];
  fcmAnswers = {};
  forgetPushCredentials();
  process.env.FIREBASE_SERVICE_ACCOUNT = SERVICE_ACCOUNT;
  const realFetch = globalThis.fetch;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      if (url === 'https://oauth2.googleapis.com/token') {
        return new Response(JSON.stringify({ access_token: 'google-access-token', expires_in: 3600 }));
      }
      if (url.startsWith('https://fcm.googleapis.com/')) {
        const body = JSON.parse(String(init?.body)) as Sent['body'];
        sent.push({ url, body });
        return fcmAnswers[body.message.token] ?? new Response(JSON.stringify({ name: 'projects/x/messages/1' }));
      }
      return realFetch(input, init);
    })
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.FIREBASE_SERVICE_ACCOUNT;
  forgetPushCredentials();
});

const EMAIL = 'reader@test.com';

/** Signs in on a phone, as the app does: the access token and the session's refresh token. */
const appSignIn = async (email = EMAIL) => {
  const res = await request
    .post('/api/v1/app/auth/signin')
    .set('X-Forwarded-For', clientIp)
    .set('X-Client', 'android/300')
    .send({ email, password: PASSWORD, device: makePhone().device });
  expect(res.status).toBe(200);
  return { token: res.body.token as string, refreshToken: res.body.refreshToken as string };
};

const register = (session: { token: string; refreshToken: string }, pushToken = PUSH_TOKEN) =>
  request
    .post('/api/v1/app/push')
    .set('X-Forwarded-For', clientIp)
    .set('X-Client', 'android/300')
    .set('Authorization', `Bearer ${session.token}`)
    .send({ refreshToken: session.refreshToken, pushToken });

const tellReader = async () => {
  await notify([EMAIL], { type: 'order-status', title: 'Your order has shipped', body: 'Order ABC is on its way', link: '/order-tracking/ABC' });
  await pushSettled();
};

describe('registering a phone', () => {
  it('files the token under the caller’s own session', async () => {
    await createUser({ email: EMAIL });
    const session = await appSignIn();

    const res = await register(session);

    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(true);
    expect(await PushDevice.countDocuments({ token: PUSH_TOKEN })).toBe(1);
  });

  it('refuses a session that belongs to somebody else', async () => {
    await createUser({ email: EMAIL });
    await createUser({ email: 'other@test.com', username: 'other' });
    const mine = await appSignIn();
    const theirs = await appSignIn('other@test.com');

    const res = await register({ token: mine.token, refreshToken: theirs.refreshToken });

    expect(res.status).toBe(401);
    expect(await PushDevice.countDocuments()).toBe(0);
  });

  it('keeps one row per phone when the token changes or the phone signs in again', async () => {
    await createUser({ email: EMAIL });
    const first = await appSignIn();
    await register(first);
    await register(first, `${PUSH_TOKEN}-renewed`);
    const second = await appSignIn();
    await register(second, `${PUSH_TOKEN}-renewed`);

    expect(await PushDevice.countDocuments()).toBe(1);
  });

  it('refuses something that is not a push token', async () => {
    await createUser({ email: EMAIL });
    const res = await register(await appSignIn(), 'not a token <script>');
    expect(res.status).toBe(400);
  });
});

describe('sending', () => {
  it('pushes only the kind and the id, never what the notification says', async () => {
    await createUser({ email: EMAIL });
    await register(await appSignIn());

    await tellReader();

    const saved = await Notification.findOne({ recipient: EMAIL }).lean();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.url).toBe('https://fcm.googleapis.com/v1/projects/bookstorebd-test/messages:send');
    expect(sent[0]!.body.message.token).toBe(PUSH_TOKEN);
    expect(sent[0]!.body.message.data).toEqual({ kind: 'notification', id: String(saved?._id) });
    expect(sent[0]!.body.message.android.priority).toBe('high');
    expect(JSON.stringify(sent[0]!.body)).not.toContain('shipped');
  });

  it('stops when the phone signs out', async () => {
    await createUser({ email: EMAIL });
    const session = await appSignIn();
    await register(session);

    await request.post('/api/v1/app/auth/logout').set('X-Forwarded-For', clientIp).send({ refreshToken: session.refreshToken });
    await tellReader();

    expect(sent).toHaveLength(0);
    expect(await PushDevice.countDocuments()).toBe(0);
  });

  it('forgets a token FCM says is no longer registered', async () => {
    await createUser({ email: EMAIL });
    await register(await appSignIn());
    fcmAnswers[PUSH_TOKEN] = new Response(
      JSON.stringify({ error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }),
      { status: 404 }
    );

    await tellReader();

    expect(sent).toHaveLength(1);
    expect(await PushDevice.countDocuments()).toBe(0);
  });

  it('sends nothing, and calls nobody, while the server has no Firebase key', async () => {
    delete process.env.FIREBASE_SERVICE_ACCOUNT;
    await createUser({ email: EMAIL });
    await register(await appSignIn());

    await tellReader();

    expect(sent).toHaveLength(0);
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('googleapis'))).toBe(false);
  });

  it('pushes a chat message to its receiver as a chat id', async () => {
    const sender = await createUser({ email: 'seller@test.com', username: 'seller' });
    await createUser({ email: EMAIL });
    await register(await appSignIn());
    const senderSession = await request
      .post('/api/v1/app/auth/signin')
      .set('X-Forwarded-For', clientIp)
      .set('X-Client', 'android/300')
      .send({ email: sender.email, password: PASSWORD, device: makePhone().device });

    const res = await request
      .post('/api/v1/chat/message')
      .set('X-Forwarded-For', clientIp)
      .set('X-Client', 'android/300')
      .set('Authorization', `Bearer ${senderSession.body.token as string}`)
      .send({ receiver: EMAIL, message: 'Is the book still available?' });
    await pushSettled();

    expect(res.status).toBe(201);
    expect(sent.map((s) => s.body.message.data)).toEqual([{ kind: 'chat', id: res.body._id }]);
  });
});

describe('one notification by id', () => {
  it('is given to its recipient and nobody else', async () => {
    await createUser({ email: EMAIL });
    await createUser({ email: 'other@test.com', username: 'other' });
    await tellReader();
    const saved = await Notification.findOne({ recipient: EMAIL }).lean();
    const mine = await appSignIn();
    const theirs = await appSignIn('other@test.com');

    const own = await request
      .get(`/api/v1/notification/${String(saved?._id)}`)
      .set('X-Client', 'android/300')
      .set('Authorization', `Bearer ${mine.token}`);
    const other = await request
      .get(`/api/v1/notification/${String(saved?._id)}`)
      .set('X-Client', 'android/300')
      .set('Authorization', `Bearer ${theirs.token}`);

    expect(own.status).toBe(200);
    expect(own.body).toMatchObject({ title: 'Your order has shipped', link: '/order-tracking/ABC', read: false });
    expect(other.status).toBe(404);
  });
});
