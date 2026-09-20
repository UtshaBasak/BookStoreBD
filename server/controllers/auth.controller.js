import crypto from 'crypto';
import bcryptjs from 'bcryptjs';
import nodemailer from 'nodemailer';

import User from '../models/user.model.js';
import { errorHandler } from '../utils/error.js';
import { config } from '../config/env.js';
import { asTrimmedString } from '../utils/sanitize.js';

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
        const username = asTrimmedString(req.body.username);
        const email = asTrimmedString(req.body.email);
        const purpose = asTrimmedString(req.body.purpose);
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
                console.error('SMTP credentials missing');
                return res.status(500).json({ message: "Email service not configured" });
            }
            await sendEmail(email, "Your OTP Code", `Your verification code is: ${code}`);
            res.json({ message: "OTP sent to email" });
        } catch (err) {
            console.error('[sendOtp] Failed to send OTP:', err);
            res.status(500).json({ message: "Failed to send OTP" });
        }
    } catch (error) {
        console.error('[sendOtp] Error:', error);
        res.status(500).json({ message: "Internal server error" });
    }
};

// Verify OTP
export const verifyOtp = (req, res) => {
    const email = asTrimmedString(req.body.email);
    const code = asTrimmedString(req.body.code);
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
    const username = asTrimmedString(req.body.username);
    const email = asTrimmedString(req.body.email);
    const password = asTrimmedString(req.body.password);
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
        otpStore.delete(email);
        res.status(201).json("User created successfully")
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
    const email = asTrimmedString(req.body.email);
    const password = asTrimmedString(req.body.password);
    try{
        const validUser = await User.findOne({email});
        if (!validUser) return next (errorHandler(404,'User not found!'));
        const validPassword = bcryptjs.compareSync(password,validUser.password);
        if (!validPassword) return next (errorHandler(401,'Wrong credentials!'));
        if (validUser && validPassword) {
            res.status(200).json("User founded successfully")
        }
    } catch (error){
        next(error);
    }
}

// Forgot password: send OTP (reuse sendOtp), verify OTP (reuse verifyOtp), then reset password
export const resetPassword = async (req, res) => {
    const email = asTrimmedString(req.body.email);
    const otp = asTrimmedString(req.body.otp);
    const newPassword = asTrimmedString(req.body.newPassword);
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
    res.json({ message: "Password reset successful" });
};

