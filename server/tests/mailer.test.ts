/**
 * Sending through Gmail's web API.
 *
 * Render's free plan blocks the SMTP ports: on the live site every code timed
 * out ("Connection timeout", then "ENETUNREACH ...:465") and nobody could sign
 * up or reset a password. With a Gmail API token set, mail goes over HTTPS.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GMAIL = {
  SMTP_USER: 'support.utsha@gmail.com',
  GMAIL_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  GMAIL_CLIENT_SECRET: 'client-secret',
  GMAIL_REFRESH_TOKEN: 'refresh-token',
};

const loadMailer = async (env: Record<string, string>) => {
  Object.assign(process.env, env);
  vi.resetModules();
  return import('../utils/mailer.js');
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let calls: { url: string; init?: RequestInit }[];

beforeEach(() => {
  calls = [];
});

afterEach(() => {
  for (const key of [...Object.keys(GMAIL), 'SMTP_PASS']) delete process.env[key];
  vi.unstubAllGlobals();
  vi.resetModules();
});

const stubGoogle = (token: Response = json(200, { access_token: 'access-1', expires_in: 3600 })) =>
  vi.stubGlobal(
    'fetch',
    vi.fn((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('oauth2.googleapis.com/token')) return Promise.resolve(token.clone());
      return Promise.resolve(json(200, { id: 'msg-1' }));
    })
  );

const MAIL = { to: 'buyer@test.com', subject: 'Your BookStoreBD sign-up code', text: 'Your code: 208915', html: '<p>208915</p>' };

describe('with a Gmail API token', () => {
  it('sends over HTTPS as the shop, not over the blocked SMTP ports', async () => {
    stubGoogle();
    const { sendMail, mailTransport } = await loadMailer(GMAIL);

    await sendMail(MAIL);

    expect(mailTransport()).toBe('gmail-api');
    const send = calls.find((c) => c.url.includes('gmail.googleapis.com'));
    expect(new Headers(send?.init?.headers).get('Authorization')).toBe('Bearer access-1');

    const raw = Buffer.from(JSON.parse(String(send?.init?.body)).raw, 'base64url').toString('utf8');
    expect(raw).toMatch(/^From: BookStoreBD <support\.utsha@gmail\.com>$/m);
    expect(raw).toMatch(/^To: buyer@test\.com$/m);
    expect(raw).toMatch(/^Subject: Your BookStoreBD sign-up code$/m);
    expect(raw).toContain('text/html');
  });

  it('reuses the access token rather than asking Google for one per e-mail', async () => {
    stubGoogle();
    const { sendMail } = await loadMailer(GMAIL);

    await sendMail(MAIL);
    await sendMail(MAIL);

    expect(calls.filter((c) => c.url.includes('oauth2')).length).toBe(1);
    expect(calls.filter((c) => c.url.includes('gmail.googleapis.com')).length).toBe(2);
  });

  it('says plainly when the token has been revoked, so the fix is obvious', async () => {
    stubGoogle(json(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }));
    const { sendMail } = await loadMailer(GMAIL);

    await expect(sendMail(MAIL)).rejects.toThrow(/invalid_grant/);
  });
});

describe('whether mail can be sent at all', () => {
  it('needs an address and one way to send from it', async () => {
    expect((await loadMailer({ SMTP_USER: GMAIL.SMTP_USER })).mailConfigured()).toBe(false);
    expect((await loadMailer({ SMTP_USER: GMAIL.SMTP_USER, SMTP_PASS: 'app-password' })).mailTransport()).toBe('smtp');
    expect((await loadMailer(GMAIL)).mailTransport()).toBe('gmail-api');
  });
});
