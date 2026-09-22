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
import {
  clearCode,
  consumeOtpAttempt,
  hasVerifiedCode,
  issueCode,
  markVerified,
} from '../utils/otpStore.js';

const log = createLogger('auth');

// One-time codes live in MongoDB with a TTL index rather than in a Map in this
// process: see utils/otpStore.ts for why that stopped being good enough.

/**
 * One answer for every sign-in failure, and one answer for every request for a
 * code, whether or not the address belongs to an account.
 *
 * Two different messages are an oracle. Anyone could feed in a list of
 * addresses and learn which ones have accounts here - a privacy leak on its
 * own, since it says who shops here, and the first step of a credential
 * stuffing run, which begins by narrowing millions of leaked addresses down to
 * the ones a site recognises.
 */
const INVALID_CREDENTIALS = 'Invalid email or password';
const RESET_CODE_SENT = 'If that address has an account, a reset code is on its way.';
const REGISTER_CODE_SENT = 'If that address can be registered, a code is on its way.';
const INVALID_CODE = 'Invalid or expired code';

/**
 * Must match the cost used for every real password below: the dummy compare in
 * `signin` only hides an unknown account if it takes the same time as a real
 * one.
 */
const BCRYPT_ROUNDS = 10;

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

const inFlightMail = new Set<Promise<void>>();

/**
 * Sends without making the caller wait.
 *
 * Awaiting delivery would undo the uniform messages: the paths that have mail
 * to send take an SMTP round trip - hundreds of milliseconds - and the paths
 * that do not answer immediately. Identical wording with a stopwatch attached
 * is still an oracle, so the response goes out first and delivery follows
 * behind it. A failure is then only visible in the log, which is the right
 * place for it: whether a particular address could be reached is not something
 * the caller is entitled to know.
 */
const dispatchEmail = (email: string, subject: string, text: string): void => {
    const sending: Promise<void> = new Promise<void>((resolve) => {
        // Deferred to the next turn so that not even building the transport
        // runs before the response is written. Measured on the running stack,
        // doing it inline costs a few milliseconds - small, but it is the only
        // remaining difference between the path that sends and the path that
        // does not.
        setImmediate(() => resolve(sendEmail(email, subject, text)));
    })
        .catch((err: unknown) => {
            log.error({ err }, 'Failed to send mail');
        })
        .finally(() => inFlightMail.delete(sending));

    inFlightMail.add(sending);
};

/**
 * Resolves once every detached send has settled.
 *
 * A test seam, and the only way to assert on mail that deliberately outlives
 * the response which triggered it.
 */
export const mailSettled = async (): Promise<void> => {
    await Promise.all([...inFlightMail]);
};

/** Tells the owner of an address that somebody tried to sign up with it. */
const ALREADY_REGISTERED_NOTICE = [
    'Someone entered this address on our sign-up form.',
    '',
    'This address already has an account, so nothing was created and no',
    'verification code was issued.',
    '',
    'If that was you, sign in instead - or use "Forgot password" if you cannot',
    'remember it. If it was not you, you can ignore this message. Your account',
    'has not changed.',
].join('\n');

/**
 * Issues a one-time code, for signing up or for resetting a password.
 *
 * Every outcome within a purpose answers with the same sentence, so the reply
 * says nothing about whether the address is known here. It used to say a great
 * deal: "This email is already in use" on the way in and "No account found
 * with this email" on the way back.
 */
export const sendOtp = async (
    req: Request<unknown, unknown, SendOtpBody>,
    res: Response
): Promise<void> => {
    try {
        const username = req.body.username;
        const email = req.body.email;
        const purpose = req.body.purpose;

        // A fault in our configuration, not a fact about this address: every
        // caller gets the same 500, so it reveals nothing.
        if (!config.smtp.user || !config.smtp.pass) {
            log.error('SMTP credentials missing; cannot send a code');
            res.status(500).json({ message: "Email service not configured" });
            return;
        }

        if (purpose === 'register') {
            // Handle availability is not a secret - usernames are printed on
            // every listing, and a sign-up form that will not say a name is
            // taken is unusable. The address is a different matter.
            //
            // The guard also fixes a real bug: `findOne({ username: undefined })`
            // strips the key and matches the first user in the collection, so a
            // request without a username was told the name was taken.
            if (username && (await User.findOne({ username }))) {
                res.status(400).json({ message: "Username already taken, try another." });
                return;
            }

            if (await User.findOne({ email })) {
                // The same sentence a free address gets. Rather than issue a
                // code that could not be used anyway, tell the owner of the
                // address that somebody tried: useful to them, useless to
                // anyone else.
                dispatchEmail(email, 'Someone tried to sign up with your address', ALREADY_REGISTERED_NOTICE);
                res.json({ message: REGISTER_CODE_SENT });
                return;
            }
        } else if (!(await User.findOne({ email }))) {
            // A reset - or a request that named no purpose at all - for an
            // address with no account. No code, no mail, and the same sentence
            // the owner of a real account would have seen. Answering anything
            // else here is also what would let this endpoint mail arbitrary
            // strangers on demand.
            log.info('Code requested for an address with no account');
            res.json({ message: RESET_CODE_SENT });
            return;
        }

        const code = generateOTP();
        await issueCode(email, code);
        dispatchEmail(email, "Your OTP Code", `Your verification code is: ${code}`);

        res.json({ message: purpose === 'register' ? REGISTER_CODE_SENT : RESET_CODE_SENT });
    } catch (error) {
        log.error({ err: error }, 'sendOtp failed');
        res.status(500).json({ message: "Internal server error" });
    }
};

// Verify OTP
export const verifyOtp = async (
    req: Request<unknown, unknown, VerifyOtpBody>,
    res: Response
): Promise<void> => {
    const email = req.body.email;
    const code = req.body.code;
    if (!email || !code) {
        res.status(400).json({ message: "Email and code required" });
        return;
    }
    try {
        // One message for a wrong code, an expired one, an address that was
        // never issued one, and one guessed at too many times.
        if (!(await consumeOtpAttempt(email, code))) {
            res.status(400).json({ message: INVALID_CODE });
            return;
        }
        await markVerified(email);
        res.json({ message: "OTP verified" });
    } catch (error) {
        log.error({ err: error }, 'verifyOtp failed');
        res.status(500).json({ message: "Internal server error" });
    }
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
        if (!(await hasVerifiedCode(email))) {
            res.status(400).json({ message: "Email not verified. Please verify OTP." });
            return;
        }
        // Not an enumeration oracle, unlike the checks in `sendOtp`: getting
        // this far needs a verified code for this address, and a code is only
        // ever issued to an address with no account. What it catches is the
        // race - an account created in the ten minutes since the code went out.
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
        const hashedPassword = bcryptjs.hashSync(password, BCRYPT_ROUNDS);
        const newUser = new User ({username,email,password:hashedPassword});
        await newUser.save();
        await applyAdminBootstrap(newUser);
        await clearCode(email);
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

let dummyPasswordHash: string | undefined;

/**
 * A hash of a random string nobody will ever type, used to give the
 * unknown-account path the same cost as a wrong password. Computed on first use
 * rather than at import, so start-up does not pay for it.
 */
const dummyHash = (): string =>
    (dummyPasswordHash ??= bcryptjs.hashSync(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS));

/**
 * Both ways of failing answer the same, and take the same time.
 *
 * It used to be `404 'User not found!'` for an address with no account and
 * `401 'Wrong credentials!'` for a bad password, which told anyone who asked
 * which addresses have accounts here.
 */
export const signin = async (
    req: Request<unknown, unknown, SigninBody>,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const email = req.body.email;
    const password = req.body.password;
    try {
        const validUser = await User.findOne({ email });

        // Compare against a throwaway hash when there is no such account. The
        // work is pointless except that it costs what a real compare costs:
        // returning early here would answer, in the timing, the question the
        // single message exists to refuse.
        const storedHash = validUser?.password ?? dummyHash();
        const validPassword = bcryptjs.compareSync(password, storedHash);

        if (!validUser || !validPassword) {
            next(errorHandler(401, INVALID_CREDENTIALS));
            return;
        }

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
    // Counted against the same record as `verifyOtp`: the two endpoints check
    // one code between them, so five tries is five tries whichever is used.
    if (!(await consumeOtpAttempt(email, otp))) {
        res.status(400).json({ message: INVALID_CODE });
        return;
    }
    const user = await User.findOne({ email });
    if (!user) {
        // Unreachable in practice, since a code is only issued to an address
        // that has an account - but if the account went away in the meantime,
        // that is still not news the caller gets to hear.
        res.status(400).json({ message: INVALID_CODE });
        return;
    }
    user.password = bcryptjs.hashSync(newPassword, BCRYPT_ROUNDS);
    await user.save();
    await clearCode(email);

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
