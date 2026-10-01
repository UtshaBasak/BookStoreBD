import type { RequestHandler } from 'express';

import { createLogger } from '../config/logger.js';

const log = createLogger('captcha');

/**
 * The bot check on sign-up and sign-in: Cloudflare Turnstile. Usually it
 * passes without the visitor doing anything; now and then it asks them to
 * tick a box.
 *
 * On when TURNSTILE_SECRET_KEY and TURNSTILE_SITE_KEY are set, off otherwise,
 * so a local copy works without an account. Read when used rather than at
 * start-up, so the keys can be set without a code change.
 */
export const captchaSiteKey = (): string | null =>
  (process.env.TURNSTILE_SECRET_KEY && process.env.TURNSTILE_SITE_KEY?.trim()) || null;

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** Whether Cloudflare vouches for this token, for this visitor. */
export const captchaPasses = async (token: string | undefined, ip: string | undefined): Promise<boolean> => {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) });
    const res = await fetch(VERIFY_URL, { method: 'POST', body, signal: AbortSignal.timeout(8000) });
    const result = (await res.json()) as { success?: boolean; 'error-codes'?: string[] };
    if (!result.success) log.info({ codes: result['error-codes'] }, 'Captcha refused');
    return result.success === true;
  } catch (error) {
    // Cloudflare unreachable: better to let a person in than to lock everyone out.
    log.warn({ err: error }, 'Captcha check unavailable; letting the request through');
    return true;
  }
};

/** Refuses a sign-in or a sign-up code until the bot check is passed. */
export const requireCaptcha: RequestHandler = async (req, res, next) => {
  const token = (req.body as { captchaToken?: string } | undefined)?.captchaToken;
  if (await captchaPasses(token, req.ip)) {
    next();
    return;
  }
  res.status(400).json({ code: 'captcha', message: 'Please complete the security check and try again.' });
};
