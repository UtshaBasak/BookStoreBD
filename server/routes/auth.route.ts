import express from 'express'
import {
  signup,
  signin,
  verifySignin,
  sendOtp,
  verifyOtp,
  resetPassword,
  passwordCheck,
  refresh,
  logout,
  logoutOthers,
} from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { finishGoogleSignIn, googleConfigured, startGoogleSignIn } from '../controllers/google.controller.js';
import { validate } from '../middleware/validate.js';
import { authSchemas } from '../schemas/index.js';
import { captchaSiteKey, requireCaptcha } from '../utils/captcha.js';
import type { AuthConfig } from '@shared/api.js';

const router = express.Router();

// What the sign-in and sign-up pages offer: the bot check, and Google.
router.get('/config', (_req, res) => {
  const body: AuthConfig = { captchaSiteKey: captchaSiteKey(), google: googleConfigured() };
  res.set('Cache-Control', 'no-cache').json(body);
});

router.post("/signup", validate(authSchemas.signup), signup);
router.post("/signin", validate(authSchemas.signin), requireCaptcha, signin);
// The code that completes a two-step sign-in.
router.post("/signin/verify", validate(authSchemas.verifyOtp), verifySignin);

// OTP and password reset
router.post("/send-otp", validate(authSchemas.sendOtp), requireCaptcha, sendOtp);
router.post("/verify-otp", validate(authSchemas.verifyOtp), verifyOtp);
router.post("/reset-password", validate(authSchemas.resetPassword), resetPassword);
router.post("/password-check", validate(authSchemas.passwordCheck), passwordCheck);

// Session lifecycle. Both read the httpOnly refresh cookie rather than a body,
// so neither takes a schema.
router.post("/refresh", refresh);
router.post("/logout", logout);
// Every other device signed out; this one stays.
router.post('/logout-others', requireAuth, logoutOthers);

// "Continue with Google": off to Google, and back.
router.get('/google', startGoogleSignIn);
router.get('/google/callback', finishGoogleSignIn);

export default router;
