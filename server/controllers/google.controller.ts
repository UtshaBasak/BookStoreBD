import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

import type { Request, RequestHandler, Response } from 'express';

import User from '../models/user.model.js';
import { API_PREFIX } from '../config/apiPaths.js';
import { config, jwtSecret } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { publicSiteUrl } from '../config/siteUrl.js';
import { creditInvites } from '../utils/invites.js';
import { welcomeNewMember } from '../utils/welcome.js';
import { applyAdminBootstrap, beginTwoStep, startSession } from './auth.controller.js';
import { hashPassword } from '../utils/passwordHash.js';

const log = createLogger('google');

/**
 * "Continue with Google", by the standard redirect: the browser goes to
 * Google, comes back here with a one-time code, and this server swaps the code
 * for the person's verified e-mail address. No Google script runs on the
 * site's own pages.
 *
 * An address already registered signs in to that account; a new one gets an
 * account, the same welcome as any other, and no password until they choose
 * one. Two-step sign-in, where it is on, still asks for its code.
 *
 * On when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 */
export const googleConfigured = (): boolean => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const STATE_COOKIE = 'googleSignIn';
const STATE_PATH = `${API_PREFIX}/auth/google`;
const STATE_TTL_MS = 10 * 60 * 1000;

const base64url = (buffer: Buffer): string => buffer.toString('base64url');

/** Where Google sends the browser back to: configured, or worked out from the request. */
const redirectUri = (req: Request): string =>
  process.env.GOOGLE_REDIRECT_URI?.trim() || `${publicSiteUrl(req)}${API_PREFIX}/auth/google/callback`;

/** A page on this site to finish on; anything else becomes the homepage. */
const safeNext = (value: unknown): string => {
  const next = typeof value === 'string' ? value : '';
  return /^\/(?!\/)[\w\-./?=&#%]*$/.test(next) ? next : '/';
};

interface SignInState {
  state: string;
  verifier: string;
  next: string;
  expires: number;
}

/** The state travels in a signed cookie, so nothing about it is kept on the server. */
const seal = (value: SignInState): string => {
  const body = base64url(Buffer.from(JSON.stringify(value)));
  return `${body}.${base64url(createHmac('sha256', jwtSecret()).update(body).digest())}`;
};
const unseal = (cookie: string | undefined): SignInState | null => {
  if (!cookie) return null;
  const [body, signature] = cookie.split('.');
  if (!body || !signature) return null;
  const expected = createHmac('sha256', jwtSecret()).update(body).digest();
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const value = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SignInState;
    return value.expires > Date.now() ? value : null;
  } catch {
    return null;
  }
};

const cookieOptions = () => ({
  httpOnly: true,
  secure: config.cookies.secure,
  // Lax, not strict: the browser comes back from Google, another site.
  sameSite: 'lax' as const,
  path: STATE_PATH,
});

/** Back to the sign-in page with a reason, after the hash so it is never logged. */
const fail = (res: Response, reason: string): void => {
  res.clearCookie(STATE_COOKIE, cookieOptions());
  res.redirect(303, `/sign-in#google-error=${encodeURIComponent(reason)}`);
};

/** GET /auth/google - off to Google. */
export const startGoogleSignIn: RequestHandler = (req, res) => {
  if (!googleConfigured()) {
    res.redirect(303, '/sign-in#google-error=unavailable');
    return;
  }
  const verifier = base64url(randomBytes(32));
  const state = base64url(randomBytes(24));
  res.cookie(
    STATE_COOKIE,
    seal({ state, verifier, next: safeNext(req.query.next), expires: Date.now() + STATE_TTL_MS }),
    { ...cookieOptions(), maxAge: STATE_TTL_MS }
  );
  const params = new URLSearchParams({
    client_id: String(process.env.GOOGLE_CLIENT_ID),
    redirect_uri: redirectUri(req),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: base64url(createHash('sha256').update(verifier).digest()),
    code_challenge_method: 'S256',
    prompt: 'select_account',
  });
  res.redirect(303, `${AUTH_URL}?${params.toString()}`);
};

/** A username like the person's name, made unique. */
const usernameFor = async (name: string, email: string): Promise<string> => {
  const base =
    (name || email.split('@')[0] || 'reader')
      .normalize('NFKD')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 20) || 'reader';
  const padded = base.length < 3 ? `${base}_reader` : base;
  if (!(await User.exists({ username: padded }))) return padded;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = `${padded}_${Math.floor(100 + Math.random() * 9900)}`;
    if (!(await User.exists({ username: candidate }))) return candidate;
  }
  return `${padded}_${base64url(randomBytes(4))}`;
};

/** What Google says about the person, from the ID token it just handed over. */
interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name: string;
  sub: string;
}

/**
 * The token came straight from Google's token endpoint over TLS, in exchange
 * for our client secret, so its claims are Google's (OpenID Connect Core,
 * 3.1.3.7). Its audience, issuer and expiry are still checked.
 */
const identityFrom = (idToken: string): GoogleIdentity | null => {
  try {
    const claims = JSON.parse(Buffer.from(idToken.split('.')[1] ?? '', 'base64url').toString('utf8')) as Record<string, unknown>;
    const issuer = String(claims.iss ?? '');
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID) return null;
    if (issuer !== 'https://accounts.google.com' && issuer !== 'accounts.google.com') return null;
    if (Number(claims.exp) * 1000 < Date.now()) return null;
    return {
      email: String(claims.email ?? '').toLowerCase(),
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
      name: String(claims.name ?? ''),
      sub: String(claims.sub ?? ''),
    };
  } catch {
    return null;
  }
};

/** GET /auth/google/callback - back from Google with a code, or a refusal. */
export const finishGoogleSignIn: RequestHandler = async (req, res) => {
  try {
    if (!googleConfigured()) return fail(res, 'unavailable');
    if (req.query.error) return fail(res, 'cancelled');

    const saved = unseal((req.cookies as Record<string, string> | undefined)?.[STATE_COOKIE]);
    if (!saved || typeof req.query.state !== 'string' || req.query.state !== saved.state) return fail(res, 'expired');
    if (typeof req.query.code !== 'string') return fail(res, 'failed');

    const exchange = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: req.query.code,
        client_id: String(process.env.GOOGLE_CLIENT_ID),
        client_secret: String(process.env.GOOGLE_CLIENT_SECRET),
        redirect_uri: redirectUri(req),
        grant_type: 'authorization_code',
        code_verifier: saved.verifier,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const tokens = (await exchange.json()) as { id_token?: string };
    const identity = tokens.id_token ? identityFrom(tokens.id_token) : null;
    if (!exchange.ok || !identity?.email) {
      log.warn({ status: exchange.status }, 'Google sign-in exchange failed');
      return fail(res, 'failed');
    }
    if (!identity.emailVerified) return fail(res, 'unverified');

    let user = await User.findOne({ email: identity.email });
    if (!user) {
      user = await User.create({
        username: await usernameFor(identity.name, identity.email),
        email: identity.email,
        // Nobody knows this one; they can set their own from the profile.
        password: hashPassword(base64url(randomBytes(32))),
        passwordSet: false,
        googleId: identity.sub,
      });
      await applyAdminBootstrap(user);
      await welcomeNewMember(user);
      await creditInvites(user);
      log.info('New account through Google');
    } else if (!user.googleId) {
      user.googleId = identity.sub;
      await user.save();
    }

    res.clearCookie(STATE_COOKIE, cookieOptions());

    if (user.twoFactor) {
      const challenge = await beginTwoStep(user);
      if (!challenge) return fail(res, 'codes');
      // The address the code completes, in the hash: it never reaches a log.
      res.redirect(303, `/sign-in?next=${encodeURIComponent(saved.next)}#google-2fa=${encodeURIComponent(user.email)}`);
      return;
    }

    await applyAdminBootstrap(user);
    await startSession(req, res, user);
    // The page picks the session up from the refresh cookie just set.
    res.redirect(303, `/sign-in?google=done&next=${encodeURIComponent(saved.next)}`);
  } catch (error) {
    log.error({ err: error }, 'Google sign-in failed');
    fail(res, 'failed');
  }
};
