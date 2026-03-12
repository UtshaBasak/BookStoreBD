import express from 'express'
import {signup,signin, sendOtp, verifyOtp, resetPassword} from '../controllers/auth.controller.js';

const router = express.Router();

router.post("/signup",signup);
router.post("/signin",signin);

// OTP and password reset
router.post("/send-otp", sendOtp);
router.post("/verify-otp", verifyOtp);
router.post("/reset-password", resetPassword);

export default router;
