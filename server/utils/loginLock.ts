import { createHmac } from 'crypto';

import LoginAttempt from '../models/LoginAttempt.model.js';
import { jwtSecret } from '../config/env.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('login-lock');

/** Wrong passwords in a row before an address is locked, and for how long. */
export const MAX_FAILURES = 5;
export const LOCK_MS = 15 * 60 * 1000;
const FORGET_AFTER_MS = 60 * 60 * 1000;

const keyFor = (email: string): string => createHmac('sha256', jwtSecret()).update(`login:${email.toLowerCase()}`).digest('hex');

/**
 * How long until this address may try again, in minutes; 0 when it may now.
 *
 * Counted per address whether or not it has an account, so a lock says
 * nothing about which addresses are registered. It stops one account's
 * password being guessed from many places at once, which the per-address-of-
 * the-caller rate limit cannot.
 */
export const minutesLocked = async (email: string): Promise<number> => {
  const record = await LoginAttempt.findOne({ key: keyFor(email) }, { lockedUntil: 1 }).lean();
  const until = record?.lockedUntil ? new Date(record.lockedUntil).getTime() : 0;
  return until > Date.now() ? Math.ceil((until - Date.now()) / 60000) : 0;
};

/** A wrong password: counted, and the address locked once there are too many. */
export const recordFailure = async (email: string): Promise<void> => {
  const record = await LoginAttempt.findOneAndUpdate(
    { key: keyFor(email) },
    { $inc: { failures: 1 }, $set: { expiresAt: new Date(Date.now() + FORGET_AFTER_MS) } },
    { upsert: true, returnDocument: 'after' }
  );
  if (record && record.failures >= MAX_FAILURES) {
    await LoginAttempt.updateOne({ key: keyFor(email) }, { failures: 0, lockedUntil: new Date(Date.now() + LOCK_MS) });
    log.warn('Sign-in locked after repeated wrong passwords');
  }
};

/** The right password: the count starts again. */
export const clearFailures = async (email: string): Promise<void> => {
  await LoginAttempt.deleteOne({ key: keyFor(email) });
};
