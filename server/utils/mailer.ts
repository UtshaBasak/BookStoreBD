/**
 * Sends the shop's e-mail, one of two ways.
 *
 * - Gmail's web API, over HTTPS, when GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and
 *   GMAIL_REFRESH_TOKEN are set. Render's free plan blocks the SMTP ports, so
 *   this is how the live site sends.
 * - SMTP with an App Password otherwise, which is fine anywhere the ports are
 *   open, such as a developer's machine.
 *
 * Either way the message comes from the shop's own Gmail account, so it is
 * signed by Google and arrives as reliably as mail sent from Gmail itself.
 */
import nodemailer from 'nodemailer';

import { config } from '../config/env.js';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';

const gmailApiConfigured = (): boolean =>
  Boolean(config.gmailApi.clientId && config.gmailApi.clientSecret && config.gmailApi.refreshToken);

/** Whether mail can be sent at all: an address, and one way to send from it. */
export const mailConfigured = (): boolean =>
  Boolean(config.smtp.user && (gmailApiConfigured() || config.smtp.pass));

/** Which way mail goes, for the start-up log. */
export const mailTransport = (): 'gmail-api' | 'smtp' | 'none' =>
  !mailConfigured() ? 'none' : gmailApiConfigured() ? 'gmail-api' : 'smtp';

/** A name beside the address: a bare Gmail address reads like phishing. */
const sender = () => ({ name: 'BookStoreBD', address: String(config.smtp.user) });

// ---------------------------------------------------------------- Gmail API

/** An access token lasts an hour; one is reused until shortly before then. */
let cachedToken: { value: string; expiresAt: number } | null = null;

/** For tests: forget the cached access token. */
export const resetMailerForTests = (): void => {
  cachedToken = null;
};

const accessToken = async (): Promise<string> => {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: String(config.gmailApi.clientId),
      client_secret: String(config.gmailApi.clientSecret),
      refresh_token: String(config.gmailApi.refreshToken),
      grant_type: 'refresh_token',
    }),
  });
  const body = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };
  if (!res.ok || !body.access_token) {
    // Google's error code only - "invalid_grant" means the refresh token was
    // revoked or has expired and `npm run gmail:token` must be run again.
    throw new Error(`Gmail token refresh failed: ${res.status} ${body.error ?? ''} ${body.error_description ?? ''}`.trim());
  }
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
};

/** The whole message as RFC 822, built by nodemailer without sending it. */
const compose = async (mail: OutgoingMail): Promise<Buffer> => {
  const composer = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const info = await composer.sendMail({ from: sender(), ...mail });
  return info.message as Buffer;
};

const sendWithGmailApi = async (mail: OutgoingMail): Promise<void> => {
  const raw = (await compose(mail)).toString('base64url');
  const res = await fetch(SEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${await accessToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    // A stale access token is dropped so the next send fetches a fresh one.
    if (res.status === 401) cachedToken = null;
    const detail = (await res.text().catch(() => '')).slice(0, 300);
    throw new Error(`Gmail API send failed: ${res.status} ${detail}`);
  }
};

// --------------------------------------------------------------------- SMTP

const sendWithSmtp = async (mail: OutgoingMail): Promise<void> => {
  const transport = nodemailer.createTransport({
    service: config.smtp.service,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
  await transport.sendMail({ from: sender(), ...mail });
};

export const sendMail = async (mail: OutgoingMail): Promise<void> => {
  if (gmailApiConfigured()) return sendWithGmailApi(mail);
  return sendWithSmtp(mail);
};
