import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import nodemailer from 'nodemailer';

import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import { config } from '../config/env.js';
import { signAccessToken } from '../utils/jwt.js';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamily,
} from '../utils/refreshToken.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from '../utils/authCookies.js';
import RefreshToken from '../models/RefreshToken.model.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('auth');

/**
 * The body carries the short-lived access token and the details needed to
 * render; the refresh token goes back only in an httpOnly cookie, so page
 * JavaScript can never read it.
 */
const sessionBody = (user) => ({
  token: signAccessToken(user),
  user: {
    id: String(user._id),
    username: user.username,
    email: user.email,
    role: user.role,
  },
});

/** Starts a session: a new refresh family plus a fresh access token. */
const startSession = async (res, user) => {
  const { token: refresh } = await issueRefreshToken(user._id);
  setRefreshCookie(res, refresh);
  return sessionBody(user);
};

/** Promotes accounts listed in ADMIN_EMAILS, so the deployment keeps its admin. */
const applyAdminBootstrap = async (user) => {
  if (user.role !== 'admin' && config.adminEmails.includes(user.email.toLowerCase())) {
    user.role = 'admin';
    await user.save();
  }
  return user;
};

// In-memory OTP store keyed by e-mail. A Map rather than a plain object: an
// attacker who signs up as "__proto__" would otherwise assign through to
// Object.prototype. Fine for a single instance; move to Redis before scaling
// horizontally.
const otpStore = new Map();

const OTP_TTL_MS = 10 * 60 * 1000;

function generateOTP() {
    // crypto.randomInt is uniform and unpredictable, unlike Math.random.
    return crypto.randomInt(100000, 1000000).toString();
}

function createTransporter() {
    return nodemailer.createTransport({
        service: config.smtp.service,
        auth: {
            user: config.smtp.user,
            pass: config.smtp.pass
        }
    });
}

async function sendEmail(email, subject, text) {
    await createTransporter().sendMail({
        from: config.smtp.user,
        to: email,
        subject,
        text
    });
}

// Send OTP for registration or password reset
export const sendOtp = async (req, res) => {
    try {
        const username = req.body.username;
        const email = req.body.email;
        const purpose = req.body.purpose;
        if (!email) return res.status(400).json({ message: "Email is required" });

        if (purpose === 'register') {
            // Registration: block if username or email exists
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                return res.status(400).json({ message: "Username already taken, try another." });
            }
            const existingEmail = await User.findOne({ email });
            if (existingEmail) {
                return res.status(400).json({ message: "This email is already in use." });
            }
        } else if (purpose === 'reset') {
            // Password reset: block if email does not exist
            const existingEmail = await User.findOne({ email });
            if (!existingEmail) {
                return res.status(404).json({ message: "No account found with this email." });
            }
        }

        const code = generateOTP();
        otpStore.set(email, { code, expiresAt: Date.now() + OTP_TTL_MS, verified: false });
        try {
            if (!config.smtp.user || !config.smtp.pass) {
                log.error('SMTP credentials missing; cannot send OTP');
                return res.status(500).json({ message: "Email service not configured" });
            }
            await sendEmail(email, "Your OTP Code", `Your verification code is: ${code}`);
            res.json({ message: "OTP sent to email" });
        } catch (err) {
            log.error({ err }, 'Failed to send OTP');
            res.status(500).json({ message: "Failed to send OTP" });
        }
    } catch (error) {
        log.error({ err: error }, 'sendOtp failed');
        res.status(500).json({ message: "Internal server error" });
    }
};

// Verify OTP
export const verifyOtp = (req, res) => {
    const email = req.body.email;
    const code = req.body.code;
    if (!email || !code) return res.status(400).json({ message: "Email and code required" });
    const record = otpStore.get(email);
    if (!record || record.code !== code || Date.now() > record.expiresAt) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    record.verified = true;
    res.json({ message: "OTP verified" });
};

// Signup with OTP verification
export const signup = async(req,res,next) =>{
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    try {
        // Check OTP
        if (!otpStore.get(email)?.verified) {
            return res.status(400).json({ message: "Email not verified. Please verify OTP." });
        }
        // Check for existing username or email
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            if (existingUser.username === username) {
                return res.status(409).json({ message: "Username already exists" });
            }
            if (existingUser.email === email) {
                return res.status(409).json({ message: "Email already exists" });
            }
        }
        const hashedPassword = bcryptjs.hashSync(password,10);
        const newUser = new User ({username,email,password:hashedPassword});
        await newUser.save();
        await applyAdminBootstrap(newUser);
        otpStore.delete(email);
        res.status(201).json(await startSession(res, newUser));
    } catch (error) {
        // Handle duplicate key error (in case of race condition)
        if (error.code === 11000) {
            if (error.keyPattern?.username) {
                return res.status(409).json({ message: "Username already exists" });
            }
            if (error.keyPattern?.email) {
                return res.status(409).json({ message: "Email already exists" });
            }
        }
        next(error);
    }
};

// Signin (no change)
export const signin = async(req,res,next) =>{
    const email = req.body.email;
    const password = req.body.password;
    try{
        const validUser = await User.findOne({email});
        if (!validUser) return next (errorHandler(404,'User not found!'));
        const validPassword = bcryptjs.compareSync(password,validUser.password);
        if (!validPassword) return next (errorHandler(401,'Wrong credentials!'));

        await applyAdminBootstrap(validUser);
        res.status(200).json(await startSession(res, validUser));
    } catch (error){
        next(error);
    }
}

// Forgot password: send OTP (reuse sendOtp), verify OTP (reuse verifyOtp), then reset password
export const resetPassword = async (req, res) => {
    const email = req.body.email;
    const otp = req.body.otp;
    const newPassword = req.body.newPassword;
    if (!email || !otp || !newPassword) return res.status(400).json({ message: "All fields required" });
    const record = otpStore.get(email);
    if (!record || record.code !== otp || Date.now() > record.expiresAt) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    user.password = bcryptjs.hashSync(newPassword, 10);
    await user.save();
    otpStore.delete(email);

    // Anyone already signed in with the old password is signed out: a reset is
    // the usual response to a suspected compromise.
    const { revokeAllForUser } = await import('../utils/refreshToken.js');
    await revokeAllForUser(user._id);
    clearRefreshCookie(res);

    res.json({ message: "Password reset successful" });
};

/**
 * Exchanges the refresh cookie for a new access token and a rotated refresh
 * token. Every failure answers the same way, so a caller learns nothing about
 * whether a token was unknown, expired, revoked or replayed.
 */
export const refresh = async (req, res, next) => {
  try {
    const presented = readRefreshCookie(req);
    const result = await rotateRefreshToken(presented);

    if (!result.ok) {
      clearRefreshCookie(res);
      log.info({ reason: result.reason }, 'Refresh rejected');
      return res.status(401).json({ message: 'Session expired, please sign in again' });
    }

    const user = await User.findById(result.userId);
    if (!user) {
      // The account went away between issuing and refreshing.
      await revokeFamily(result.family);
      clearRefreshCookie(res);
      return res.status(401).json({ message: 'Session expired, please sign in again' });
    }

    setRefreshCookie(res, result.token);
    return res.status(200).json(sessionBody(user));
  } catch (error) {
    return next(error);
  }
};

/** Ends the session that presented the cookie, and clears it. */
export const logout = async (req, res, next) => {
  try {
    const presented = readRefreshCookie(req);

    if (presented) {
      const { hashToken } = await import('../utils/refreshToken.js');
      const stored = await RefreshToken.findOne({ tokenHash: hashToken(presented) });
      if (stored) await revokeFamily(stored.family);
    }

    clearRefreshCookie(res);
    // Always 204, whether or not there was a session to end.
    return res.status(204).end();
  } catch (error) {
    return next(error);
  }
};
