import { createHmac, timingSafeEqual } from 'crypto';

import { jwtSecret } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import OneTimeCode, { type OneTimeCodeAttributes } from '../models/OneTimeCode.model.js';

const log = createLogger('otp');

/** How long a code is good for. */
export const OTP_TTL_MS = 10 * 60 * 1000;

/**
 * Wrong guesses before a code is thrown away.
 *
 * The rate limiter caps an IP at 50 requests per 15 minutes, but nothing was
 * counting failures against the *code*, so guesses from a handful of addresses
 * were never pooled. Six digits is a million possibilities; five tries makes
 * the arithmetic hopeless rather than merely slow.
 */
export const MAX_OTP_ATTEMPTS = 5;

/**
 * What is stored for a code.
 *
 * Not the code. Six digits is a million possibilities, so a plain hash of one
 * is recovered instantly from a table; an HMAC under the server's secret is
 * not, and the secret is not in the database. This matters now in a way it did
 * not when these lived in memory: a record that survives a restart is a record
 * that can be read out of a backup.
 */
const digest = (code: string): string =>
  createHmac('sha256', jwtSecret()).update(code).digest('hex');

/**
 * The address a record is filed under.
 *
 * A digest rather than the address, for two reasons. A table of which
 * addresses asked for a code and when is not worth keeping; and nothing taken
 * from a request then reaches a query, which is the difference between
 * trusting the schema upstream and not having to.
 */
const keyFor = (email: string): string =>
  createHmac('sha256', jwtSecret()).update(`otp:${email}`).digest('hex');

/** Constant-time, so a comparison cannot be timed a character at a time. */
const sameDigest = (a: string, b: string): boolean => {
  const left = Buffer.from(a, 'hex');
  const right = Buffer.from(b, 'hex');
  return left.length === right.length && timingSafeEqual(left, right);
};

/** Issues a code for an address, replacing whatever it had. */
export const issueCode = async (email: string, code: string): Promise<void> => {
  await OneTimeCode.findOneAndUpdate(
    { key: keyFor(email) },
    {
      key: keyFor(email),
      code: digest(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
      verified: false,
      attempts: 0,
    },
    { upsert: true }
  );
};

/**
 * Checks a code, counting the failure against it.
 *
 * Returns the record only for the right code. Everything else - no code
 * issued, expired, wrong, or discarded after too many tries - returns null,
 * and the callers answer the same way for all of them. Saying "too many
 * attempts" would be friendlier and would also confirm that a code had been
 * issued at all, which is the account enumeration the auth controller works to
 * avoid.
 */
export const consumeOtpAttempt = async (
  email: string,
  code: string
): Promise<OneTimeCodeAttributes | null> => {
  const record = await OneTimeCode.findOne({ key: keyFor(email) }).lean();
  if (!record) return null;

  // Checked here rather than left to the TTL index, which sweeps about once a
  // minute and would otherwise let a just-expired code through.
  if (record.expiresAt.getTime() <= Date.now()) {
    await OneTimeCode.deleteOne({ key: keyFor(email) });
    return null;
  }

  if (!sameDigest(record.code, digest(code))) {
    // $inc rather than read-modify-write: two guesses arriving together must
    // both count, or the ceiling is a suggestion.
    const after = await OneTimeCode.findOneAndUpdate(
      { key: keyFor(email) },
      { $inc: { attempts: 1 } },
      { returnDocument: 'after' }
    ).lean();

    if (after && after.attempts >= MAX_OTP_ATTEMPTS) {
      await OneTimeCode.deleteOne({ key: keyFor(email) });
      log.warn({ attempts: after.attempts }, 'One-time code discarded after repeated failures');
    }
    return null;
  }

  return record;
};

/** Records that the code has been checked, which is what signup then requires. */
export const markVerified = async (email: string): Promise<void> => {
  await OneTimeCode.updateOne({ key: keyFor(email) }, { verified: true });
};

/** Whether this address has a live, already-checked code. */
export const hasVerifiedCode = async (email: string): Promise<boolean> => {
  const record = await OneTimeCode.findOne({ key: keyFor(email) }, { verified: 1, expiresAt: 1 }).lean();
  return Boolean(record?.verified) && (record?.expiresAt.getTime() ?? 0) > Date.now();
};

/** Done with it: used, or no longer wanted. */
export const clearCode = async (email: string): Promise<void> => {
  await OneTimeCode.deleteOne({ key: keyFor(email) });
};
