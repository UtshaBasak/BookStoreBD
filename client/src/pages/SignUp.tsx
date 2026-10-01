import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBookOpen, FaHeart, FaStore } from 'react-icons/fa';

import type { ApiError, PasswordCheckResponse, SessionResponse } from '@shared/api.js';

import Logo from '../components/Logo.js';
import PasswordChecklist from '../components/PasswordChecklist.js';
import { passwordReady } from '../utils/passwordPolicy.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import GoogleButton from '../components/GoogleButton.js';
import { useBotCheck } from '../hooks/useBotCheck.js';
import { site } from '../config/site.js';
import { useToast } from '../hooks/useToast.js';
import { isAdmin, isAuthenticated, setSession } from '../utils/auth.js';
import { reportError } from '../utils/report.js';

import './Auth.css';

/** The sign-up form, filled in one field at a time. */
interface SignUpForm {
    username?: string;
    email?: string;
    password?: string;
}

export default function SignUp() {
    const [formData, setFormData] = useState<SignUpForm>({});
    const [step, setStep] = useState('form'); // form | otp | done
    const [otp, setOtp] = useState('');
    const [otpMsg, setOtpMsg] = useState('');
    const [emailForOtp, setEmailForOtp] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [checking, setChecking] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();
    // The bot check, before a code is e-mailed.
    const bot = useBotCheck();

    useEffect(() => {
        if (isAuthenticated()) {
            navigate(isAdmin() ? '/admin/users' : '/profile', { replace: true });
        }
    }, [navigate]);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.id]: e.target.value,
        });
    };

    const handleSendOtp = async (email: string) => {
        setOtpMsg('');
        const res = await apiFetch(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username: formData.username, purpose: 'register', captchaToken: bot.token })
        });
        // A bot-check token works once, whatever the answer.
        bot.reset();
        const data = (await res.json()) as ApiError;
        if (res.ok) {
            setOtpMsg('OTP sent to your email.');
            setStep('otp');
            setEmailForOtp(email);
        } else {
            setOtpMsg(data.message || 'Failed to send OTP.');
        }
    };

    const handleVerifyOtp = async () => {
        setOtpMsg('');
        const res = await apiFetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailForOtp, code: otp })
        });
        const data = (await res.json()) as ApiError;
        if (res.ok) {
            setOtpMsg('OTP verified. Completing registration...');
            handleSubmitFinal();
        } else {
            setOtpMsg(data.message || 'Invalid OTP. Try again.');
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!formData.email || !formData.username || !formData.password) {
            toast.warning('Please fill in every field.');
            return;
        }
        // A code has already been sent.
        if (step === 'otp') return;
        const context = { email: formData.email, username: formData.username };
        if (!passwordReady(formData.password, context)) {
            toast.warning('Your password does not meet every rule yet - see the list under it.');
            return;
        }
        // The server's word, before a code is sent: it also knows passwords
        // that have leaked elsewhere, which the list above cannot.
        setChecking(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/password-check`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: formData.password, ...context }),
            });
            const verdict = (await res.json()) as PasswordCheckResponse & ApiError;
            if (!res.ok || !verdict.ok) {
                toast.error(verdict.message || 'Please choose a different password.');
                return;
            }
        } finally {
            setChecking(false);
        }
        await handleSendOtp(formData.email);
    };

    const handleSubmitFinal = async () => {
        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, otp }),
            });
            if (res.ok) {
                // Sign-up returns the same session payload as sign-in.
                setSession((await res.json()) as SessionResponse);
                setStep('done');
                setTimeout(() => navigate('/'), 1000);
            } else {
                const failure = (await res.json()) as ApiError;
                toast.error(failure.message || 'Could not create your account.');
            }
        } catch (error) {
            reportError('Error submitting form:', error);
            toast.error('Could not reach the server. Please check your connection.');
        }
    };

    // Where the visitor is in the three steps, for the progress bar.
    const stepIndex = step === 'form' ? 0 : step === 'otp' ? 1 : 2;
    const otpOk = otpMsg.startsWith('OTP verified') || otpMsg.startsWith('OTP sent');

    return (
        <div className="auth-page aurora">
            <AuthPitch />

            <main className="card auth-card">
                <Link to="/" className="auth-logo" aria-label={`${site.name} home`}>
                    <Logo size={40} />
                </Link>
                <h1 className="auth-title">Sign Up</h1>
                <p className="auth-sub">Create your free account to buy, sell and save books you love.</p>

                <ol className="auth-steps" aria-label="Sign-up steps">
                    {['Your details', 'Verify email', 'All set'].map((label, i) => (
                        <li
                            key={label}
                            className={`auth-step ${i < stepIndex ? 'auth-step-done' : i === stepIndex ? 'auth-step-current' : ''}`}
                            aria-current={i === stepIndex ? 'step' : undefined}
                        >
                            {label}
                        </li>
                    ))}
                </ol>

                {step === 'form' && (
                    <form onSubmit={handleSubmit} className="auth-form">
                        <div>
                            <label htmlFor="username" className="auth-label">Username</label>
                            <input
                                type="text"
                                placeholder="Username"
                                id="username"
                                name="username"
                                autoComplete="username"
                                onChange={handleChange}
                                className="field"
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="auth-label">Email</label>
                            <input
                                type="email"
                                placeholder="Email"
                                id="email"
                                name="email"
                                autoComplete="email"
                                onChange={handleChange}
                                className="field"
                            />
                        </div>
                        <div>
                            <div className="auth-label-row">
                                <label htmlFor="password" className="auth-label">Password</label>
                                <button
                                    type="button"
                                    className="auth-show"
                                    onClick={() => setShowPassword((shown) => !shown)}
                                    aria-pressed={showPassword}
                                >
                                    {showPassword ? 'Hide' : 'Show'}
                                </button>
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder="Password"
                                id="password"
                                name="password"
                                // New, not current: a password manager should
                                // offer to generate one rather than fill it.
                                autoComplete="new-password"
                                onChange={handleChange}
                                className="field"
                                aria-describedby="signup-password-rules"
                                maxLength={128}
                            />
                            <PasswordChecklist
                                id="signup-password-rules"
                                password={formData.password ?? ''}
                                email={formData.email}
                                username={formData.username}
                            />
                        </div>
                        <button type="submit" className="btn btn-primary auth-wide" disabled={checking || !bot.ready}>
                            {checking ? 'Checking...' : 'Send OTP'}
                        </button>
                        {/*
                          A sentence rather than a tick-box: it says the same
                          thing and costs nobody a click on the way in.
                        */}
                        <p className="auth-fine-print">
                            By creating an account you confirm you are {site.minimumAge} or older and agree
                            to the <Link to="/terms">terms of service</Link> and{' '}
                            <Link to="/privacy">privacy policy</Link>.
                        </p>
                        {otpMsg && (
                            <p role="status" className={`auth-message ${otpMsg.startsWith('OTP sent') ? 'auth-message-ok' : 'auth-message-error'}`}>
                                {otpMsg}
                            </p>
                        )}
                    </form>
                )}
                {step === 'otp' && (
                    <div className="auth-form">
                        <p className="auth-note">
                            We sent a code to <b>{emailForOtp}</b>. It can take a minute to arrive - check your spam folder too.
                        </p>
                        <div>
                            <label htmlFor="signup-otp" className="auth-label">Code from your email</label>
                            <input
                                id="signup-otp"
                                type="text"
                                name="otp"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder="Enter OTP"
                                value={otp}
                                onChange={e => setOtp(e.target.value)}
                                className="field"
                            />
                        </div>
                        <button onClick={handleVerifyOtp} className="btn btn-primary auth-wide">
                            Verify OTP & Register
                        </button>
                        <button type="button" onClick={() => handleSendOtp(emailForOtp)} className="auth-text-button" style={{ justifySelf: 'center' }} disabled={!bot.ready}>
                            Resend OTP
                        </button>
                        {otpMsg && (
                            <p role="status" className={`auth-message ${otpOk ? 'auth-message-ok' : 'auth-message-error'}`}>{otpMsg}</p>
                        )}
                    </div>
                )}
                {step === 'done' && (
                    <div className="auth-done" role="status">
                        <span className="auth-done-emoji" aria-hidden="true">🎉</span>
                        <p className="auth-message auth-message-ok">Registration successful! Redirecting...</p>
                    </div>
                )}

                {/* Outside the forms, so it stays put for "Resend OTP". */}
                {step !== 'done' && bot.element}
                {step === 'form' && <GoogleButton />}

                <p className="auth-divider">Have an account?</p>
                <p className="auth-switch">
                    Already registered?{' '}
                    <Link to="/sign-in" className="auth-switch-link">
                        <b>SIGN IN</b>
                    </Link>
                </p>
                <Link to="/" className="btn btn-ghost auth-wide">
                    Go To Home
                </Link>
            </main>
        </div>
    );
}

/**
 * What the shop is, beside the form on a wide screen. Hidden from screen
 * readers: it is decoration, and the form is what they came for.
 */
function AuthPitch() {
    return (
        <section className="auth-pitch" aria-hidden="true">
            <p className="auth-kicker">📚 Welcome to our bookstore</p>
            <p className="auth-pitch-title">
                Join the readers who <span className="auth-highlight">buy and sell</span> here.
            </p>
            <p className="auth-pitch-sub">One free account to shop, save favourites and sell the books you have finished.</p>
            <ul className="auth-perks">
                <li><span className="auth-perk-icon"><FaBookOpen /></span>New and second-hand, fairly priced</li>
                <li><span className="auth-perk-icon"><FaStore /></span>Sell your books and get paid by bKash</li>
                <li><span className="auth-perk-icon"><FaHeart /></span>Save favourites to your wishlist</li>
            </ul>
        </section>
    );
}
