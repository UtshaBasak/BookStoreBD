import { createHash, randomBytes } from 'crypto';

import type { RequestHandler } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

import type { AppNonceResponse } from '@shared/api.js';

import AuthNonce from '../models/AuthNonce.model.js';
import { createLogger } from '../config/logger.js';
import type { AppGoogleBody } from '../schemas/index.js';
import { applyAdminBootstrap, beginTwoStep, signinCodesUnavailable, startSession } from './auth.controller.js';
import { languageOf, t } from '../utils/language.js';
import { googleAccountFor, type GoogleIdentity } from './google.controller.js';
import { securityEvent } from '../utils/securityLog.js';

const log = createLogger('app-google');

/**
 * "Continue with Google" in the Android app, through Android's Credential
 * Manager: the phone asks Google for an ID token addressed to this site's web
 * client, and sends it here.
 *
 * Unlike the website's redirect, the token arrives from the phone rather than
 * straight from Google, so everything about it is checked: Google's signature
 * against Google's published keys, the issuer, the audience, the expiry, a
 * verified address, and a nonce this server issued for this one sign-in.
 *
 * Needs only GOOGLE_CLIENT_ID; the secret is for the website's redirect.
 */
export const appGoogleConfigured = (): boolean => Boolean(process.env.GOOGLE_CLIENT_ID);

const NONCE_TTL_MS = 10 * 60 * 1000;
const hashNonce = (nonce: string): string => createHash('sha256').update(nonce).digest('hex');

/** GET /api/v1/app/auth/nonce - a fresh nonce for one Google sign-in. */
export const issueAppNonce: RequestHandler = async (_req, res, next) => {
  try {
    const nonce = randomBytes(32).toString('base64url');
    await AuthNonce.create({ hash: hashNonce(nonce), expiresAt: new Date(Date.now() + NONCE_TTL_MS) });
    const body: AppNonceResponse = { nonce };
    res.set('Cache-Control', 'no-store').json(body);
  } catch (error) {
    next(error);
  }
};

/** Uses a nonce up: true the first time for a live one, false ever after. */
const consumeNonce = async (nonce: string): Promise<boolean> => {
  const found = await AuthNonce.findOneAndDelete({ hash: hashNonce(nonce) });
  return Boolean(found && found.expiresAt.getTime() > Date.now());
};

let googleKeys: JWTVerifyGetKey | null = null;
const keys = (): JWTVerifyGetKey =>
  (googleKeys ??= createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'), { timeoutDuration: 8000 }));

/** A test seam: Google's keys, replaced with a test's own. */
export const setGoogleKeysForTesting = (replacement: JWTVerifyGetKey | null): void => {
  googleKeys = replacement;
};

/** The identity in a Google ID token, if Google signed it for this site; null otherwise. */
const verifyIdToken = async (idToken: string): Promise<(GoogleIdentity & { nonce: string | null }) | null> => {
  try {
    const { payload } = await jwtVerify(idToken, keys(), {
      issuer: ['https://accounts.google.com', 'accounts.google.com'],
      audience: String(process.env.GOOGLE_CLIENT_ID),
      algorithms: ['RS256'],
    });
    return {
      email: String(payload.email ?? '').toLowerCase(),
      emailVerified: payload.email_verified === true || payload.email_verified === 'true',
      name: String(payload.name ?? ''),
      sub: String(payload.sub ?? ''),
      nonce: typeof payload.nonce === 'string' ? payload.nonce : null,
    };
  } catch (error) {
    log.info({ err: error }, 'Google ID token refused');
    return null;
  }
};

const notCompleted = (req: Parameters<typeof t>[0]): string =>
  t(req, 'Google sign-in could not be completed. Please try again.', 'Google দিয়ে সাইন ইন শেষ করা যায়নি। আবার চেষ্টা করুন।');

/** POST /api/v1/app/auth/google - signs in, or up, with a Google ID token. */
export const appGoogleSignIn: RequestHandler = async (req, res, next) => {
  try {
    if (!appGoogleConfigured()) {
      res.status(503).json({ message: t(req, 'Google sign-in is not available right now.', 'Google দিয়ে সাইন ইন এখন চালু নেই।') });
      return;
    }
    const { idToken, nonce } = req.body as AppGoogleBody;
    const identity = await verifyIdToken(idToken);
    if (!identity?.email || !identity.sub) {
      securityEvent(req, 'auth.google.failure', { reason: 'bad_id_token' });
      res.status(401).json({ message: notCompleted(req) });
      return;
    }
    if (identity.nonce !== nonce || !(await consumeNonce(nonce))) {
      securityEvent(req, 'auth.google.failure', { reason: 'bad_nonce' });
      res.status(401).json({ message: notCompleted(req) });
      return;
    }
    if (!identity.emailVerified) {
      securityEvent(req, 'auth.google.failure', { reason: 'unverified' });
      res.status(401).json({
        code: 'google-unverified',
        message: t(req, 'That Google account has no verified e-mail address.', 'এই Google অ্যাকাউন্টে কোনো যাচাই করা ই-মেইল ঠিকানা নেই।'),
      });
      return;
    }

    const user = await googleAccountFor(identity, req);

    // Two-step sign-in still asks for its code, as it does on the website.
    if (user.twoFactor) {
      const challenge = await beginTwoStep(user, languageOf(req));
      if (!challenge) {
        res.status(503).json({ message: signinCodesUnavailable(req) });
        return;
      }
      // The app did not type the address, so it is told which one the code completes.
      res.status(200).json({ ...challenge, email: user.email });
      return;
    }

    await applyAdminBootstrap(user, req);
    res.status(200).json(await startSession(req, res, user, 'google'));
  } catch (error) {
    next(error);
  }
};
