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

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

const expiryDate = (): Date => new Date(Date.now() + config.jwt.refreshTtlMs);

export interface IssuedRefreshToken {
  token: string;
  family: string;
}

/**
 * Issues a token, either starting a new family (a fresh sign-in) or continuing
 * an existing one (a rotation).
 */
export const issueRefreshToken = async (
  userId: Types.ObjectId,
  family: string = randomUUID()
): Promise<IssuedRefreshToken> => {
  const token = randomBytes(TOKEN_BYTES).toString('base64url');

  await RefreshToken.create({
    tokenHash: hashToken(token),
    user: userId,
    family,
    expiresAt: expiryDate(),
  });

  return { token, family };
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

/** Why a presented token was not accepted. Never told to the caller. */
export type RotationFailureReason = 'missing' | 'unknown' | 'revoked' | 'reused' | 'expired';

export type RotationResult =
  | ({ ok: true; userId: Types.ObjectId } & IssuedRefreshToken)
  | { ok: false; reason: RotationFailureReason };

/**
 * Exchanges a refresh token for a new one.
 *
 * Returns `{ ok: false, reason }` rather than throwing, so the caller can
 * answer with a plain 401 and reveal nothing about why.
 */
export const rotateRefreshToken = async (presentedToken: unknown): Promise<RotationResult> => {
  if (typeof presentedToken !== 'string' || !presentedToken) {
    return { ok: false, reason: 'missing' };
  }

  const existing = await RefreshToken.findOne({ tokenHash: hashToken(presentedToken) });

  if (!existing) return { ok: false, reason: 'unknown' };

  if (existing.revokedAt) return { ok: false, reason: 'revoked' };

  if (existing.rotatedAt) {
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

  if (existing.expiresAt <= new Date()) return { ok: false, reason: 'expired' };

  existing.rotatedAt = new Date();
  await existing.save();

  const next = await issueRefreshToken(existing.user, existing.family);
  return { ok: true, userId: existing.user, ...next };
};

export default {
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamily,
  revokeAllForUser,
  hashToken,
};
