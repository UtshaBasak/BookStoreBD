import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';

import PushDevice from '../models/PushDevice.model.js';
import RefreshToken from '../models/RefreshToken.model.js';
import User from '../models/user.model.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('push');

/**
 * Push notifications to the Android app, through Firebase Cloud Messaging's
 * HTTP v1 API.
 *
 * Every push is a data-only message carrying what kind of thing happened and
 * its id - never a title, a name or a message. The phone fetches the rest over
 * the API with its own session, so no personal text passes through Google, and
 * a phone that has been signed out learns nothing from a stray push.
 *
 * Off unless FIREBASE_SERVICE_ACCOUNT holds a service-account key (Firebase
 * console -> Project settings -> Service accounts). Sending never throws: a
 * push is a courtesy on top of something that has already happened.
 */

interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
  token_uri?: string;
}

const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
const FCM_ENDPOINT = 'https://fcm.googleapis.com/v1/projects';
const TIMEOUT_MS = 10_000;
/** Sent at once, at most; the rest wait for the batch before. */
const BATCH = 20;
/** How long FCM keeps trying a phone that is switched off. */
const TTL = '86400s';

let account: { raw: string; value: ServiceAccount | null } | null = null;
let access: { token: string; expiresAt: number; email: string } | null = null;
const inFlight = new Set<Promise<void>>();

/** The service account, read once per value of the variable; null when push is off. */
const serviceAccount = (): ServiceAccount | null => {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT?.trim() ?? '';
  if (account?.raw === raw) return account.value;
  let value: ServiceAccount | null = null;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
      if (parsed.project_id && parsed.client_email && parsed.private_key) {
        value = parsed as ServiceAccount;
      } else {
        log.error('FIREBASE_SERVICE_ACCOUNT lacks project_id, client_email or private_key; push notifications are off');
      }
    } catch {
      log.error('FIREBASE_SERVICE_ACCOUNT is not valid JSON; push notifications are off');
    }
  }
  account = { raw, value };
  return value;
};

export const pushConfigured = (): boolean => serviceAccount() !== null;

/** A short-lived OAuth token for FCM, from a JWT the service account signs; reused until near its end. */
const accessToken = async (credentials: ServiceAccount): Promise<string> => {
  const now = Date.now();
  if (access && access.email === credentials.client_email && access.expiresAt - 60_000 > now) return access.token;

  const tokenUri = credentials.token_uri || DEFAULT_TOKEN_URI;
  const assertion = jwt.sign({ scope: SCOPE }, credentials.private_key, {
    algorithm: 'RS256',
    issuer: credentials.client_email,
    audience: tokenUri,
    expiresIn: 3600,
  });
  const res = await fetch(tokenUri, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google's token endpoint answered ${res.status}`);
  const body = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!body.access_token) throw new Error('Google sent no access token');
  access = { token: body.access_token, expiresAt: now + (body.expires_in ?? 3600) * 1000, email: credentials.client_email };
  return access.token;
};

/** What a push says: the kind of thing that happened, and its id. */
export interface PushData {
  kind: 'notification' | 'chat';
  id: string;
}

type Outcome = 'sent' | 'gone' | 'failed';

/** FCM's ways of saying a token will never work again. */
const GONE_CODES = new Set(['UNREGISTERED', 'SENDER_ID_MISMATCH']);

const sendOne = async (credentials: ServiceAccount, bearer: string, token: string, data: PushData): Promise<Outcome> => {
  const res = await fetch(`${FCM_ENDPOINT}/${encodeURIComponent(credentials.project_id)}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: { token, data: { kind: data.kind, id: data.id }, android: { priority: 'high', ttl: TTL } },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.ok) return 'sent';
  const body = (await res.json().catch(() => ({}))) as {
    error?: { status?: string; details?: { errorCode?: string }[] };
  };
  const code = body.error?.details?.find((detail) => detail.errorCode)?.errorCode ?? body.error?.status;
  if (res.status === 404 || (code && GONE_CODES.has(code))) return 'gone';
  log.warn({ status: res.status, code }, 'FCM refused a push');
  return 'failed';
};

const send = async (messages: readonly { email: string; data: PushData }[]): Promise<void> => {
  const credentials = serviceAccount();
  if (!credentials || !messages.length) return;

  const users = await User.find({ email: { $in: [...new Set(messages.map((m) => m.email))] } }, { email: 1 }).lean();
  if (!users.length) return;
  const devices = await PushDevice.find({ user: { $in: users.map((user) => user._id) } }).lean();
  if (!devices.length) return;

  // Only phones whose session is still live: a session that ran out without
  // anyone signing out leaves its row behind until it is pruned here.
  const live = new Set(
    await RefreshToken.distinct('family', {
      family: { $in: devices.map((device) => device.family) },
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    })
  );
  const emailOf = new Map(users.map((user) => [String(user._id), user.email]));
  const sends = messages.flatMap((message) =>
    devices
      .filter((device) => live.has(device.family) && emailOf.get(String(device.user)) === message.email)
      .map((device) => ({ token: device.token, data: message.data }))
  );
  const stale = devices.filter((device) => !live.has(device.family)).map((device) => device.token);
  if (!sends.length && !stale.length) return;

  const gone = [...stale];
  if (sends.length) {
    const bearer = await accessToken(credentials);
    for (let start = 0; start < sends.length; start += BATCH) {
      const batch = sends.slice(start, start + BATCH);
      const outcomes = await Promise.all(
        batch.map(({ token, data }) => sendOne(credentials, bearer, token, data).catch((): Outcome => 'failed'))
      );
      outcomes.forEach((outcome, index) => {
        if (outcome === 'gone') gone.push(batch[index]!.token);
      });
    }
  }
  if (gone.length) await PushDevice.deleteMany({ token: { $in: gone } });
};

/**
 * Pushes to every phone these people are signed in on, in the background.
 * Returns at once and never throws.
 */
export const push = (messages: readonly { email: string; data: PushData }[]): void => {
  if (!messages.length || !pushConfigured()) return;
  const sending: Promise<void> = send(messages)
    .catch((err: unknown) => {
      log.warn({ err }, 'Could not send push notifications');
    })
    .finally(() => inFlight.delete(sending));
  inFlight.add(sending);
};

/** Resolves once every push started so far has settled. A test seam. */
export const pushSettled = async (): Promise<void> => {
  await Promise.all([...inFlight]);
};

/** Forgets the cached key and access token. A test seam. */
export const forgetPushCredentials = (): void => {
  account = null;
  access = null;
};

/**
 * Records the phone's FCM token for its session, replacing whatever that
 * session or that token had before: a phone that signs in again, or whose
 * token changes, keeps exactly one row.
 */
export const registerPushDevice = async (user: Types.ObjectId, family: string, token: string): Promise<void> => {
  await PushDevice.deleteMany({ token: { $eq: token }, family: { $ne: family } });
  await PushDevice.findOneAndUpdate({ family }, { $set: { token, user } }, { upsert: true, setDefaultsOnInsert: true });
};
