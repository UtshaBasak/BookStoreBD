import { createHmac } from 'crypto';

import type { Request } from 'express';
import type { Logger } from 'pino';

import { jwtSecret } from '../config/env.js';
import { logger } from '../config/logger.js';
import { loggablePath } from './loggablePath.js';

/**
 * Security events: one JSON line for each decision a security control makes,
 * so that a wrong password, a locked account and a failed bot check can be
 * told apart without guessing from a status code.
 *
 * The request log says what was asked and how it was answered; these say why.
 * They join to the request line through `request_id`. docs/SECURITY-EVENTS.md
 * is the catalogue and the field schema.
 *
 * Nothing here may carry a secret or a plain personal detail: no password,
 * code, token, cookie, e-mail, phone, address or bKash number. An address is
 * written only as a keyed hash, and `extra` takes counts, flags and names.
 */

export type SecurityCategory = 'authentication' | 'session' | 'account' | 'authorization' | 'abuse' | 'admin';
export type SecuritySeverity = 'low' | 'medium' | 'high';
export type SecurityOutcome = 'success' | 'failure';

interface ActionDefinition {
  category: SecurityCategory;
  severity: SecuritySeverity;
  outcome: SecurityOutcome;
}

/** Every event, with what it is. A name not listed here does not compile. */
export const SECURITY_ACTIONS = {
  'auth.signin.success': { category: 'authentication', severity: 'low', outcome: 'success' },
  'auth.signin.failure': { category: 'authentication', severity: 'low', outcome: 'failure' },
  'auth.lockout': { category: 'authentication', severity: 'high', outcome: 'failure' },
  'auth.2fa.success': { category: 'authentication', severity: 'low', outcome: 'success' },
  'auth.2fa.failure': { category: 'authentication', severity: 'medium', outcome: 'failure' },
  'auth.otp.sent': { category: 'authentication', severity: 'low', outcome: 'success' },
  'auth.otp.failure': { category: 'authentication', severity: 'medium', outcome: 'failure' },
  'auth.password.reset': { category: 'authentication', severity: 'medium', outcome: 'success' },
  'auth.google.failure': { category: 'authentication', severity: 'medium', outcome: 'failure' },
  'auth.token.invalid': { category: 'authentication', severity: 'medium', outcome: 'failure' },
  'turnstile.failed': { category: 'abuse', severity: 'low', outcome: 'failure' },

  'session.refresh.reuse_detected': { category: 'session', severity: 'high', outcome: 'failure' },
  'session.refresh.device_mismatch': { category: 'session', severity: 'high', outcome: 'failure' },
  'session.logout_others': { category: 'session', severity: 'low', outcome: 'success' },

  'account.password.changed': { category: 'account', severity: 'medium', outcome: 'success' },
  'account.bkash.changed': { category: 'account', severity: 'high', outcome: 'success' },
  'account.email.changed': { category: 'account', severity: 'high', outcome: 'success' },
  'account.2fa.enabled': { category: 'account', severity: 'low', outcome: 'success' },
  'account.2fa.disabled': { category: 'account', severity: 'medium', outcome: 'success' },
  'account.deleted': { category: 'account', severity: 'medium', outcome: 'success' },
  'account.data_exported': { category: 'account', severity: 'medium', outcome: 'success' },
  'account.reauth.failure': { category: 'account', severity: 'medium', outcome: 'failure' },

  'authz.denied': { category: 'authorization', severity: 'medium', outcome: 'failure' },
  'ratelimit.exceeded': { category: 'abuse', severity: 'low', outcome: 'failure' },
  'upload.url_rejected': { category: 'abuse', severity: 'medium', outcome: 'failure' },

  'admin.role.granted': { category: 'admin', severity: 'high', outcome: 'success' },
  'admin.user.deleted': { category: 'admin', severity: 'medium', outcome: 'success' },
  'admin.payout.recorded': { category: 'admin', severity: 'medium', outcome: 'success' },
  'admin.message.sent': { category: 'admin', severity: 'medium', outcome: 'success' },
} as const satisfies Record<string, ActionDefinition>;

export type SecurityAction = keyof typeof SECURITY_ACTIONS;

/** Safe by construction: counts, flags, names and ids, never free text from a request. */
export type SecurityExtra = Record<string, string | number | boolean | null>;

export interface SecurityFields {
  /** Why, in a word: `bad_password`, `locked`, `expired`. */
  reason?: string;
  /** The account, when known. Defaults to the signed-in user. */
  userId?: string;
  /** An address the request named. Written only as a keyed hash. */
  email?: string;
  extra?: SecurityExtra;
}

/** The parts of a request an event reads, every one optional. */
export type SecurityRequest = Partial<Pick<Request, 'ip' | 'method' | 'originalUrl' | 'url' | 'headers' | 'user'>> & {
  id?: unknown;
};

/**
 * HMAC-SHA256 of the lower-cased address. Keyed, because addresses are
 * guessable: a plain hash of one could be reversed by hashing a list of them.
 * Derived from JWT_SECRET under a label of its own, as the sign-in lock and
 * the device cookie are, so it needs no secret of its own.
 */
export const hmacEmail = (email: string, key: string = jwtSecret()): string =>
  createHmac('sha256', key).update(`security-log:${email.trim().toLowerCase()}`).digest('hex');

/** `web` unless the Android app names itself; anything else that tries is `other`. */
const clientOf = (header: unknown): string => {
  if (header === undefined || header === '') return 'web';
  const value = String(header).trim();
  return /^android\/\d{1,9}$/.test(value) ? value : 'other';
};

const header = (req: SecurityRequest, name: string): unknown => req.headers?.[name];

let sink: Logger = logger.child({ log_type: 'security' });

/** A test seam: events written to a logger of the test's own, or back to the app's. */
export const setSecurityLoggerForTesting = (replacement: Logger | null): void => {
  sink = replacement ? replacement.child({ log_type: 'security' }) : logger.child({ log_type: 'security' });
};

/**
 * Writes one security event. Never throws: a request must not fail because
 * its log line could not be written.
 */
export const securityEvent = (req: SecurityRequest | undefined, action: SecurityAction, fields: SecurityFields = {}): void => {
  try {
    const definition: ActionDefinition = SECURITY_ACTIONS[action];
    const userId = fields.userId ?? req?.user?.id;
    const agent = header(req ?? {}, 'user-agent');
    const line = {
      event: {
        action,
        category: definition.category,
        outcome: definition.outcome,
        severity: definition.severity,
        ...(fields.reason ? { reason: fields.reason } : {}),
      },
      ...(req?.id !== undefined ? { request_id: String(req.id) } : {}),
      ...(req?.ip ? { source: { ip: req.ip } } : {}),
      ...(typeof agent === 'string' && agent ? { user_agent: agent.slice(0, 256) } : {}),
      client: clientOf(header(req ?? {}, 'x-client')),
      ...(req?.method ? { http: { method: req.method, route: loggablePath(req.originalUrl ?? req.url) } } : {}),
      ...(userId || fields.email
        ? {
            user: {
              ...(userId ? { id: String(userId) } : {}),
              ...(fields.email ? { email_hash: hmacEmail(fields.email) } : {}),
            },
          }
        : {}),
      ...(fields.extra ? { extra: fields.extra } : {}),
    };
    if (definition.severity === 'low') sink.info(line, action);
    else sink.warn(line, action);
  } catch {
    // Nothing to do: the request carries on without its event.
  }
};

export default securityEvent;
