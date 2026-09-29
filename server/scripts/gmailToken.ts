/**
 * Gets the long-lived token that lets the server send mail through Gmail's
 * web API - the way the live site sends, because Render's free plan blocks the
 * SMTP ports.
 *
 *   npm run gmail:token
 *
 * Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET in server/.env, from a Google
 * Cloud OAuth client of type "Desktop app". Opens the browser, asks the Gmail
 * account in SMTP_USER to allow sending, and writes GMAIL_REFRESH_TOKEN into
 * server/.env. The token is never printed; copy it from .env into Render.
 *
 * Only the "send" permission is asked for: the server can send as the
 * account, and cannot read its mail.
 */
import { spawn } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { resolve } from 'node:path';

import dotenv from 'dotenv';

const ENV_FILE = resolve(import.meta.dirname, '..', '.env');
dotenv.config({ path: ENV_FILE, quiet: true });

const SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const clientId = process.env.GMAIL_CLIENT_ID?.trim();
const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
const account = process.env.SMTP_USER?.trim();

const say = (...lines: string[]): void => console.log(lines.map((l) => `[gmail] ${l}`).join('\n'));

if (!clientId || !clientSecret) {
  say(
    'GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are missing from server/.env.',
    'Create a Google Cloud OAuth client of type "Desktop app" and add both lines first.'
  );
  process.exit(1);
}

/** Writes or replaces one line of server/.env, keeping the rest as it was. */
const saveToEnv = (key: string, value: string): void => {
  const text = readFileSync(ENV_FILE, 'utf8');
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  const next = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\s*$/, '')}${eol}${line}${eol}`;
  writeFileSync(ENV_FILE, next);
};

const openInBrowser = (url: string): void => {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).on('error', () => undefined).unref();
};

// PKCE and a state value: the code Google sends back can only be exchanged
// by this process, for this request.
const verifier = randomBytes(32).toString('base64url');
const challenge = createHash('sha256').update(verifier).digest('base64url');
const state = randomBytes(16).toString('hex');

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname !== '/') {
    res.writeHead(404).end();
    return;
  }

  const finish = (status: number, message: string, exitCode: number): void => {
    res.writeHead(status, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>BookStoreBD</title>
<body style="font-family:Arial,sans-serif;max-width:32rem;margin:4rem auto;line-height:1.5">
<h1 style="color:#6d5454">BookStoreBD</h1><p>${message}</p><p>You can close this tab.</p></body>`);
    server.close();
    setTimeout(() => process.exit(exitCode), 100);
  };

  if (url.searchParams.get('state') !== state) {
    finish(400, 'That did not come from this request. Run <code>npm run gmail:token</code> again.', 1);
    return;
  }
  const error = url.searchParams.get('error');
  const code = url.searchParams.get('code');
  if (error || !code) {
    say(`Google said: ${error ?? 'no code'}. Nothing was saved.`);
    finish(400, `Google said: ${error ?? 'no code'}. Nothing was saved.`, 1);
    return;
  }

  void (async () => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const exchange = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: `http://127.0.0.1:${String(port)}`,
      }),
    });
    const body = (await exchange.json().catch(() => ({}))) as {
      refresh_token?: string;
      scope?: string;
      error?: string;
      error_description?: string;
    };

    if (!exchange.ok || !body.refresh_token) {
      const why = body.error ? `${body.error} ${body.error_description ?? ''}` : `status ${String(exchange.status)}`;
      say(`Could not get a token: ${why}`);
      finish(500, 'Could not get a token - see the terminal.', 1);
      return;
    }
    if (!body.scope?.includes(SCOPE)) {
      say('Sending was not allowed on the consent screen, so the token cannot send mail. Run it again and tick it.');
      finish(400, 'Sending was not allowed. Run it again and allow it.', 1);
      return;
    }

    saveToEnv('GMAIL_REFRESH_TOKEN', body.refresh_token);
    say(
      'Done. GMAIL_REFRESH_TOKEN is saved in server/.env (not shown here).',
      'Copy it, with GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET, into Render -> Environment.'
    );
    finish(200, 'Done - the token is saved in <code>server/.env</code>. Copy it into Render next.', 0);
  })();
});

server.listen(0, '127.0.0.1', () => {
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  const auth = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  auth.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `http://127.0.0.1:${String(port)}`,
    response_type: 'code',
    scope: SCOPE,
    // offline + consent: a refresh token, every time this is run.
    access_type: 'offline',
    prompt: 'consent',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    ...(account ? { login_hint: account } : {}),
  }).toString();

  say(
    `Opening your browser. Sign in as ${account ?? 'the shop account'} and allow sending.`,
    'If it does not open, paste this into the browser:',
    '',
    auth.toString(),
    ''
  );
  openInBrowser(auth.toString());
});

// Nobody signing in within ten minutes: stop rather than wait for ever.
setTimeout(() => {
  say('No answer from the browser within 10 minutes. Nothing was saved.');
  process.exit(1);
}, 10 * 60 * 1000).unref();
