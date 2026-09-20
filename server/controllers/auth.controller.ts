import crypto from 'crypto';

import bcryptjs from 'bcryptjs';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import nodemailer from 'nodemailer';

import type { SessionResponse } from '@shared/api.js';

import User, { type UserDocument } from '../models/user.model.js';
import { errorHandler, isDuplicateKeyError } from '../utils/error.js';
import { config } from '../config/env.js';
import { signAccessToken } from '../utils/jwt.js';
import {
  issueRefreshToken,
  rotateRefreshToken,
  revokeFamily,
  revokeAllForUser,
  hashToken,
} from '../utils/refreshToken.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  readRefreshCookie,
} from '../utils/authCookies.js';
import RefreshToken from '../models/RefreshToken.model.js';
import type {
  ResetPasswordBody,
  SendOtpBody,
  SigninBody,
  SignupBody,
  VerifyOtpBody,
} from '../schemas/index.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('auth');

/**
 * The body carries the short-lived access token and the details needed to
 * render; the refresh token goes back only in an httpOnly cookie, so page
 * JavaScript can never read it.
 */
const sessionBody = (user: UserDocument): SessionResponse => ({
  token: signAccessToken(user),
  user: {
    id: String(user._id),
    username: user.username,
    email: user.email,
    role: user.role,
  },
});

/** Starts a session: a new refresh family plus a fresh access token. */
const startSession = async (res: Response, user: UserDocument): Promise<SessionResponse> => {
  const { token: refresh } = await issueRefreshToken(user._id);
  setRefreshCookie(res, refresh);
  return sessionBody(user);
};

/** Promotes accounts listed in ADMIN_EMAILS, so the deployment keeps its admin. */
const applyAdminBootstrap = async (user: UserDocument): Promise<UserDocument> => {
  if (user.role !== 'admin' && config.adminEmails.includes(user.email.toLowerCase())) {
    user.role = 'admin';
    await user.save();
  }
  return user;
};

interface OtpRecord {
  code: string;
  expiresAt: number;
  verified: boolean;
}

// In-memory OTP store keyed by e-mail. A Map rather than a plain object: an
// attacker who signs up as "__proto__" would otherwise assign through to
// Object.prototype. Fine for a single instance; move to Redis before scaling
// horizontally.
const otpStore = new Map<string, OtpRecord>();

const OTP_TTL_MS = 10 * 60 * 1000;

function generateOTP(): string {
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

async function sendEmail(email: string, subject: string, text: string): Promise<void> {
    await createTransporter().sendMail({
        from: config.smtp.user,
        to: email,
        subject,
        text
    });
}

// Send OTP for registration or password reset
export const sendOtp = async (
    req: Request<unknown, unknown, SendOtpBody>,
    res: Response
): Promise<void> => {
    try {
        const username = req.body.username;
        const email = req.body.email;
        const purpose = req.body.purpose;
        if (!email) {
            res.status(400).json({ message: "Email is required" });
            return;
        }

        if (purpose === 'register') {
            // Registration: block if username or email exists
            const existingUser = await User.findOne({ username });
            if (existingUser) {
                res.status(400).json({ message: "Username already taken, try another." });
                return;
            }
            const existingEmail = await User.findOne({ email });
            if (existingEmail) {
                res.status(400).json({ message: "This email is already in use." });
                return;
            }
        } else if (purpose === 'reset') {
            // Password reset: block if email does not exist
            const existingEmail = await User.findOne({ email });
            if (!existingEmail) {
                res.status(404).json({ message: "No account found with this email." });
                return;
            }
        }

        const code = generateOTP();
        otpStore.set(email, { code, expiresAt: Date.now() + OTP_TTL_MS, verified: false });
        try {
            if (!config.smtp.user || !config.smtp.pass) {
                log.error('SMTP credentials missing; cannot send OTP');
                res.status(500).json({ message: "Email service not configured" });
                return;
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
export const verifyOtp = (req: Request<unknown, unknown, VerifyOtpBody>, res: Response): void => {
    const email = req.body.email;
    const code = req.body.code;
    if (!email || !code) {
        res.status(400).json({ message: "Email and code required" });
        return;
    }
    const record = otpStore.get(email);
    if (!record || record.code !== code || Date.now() > record.expiresAt) {
        res.status(400).json({ message: "Invalid or expired OTP" });
        return;
    }
    record.verified = true;
    res.json({ message: "OTP verified" });
};

// Signup with OTP verification
export const signup = async (
    req: Request<unknown, unknown, SignupBody>,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    try {
        // Check OTP
        if (!otpStore.get(email)?.verified) {
            res.status(400).json({ message: "Email not verified. Please verify OTP." });
            return;
        }
        // Check for existing username or email
        const existingUser = await User.findOne({ $or: [{ username }, { email }] });
        if (existingUser) {
            if (existingUser.username === username) {
                res.status(409).json({ message: "Username already exists" });
                return;
            }
            if (existingUser.email === email) {
                res.status(409).json({ message: "Email already exists" });
                return;
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
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.username) {
                res.status(409).json({ message: "Username already exists" });
                return;
            }
            if (error.keyPattern?.email) {
                res.status(409).json({ message: "Email already exists" });
                return;
            }
        }
        next(error);
    }
};

// Signin (no change)
export const signin = async (
    req: Request<unknown, unknown, SigninBody>,
    res: Response,
    next: NextFunction
): Promise<void> => {
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
export const resetPassword = async (
    req: Request<unknown, unknown, ResetPasswordBody>,
    res: Response
): Promise<void> => {
    const email = req.body.email;
    const otp = req.body.otp;
    const newPassword = req.body.newPassword;
    if (!email || !otp || !newPassword) {
        res.status(400).json({ message: "All fields required" });
        return;
    }
    const record = otpStore.get(email);
    if (!record || record.code !== otp || Date.now() > record.expiresAt) {
        res.status(400).json({ message: "Invalid or expired OTP" });
        return;
    }
    const user = await User.findOne({ email });
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    user.password = bcryptjs.hashSync(newPassword, 10);
    await user.save();
    otpStore.delete(email);

    // Anyone already signed in with the old password is signed out: a reset is
    // the usual response to a suspected compromise.
    await revokeAllForUser(user._id);
    clearRefreshCookie(res);

    res.json({ message: "Password reset successful" });
};

/**
 * Exchanges the refresh cookie for a new access token and a rotated refresh
 * token. Every failure answers the same way, so a caller learns nothing about
 * whether a token was unknown, expired, revoked or replayed.
 */
export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const presented = readRefreshCookie(req);
    const result = await rotateRefreshToken(presented);

    if (!result.ok) {
      clearRefreshCookie(res);
      log.info({ reason: result.reason }, 'Refresh rejected');
      res.status(401).json({ message: 'Session expired, please sign in again' });
      return;
    }

    const user = await User.findById(result.userId);
    if (!user) {
      // The account went away between issuing and refreshing.
      await revokeFamily(result.family);
      clearRefreshCookie(res);
      res.status(401).json({ message: 'Session expired, please sign in again' });
      return;
    }

    setRefreshCookie(res, result.token);
    res.status(200).json(sessionBody(user));
  } catch (error) {
    next(error);
  }
};

/** Ends the session that presented the cookie, and clears it. */
export const logout: RequestHandler = async (req, res, next) => {
  try {
    const presented = readRefreshCookie(req);

    if (presented) {
      const stored = await RefreshToken.findOne({ tokenHash: hashToken(presented) });
      if (stored) await revokeFamily(stored.family);
    }

    clearRefreshCookie(res);
    // Always 204, whether or not there was a session to end.
    res.status(204).end();
  } catch (error) {
    next(error);
  }
};
