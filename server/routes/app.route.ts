import express, { type RequestHandler } from 'express';

import type { AppConfig } from '@shared/api.js';

import { appRefresh, appLogout, appLogoutOthers, signin, signup, verifySignin } from '../controllers/auth.controller.js';
import { appGoogleConfigured, appGoogleSignIn, issueAppNonce } from '../controllers/appGoogle.controller.js';
import { actingUser, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { appSchemas, type AppDeviceBody, type AppPushBody } from '../schemas/index.js';
import { captchaSiteKey, requireCaptcha } from '../utils/captcha.js';
import { latestAppRelease } from '../utils/appRelease.js';
import { androidMinVersionCode } from '../config/android.js';
import { DELIVERY, RETURN_WINDOW_DAYS, SELLER_FEE_PERCENT } from '../config/commerce.js';
import { advertisedPromotions } from '../config/promotions.js';
import { SHOP_LOCATION, SUPPORT_EMAIL } from '../config/contact.js';
import { CATEGORY_GROUPS, DELIVERY_DAYS, DELIVERY_DIVISIONS } from '../config/reference.js';
import { publicSiteUrl } from '../config/siteUrl.js';
import RefreshToken from '../models/RefreshToken.model.js';
import { hashToken } from '../utils/refreshToken.js';
import { pushConfigured, registerPushDevice } from '../utils/push.js';
import { t } from '../utils/language.js';

/**
 * What only the Android app uses, under /api/v1/app. Everything else the app
 * needs is the same /api/v1 the website's endpoints answer on.
 */
const router = express.Router();

/** Everything the app needs before its first screen: versions, sign-in options and the shop's fixed lists. */
router.get('/config', async (req, res, next) => {
  try {
    const site = publicSiteUrl(req);
    const siteKey = captchaSiteKey();
    const body: AppConfig = {
      android: {
        minVersionCode: androidMinVersionCode(),
        latest: await latestAppRelease(),
      },
      auth: {
        captchaSiteKey: siteKey,
        challengeUrl: siteKey && site ? `${site}/app/challenge` : null,
        google: appGoogleConfigured(),
        googleClientId: appGoogleConfigured() ? String(process.env.GOOGLE_CLIENT_ID) : null,
      },
      shop: {
        currency: 'BDT',
        delivery: { ...DELIVERY, daysInsideDhaka: DELIVERY_DAYS.insideDhaka, daysOutsideDhaka: DELIVERY_DAYS.outsideDhaka },
        returnWindowDays: RETURN_WINDOW_DAYS,
        sellerFeePercent: SELLER_FEE_PERCENT,
        categories: CATEGORY_GROUPS.map((group) => ({ ...group, items: [...group.items] })),
        divisions: Object.entries(DELIVERY_DIVISIONS).map(([name, districts]) => ({ name, districts: [...districts] })),
        promotions: advertisedPromotions(),
      },
      links: {
        site,
        privacy: `${site}/privacy`,
        terms: `${site}/terms`,
        returns: `${site}/returns`,
        howItWorks: `${site}/how-it-works`,
        about: `${site}/about`,
        contact: `${site}/contact`,
      },
      contact: { email: SUPPORT_EMAIL, location: SHOP_LOCATION },
    };
    res.set('Cache-Control', 'no-cache').json(body);
  } catch (error) {
    next(error);
  }
});

/**
 * The phone's push token, for the session it is signed in with. The refresh
 * token names the session, and has to be the caller's own and still live, so
 * a token can only ever be filed under a session its sender holds. Signing
 * out removes it (utils/refreshToken.ts).
 */
router.post('/push', requireAuth, validate(appSchemas.push), async (req, res, next) => {
  try {
    const { refreshToken, pushToken } = req.body as AppPushBody;
    const session = await RefreshToken.findOne(
      { tokenHash: hashToken(refreshToken), client: 'android', revokedAt: null, expiresAt: { $gt: new Date() } },
      { user: 1, family: 1 }
    ).lean();
    if (!session || String(session.user) !== actingUser(req).id) {
      res.status(401).json({ message: t(req, 'Session expired, please sign in again', 'আপনার সেশন শেষ হয়েছে, আবার সাইন ইন করুন') });
      return;
    }
    await registerPushDevice(session.user, session.family, pushToken);
    res.status(200).json({
      message: t(req, 'Push notifications are on for this phone.', 'এই ফোনে পুশ নোটিফিকেশন চালু হয়েছে।'),
      enabled: pushConfigured(),
    });
  } catch (error) {
    next(error);
  }
});

/** Keeps the phone a session starts on for the session handlers (controllers/auth.controller.ts). */
const appDevice: RequestHandler = (req, res, next) => {
  res.locals.appDevice = (req.body as { device: AppDeviceBody }).device;
  next();
};

/*
 * Sign-in for the app. The same checks as the website's - the bot check, the
 * lock after five wrong passwords, two-step sign-in - with the session's
 * refresh token returned in the body and bound to the phone's key.
 *
 * Sign-up codes, password resets and the password check need no session, so
 * the app uses the shared /api/v1/auth endpoints for those.
 */
const auth = express.Router();
auth.post('/signin', validate(appSchemas.signin), requireCaptcha, appDevice, signin);
auth.post('/signin/verify', validate(appSchemas.signinVerify), appDevice, verifySignin);
auth.post('/signup', validate(appSchemas.signup), appDevice, signup);
auth.get('/nonce', issueAppNonce);
auth.post('/google', validate(appSchemas.google), appDevice, appGoogleSignIn);
auth.post('/refresh', validate(appSchemas.refresh), appRefresh);
auth.post('/logout', validate(appSchemas.refresh), appLogout);
auth.post('/logout-others', requireAuth, validate(appSchemas.refresh), appLogoutOthers);

export const appAuthRouter = auth;
export default router;
