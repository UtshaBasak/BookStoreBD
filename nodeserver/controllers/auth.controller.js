import User from '../models/user.model.js';
import bcryptjs from 'bcryptjs'
import {errorHandler} from '../uits/error.js';
import nodemailer from 'nodemailer';
import 'dotenv/config';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const otpStore = {}; // { email: { code, expiresAt } }

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmail(email, subject, text) {
    // Use your SMTP config here
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });
    await transporter.sendMail({
        from: process.env.SMTP_USER,
        to: email,
        subject,
        text
    });
}

// Send OTP for registration or password reset
export const sendOtp = async (req, res) => {
    try {
        const { username, email, purpose } = req.body;
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
        otpStore[email] = { code, expiresAt: Date.now() + 10 * 60 * 1000 }; // 10 min
        try {
            if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
                console.error('SMTP credentials missing');
                return res.status(500).json({ message: "Email service not configured" });
            }
            console.log(`[sendOtp] Sending OTP to ${email}: ${code}`);
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
    const { email, code } = req.body;
    if (!email || !code) return res.status(400).json({ message: "Email and code required" });
    const record = otpStore[email];
    if (!record || record.code !== code || Date.now() > record.expiresAt) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    otpStore[email].verified = true;
    res.json({ message: "OTP verified" });
};

// Signup with OTP verification
export const signup = async(req,res,next) =>{
    const { username, email, password, otp } = req.body;
    try {
        // Check OTP
        if (!otpStore[email] || !otpStore[email].verified) {
            console.log(`[signup] OTP not verified for ${email}`);
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
        delete otpStore[email];
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
    const {email,password} = req.body;
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
    const { email, otp, newPassword } = req.body;
    if (!email || !otp || !newPassword) return res.status(400).json({ message: "All fields required" });
    const record = otpStore[email];
    if (!record || record.code !== otp || Date.now() > record.expiresAt) {
        return res.status(400).json({ message: "Invalid or expired OTP" });
    }
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });
    user.password = bcryptjs.hashSync(newPassword, 10);
    await user.save();
    delete otpStore[email];
    res.json({ message: "Password reset successful" });
};

