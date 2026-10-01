import crypto from 'node:crypto';

import { createLogger } from '../config/logger.js';
import { passwordMessage, passwordProblems } from './passwordPolicy.js';

const log = createLogger('password');

/** Have I Been Pwned's Pwned Passwords range API. */
const RANGE_URL = 'https://api.pwnedpasswords.com/range/';
const TIMEOUT_MS = 2500;

/**
 * Whether this password appears in a known breach.
 *
 * k-anonymity: only the first five characters of its SHA-1 leave the server,
 * and the answer is every leaked hash sharing them, matched here. Neither the
 * password nor its full hash is ever sent anywhere.
 *
 * Fails open. A slow or unreachable service must not stop somebody signing up,
 * and every other rule has already been applied by then. Off under test and
 * when PASSWORD_BREACH_CHECK=off, so the suites stay hermetic.
 */
export const isBreached = async (password: string): Promise<boolean> => {
  if (process.env.NODE_ENV === 'test' || process.env.PASSWORD_BREACH_CHECK === 'off') return false;
  // SHA-1 because it is what the range API is keyed by - this is a lookup, not
  // storage. The password itself is stored only as a bcrypt hash, elsewhere.
  // CodeQL's js/insufficient-password-hash flags it regardless (docs/ROADMAP.md).
  const hash = crypto.createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);
  try {
    const res = await fetch(`${RANGE_URL}${prefix}`, {
      // Padding makes every answer about the same size, so its length says
      // nothing about the prefix that was asked for.
      headers: { 'Add-Padding': 'true', 'User-Agent': 'BookStoreBD' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return body.split('\n').some((line) => {
      const [candidate, count] = line.trim().split(':');
      return candidate === suffix && Number(count) > 0;
    });
  } catch (error) {
    log.warn({ err: error }, 'Breached-password check unavailable; skipped');
    return false;
  }
};

export const BREACHED_MESSAGE =
  'This password has appeared in a data breach elsewhere, so attackers already try it. Please choose a different one.';

/**
 * Everything wrong with a password somebody is about to set, as one message,
 * or '' when it may be used. The rules first, then the breach check, which is
 * only worth a network round trip for a password that passes the rest.
 */
export const newPasswordProblem = async (
  password: string,
  context: { email?: string | null; username?: string | null }
): Promise<string> => {
  const problems = passwordProblems(password, context);
  if (problems.length) return passwordMessage(problems);
  if (await isBreached(password)) return BREACHED_MESSAGE;
  return '';
};
