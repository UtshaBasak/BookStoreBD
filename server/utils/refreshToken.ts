import { createHash, randomBytes, randomUUID } from 'crypto';

import type { Types } from 'mongoose';

import RefreshToken from '../models/RefreshToken.model.js';
import { config } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('refresh-token');

/**
 * Refresh tokens are opaque random strings, not JWTs: there is nothing to read
 * out of one, and revoking it is a database write rather than a signature
 * trick. Only the hash is stored.
 */
const TOKEN_BYTES = 48;

/**
 * How long after an Android token is exchanged the same phone may present it
 * again. A refresh whose answer was lost on a weak mobile connection is retried
 * with the old token; without this window the retry would read as theft and
 * sign the person out.
 */
export const ANDROID_RETRY_WINDOW_MS = 60 * 1000;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const expiryDate = (): Date => new Date(Date.now() + config.jwt.refreshTtlMs);

export type SessionClient = 'web' | 'android';

/** Who holds a session: the website by default, or an Android phone and its key. */
export interface SessionHolder {
  client: SessionClient;
  deviceKey?: string | null;
  deviceName?: string;
}

const WEB: SessionHolder = { client: 'web' };

export interface IssuedRefreshToken {
  token: string;
  family: string;
  expiresAt: Date;
}

/**
 * Issues a token, either starting a new family (a fresh sign-in) or continuing
 * an existing one (a rotation).
 */
export const issueRefreshToken = async (
  userId: Types.ObjectId,
  family: string = randomUUID(),
  holder: SessionHolder = WEB
): Promise<IssuedRefreshToken> => {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');
  const expiresAt = expiryDate();

  await RefreshToken.create({
    tokenHash: hashToken(token),
    user: userId,
    family,
    expiresAt,
    client: holder.client,
    deviceKey: holder.deviceKey ?? null,
    deviceName: holder.deviceName ?? '',
  });

  return { token, family, expiresAt };
};

/** Revokes every token in a family. Used on logout and on replay. */
export const revokeFamily = async (family: string): Promise<number> => {
  const { modifiedCount } = await RefreshToken.updateMany(
    { family, revokedAt: null },
    { revokedAt: new Date() }
  );
  return modifiedCount;
};

export const revokeAllForUser = async (userId: Types.ObjectId): Promise<number> => {
  const { modifiedCount } = await RefreshToken.updateMany(
    { user: userId, revokedAt: null },
    { revokedAt: new Date() }
  );
  return modifiedCount;
};

/**
 * Signs out every other session: all the user's tokens but the family of the
 * one presented, so the person making the change stays signed in.
 */
export const revokeOtherSessions = async (userId: Types.ObjectId, presentedToken: string | null): Promise<number> => {
  const current = presentedToken
    ? await RefreshToken.findOne({ tokenHash: hashToken(presentedToken), user: userId }, { family: 1 }).lean()
    : null;
  const { modifiedCount } = await RefreshToken.updateMany(
    { user: userId, revokedAt: null, ...(current ? { family: { $ne: current.family } } : {}) },
    { revokedAt: new Date() }
  );
  return modifiedCount;
};

/** Why a presented token was not accepted. Never told to the caller. */
export type RotationFailureReason = 'missing' | 'unknown' | 'revoked' | 'reused' | 'expired' | 'wrong-client' | 'device';

export type RotationResult =
  | ({ ok: true; userId: Types.ObjectId } & IssuedRefreshToken)
  | { ok: false; reason: RotationFailureReason };

export interface RotationOptions {
  /** Which endpoint is asking: each accepts only its own kind of token. */
  client: SessionClient;
  /**
   * Android only: whether the request was signed by the session's own key.
   * Given the stored public key; see utils/deviceKey.ts.
   */
  provesDevice?: (deviceKey: string | null) => boolean;
  now?: number;
}

/**
 * Exchanges a refresh token for a new one.
 *
 * Returns `{ ok: false, reason }` rather than throwing, so the caller can
 * answer with a plain 401 and reveal nothing about why.
 */
export const rotateRefreshToken = async (
  presentedToken: unknown,
  { client, provesDevice, now = Date.now() }: RotationOptions = { client: 'web' }
): Promise<RotationResult> => {
  if (typeof presentedToken !== 'string' || !presentedToken) {
    return { ok: false, reason: 'missing' };
  }

  const existing = await RefreshToken.findOne({ tokenHash: hashToken(presentedToken) });

  if (!existing) return { ok: false, reason: 'unknown' };

  // A website token at the app's endpoint, or the other way round. Refused
  // without touching the session: presenting it proves nothing either way.
  if ((existing.client ?? 'web') !== client) return { ok: false, reason: 'wrong-client' };

  if (existing.revokedAt) return { ok: false, reason: 'revoked' };

  const holder: SessionHolder = {
    client,
    deviceKey: existing.deviceKey ?? null,
    deviceName: existing.deviceName ?? '',
  };

  // An Android token is only good with a signature from the phone it was issued to.
  if (client === 'android' && !provesDevice?.(holder.deviceKey ?? null)) {
    log.warn({ family: existing.family }, 'Android refresh without a valid device signature');
    return { ok: false, reason: 'device' };
  }

  if (existing.rotatedAt) {
    // The same phone retrying a refresh whose answer it never received: the
    // token issued then is replaced, if it was never used, and the session
    // carries on.
    if (client === 'android' && now - existing.rotatedAt.getTime() <= ANDROID_RETRY_WINDOW_MS && existing.replacedBy) {
      const successor = await RefreshToken.findOne({ tokenHash: existing.replacedBy });
      if (successor && !successor.rotatedAt && !successor.revokedAt) {
        successor.revokedAt = new Date(now);
        await successor.save();
        const next = await issueRefreshToken(existing.user, existing.family, holder);
        existing.replacedBy = hashToken(next.token);
        await existing.save();
        return { ok: true, userId: existing.user, ...next };
      }
    }

    // This token was already exchanged. Either it was stolen and replayed, or
    // the legitimate client retried; either way the family can no longer be
    // trusted, so every session started from that sign-in ends.
    const revoked = await revokeFamily(existing.family);
    log.warn(
      { family: existing.family, revoked },
      'Refresh token reuse detected; family revoked'
    );
    return { ok: false, reason: 'reused' };
  }

  if (existing.expiresAt.getTime() <= now) return { ok: false, reason: 'expired' };

  const next = await issueRefreshToken(existing.user, existing.family, holder);
  existing.rotatedAt = new Date(now);
  existing.replacedBy = hashToken(next.token);
  await existing.save();

  return { ok: true, userId: existing.user, ...next };
};

export default {
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamily,
  revokeAllForUser,
  hashToken,
};
