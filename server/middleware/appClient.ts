import type { RequestHandler } from 'express';

import { androidMinVersionCode } from '../config/android.js';

/**
 * The Android app names itself on every request with `X-Client:
 * android/<versionCode>`. Requests without it - the website, a script - are
 * not affected by anything here.
 */
export const appVersionCodeOf = (header: string | undefined): number | null => {
  const match = /^android\/(\d{1,9})$/.exec((header ?? '').trim());
  return match ? Number(match[1]) : null;
};

/**
 * Turns away builds older than ANDROID_MIN_VERSION_CODE with 426 and
 * `code: 'app-update-required'`, so the app can ask to be updated rather than
 * fail in ways nobody can explain. The app's configuration stays reachable,
 * because it says where the update is.
 */
export const requireSupportedApp: RequestHandler = (req, res, next) => {
  const versionCode = appVersionCodeOf(req.get('x-client'));
  const minimum = androidMinVersionCode();
  if (versionCode === null || !minimum || versionCode >= minimum || req.path === '/app/config') {
    next();
    return;
  }
  res.status(426).json({
    code: 'app-update-required',
    message: 'This version of the app is no longer supported. Please update it to carry on.',
    minVersionCode: minimum,
  });
};
