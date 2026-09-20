import express from 'express'
import {
  signup,
  signin,
  sendOtp,
  verifyOtp,
  resetPassword,
  refresh,
  logout,
} from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { authSchemas } from '../schemas/index.js';

const router = express.Router();

router.post("/signup", validate(authSchemas.signup), signup);
router.post("/signin", validate(authSchemas.signin), signin);

// OTP and password reset
router.post("/send-otp", validate(authSchemas.sendOtp), sendOtp);
router.post("/verify-otp", validate(authSchemas.verifyOtp), verifyOtp);
router.post("/reset-password", validate(authSchemas.resetPassword), resetPassword);

// Session lifecycle. Both read the httpOnly refresh cookie rather than a body,
// so neither takes a schema.
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
