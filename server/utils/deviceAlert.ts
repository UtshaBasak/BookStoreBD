import { createHmac, randomBytes } from 'crypto';

import type { Request, Response } from 'express';

import User, { type UserDocument } from '../models/user.model.js';
import { API_PREFIX } from '../config/apiPaths.js';
import { config, jwtSecret } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { dispatchShopMail, newSignInEmail } from './shopMail.js';

const log = createLogger('device-alert');

/**
 * "A new sign-in to your account": an e-mail whenever an account is signed
 * in to from a browser it has not been signed in from before, so a stolen
 * password is noticed at once.
 *
 * A browser is known by a random id in an httpOnly cookie, sent only to the
 * sign-in routes; the account keeps an HMAC of it, never the id. The first
 * browser an account knows is learned quietly, so nobody is alerted about
 * their own sign-up, or on the day this began.
 */
const DEVICE_COOKIE = 'device';
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_KNOWN = 20;

const fingerprint = (deviceId: string): string => createHmac('sha256', jwtSecret()).update(`device:${deviceId}`).digest('hex');

/** "Chrome on Windows", from the browser's own description of itself. */
export const describeBrowser = (agent: string): string => {
  const browser = /Edg\//.test(agent)
    ? 'Edge'
    : /SamsungBrowser/.test(agent)
      ? 'Samsung Internet'
      : /OPR\//.test(agent)
        ? 'Opera'
        : /Firefox\//.test(agent)
          ? 'Firefox'
          : /Chrome\//.test(agent)
            ? 'Chrome'
            : /Safari\//.test(agent)
              ? 'Safari'
              : 'A browser';
  const system = /Android/.test(agent)
    ? 'Android'
    : /iPhone|iPad|iPod/.test(agent)
      ? 'iPhone or iPad'
      : /Windows/.test(agent)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(agent)
          ? 'a Mac'
          : /Linux/.test(agent)
            ? 'Linux'
            : 'an unknown device';
  return `${browser} on ${system}`;
};

/** What is needed from the request: the cookie, and the browser's description. */
export type DeviceRequest = Pick<Request, 'cookies' | 'get'>;

/** Notes the browser a session is starting in, and e-mails the owner if it is new. Never throws. */
export const noteDevice = async (req: DeviceRequest, res: Response, user: UserDocument): Promise<void> => {
  try {
    let deviceId = (req.cookies as Record<string, string> | undefined)?.[DEVICE_COOKIE];
    if (!deviceId || !/^[\w-]{20,64}$/.test(deviceId)) {
      deviceId = randomBytes(24).toString('base64url');
      res.cookie(DEVICE_COOKIE, deviceId, {
        httpOnly: true,
        secure: config.cookies.secure,
        sameSite: 'lax',
        path: `${API_PREFIX}/auth`,
        maxAge: YEAR_MS,
      });
    }
    const print = fingerprint(deviceId);
    const known = (user.knownDevices ?? []) as string[];
    if (known.includes(print)) return;

    await User.updateOne({ _id: user._id }, { $push: { knownDevices: { $each: [print], $slice: -MAX_KNOWN } } });
    if (known.length) {
      const when = new Date().toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' });
      dispatchShopMail(user.email, newSignInEmail(describeBrowser(String(req.get('user-agent') ?? '')), `${when} (Dhaka time)`));
    }
  } catch (error) {
    log.warn({ err: error }, 'Could not check the device');
  }
};
