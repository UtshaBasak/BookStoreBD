import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { FaBookOpen, FaHeart, FaKey, FaTruck } from 'react-icons/fa';

import type { ApiError } from '@shared/api.js';

import Logo from '../components/Logo.js';
import PasswordChecklist from '../components/PasswordChecklist.js';
import { passwordReady } from '../utils/passwordPolicy.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import { site } from '../config/site.js';
import { useToast } from '../hooks/useToast.js';
import { isAdmin, isAuthenticated, setSession } from '../utils/auth.js';
import { reportError } from '../utils/report.js';

import './Auth.css';

export default function SignIn() {
    const navigate = useNavigate();
    const toast = useToast();
    const [formData, setFormData] = useState({});
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [forgotStep, setForgotStep] = useState('email'); // email | otp | reset
    const [forgotMsg, setForgotMsg] = useState('');
    const [newPassword, setNewPassword] = useState('');

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

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();

        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/signin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await res.json();
            if (res.ok) {
                // The token is what authorises every later request.
                setSession(data);
                navigate('/');
            } else {
                // The API's sentence, not the raw error envelope. A wrong
                // email and a wrong password answer the same on purpose.
                toast.error((data as ApiError).message || 'Could not sign you in.');
            }
        } catch (err) {
            // The detail belongs in the console; what reaches the visitor is
            // something they can act on.
            reportError('Error submitting form:', err);
            toast.error('Could not reach the server. Please check your connection.');
        }
    };

    const handleForgotSendOtp = async () => {
        setForgotMsg('');
        const res = await apiFetch(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, purpose: 'reset' })
        });
        const data = await res.json();
        if (res.ok) {
            setForgotStep('otp');
            setForgotMsg('OTP sent to your email.');
        } else {
            setForgotMsg(data.message || 'Failed to send OTP.');
        }
    };

    const handleForgotVerifyOtp = async () => {
        setForgotMsg('');
        const res = await apiFetch(`${API_BASE_URL}/auth/verify-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, code: forgotOtp })
        });
        const data = await res.json();
        if (res.ok) {
            setForgotStep('reset');
            setForgotMsg('OTP verified. Enter new password.');
        } else {
            setForgotMsg(data.message || 'Invalid OTP.');
        }
    };

    const handleForgotResetPassword = async () => {
        setForgotMsg('');
        if (!passwordReady(newPassword, { email: forgotEmail })) {
            setForgotMsg('Your new password does not meet every rule yet - see the list.');
            return;
        }
        const res = await apiFetch(`${API_BASE_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            setForgotMsg('Password reset successful. Please sign in.');
            setTimeout(() => setShowForgot(false), 1000);
        } else {
            setForgotMsg(data.message || 'Failed to reset password.');
        }
    };

    // Every step of the reset reports back in one line: green for progress,
    // red for a failure.
    const forgotOk = /^(OTP sent|OTP verified|Password reset)/.test(forgotMsg);

    return (
        <div className="auth-page aurora">
            <AuthPitch />

            <main className="card auth-card">
                <Link to="/" className="auth-logo" aria-label={`${site.name} home`}>
                    <Logo size={40} />
                </Link>
                <h1 className="auth-title">Sign In</h1>
                <p className="auth-sub">Welcome back! Your cart, wishlist and orders are waiting.</p>

                <form onSubmit={handleSubmit} className="auth-form">
                    <div>
                        <label htmlFor="email" className="auth-label">Email</label>
                        <input
                            type="email"
                            placeholder="Email"
                            id="email"
                            name="email"
                            // Lets a password manager offer to fill the form.
                            autoComplete="username"
                            onChange={handleChange}
                            className="field"
                        />
                    </div>
                    <div>
                        <div className="auth-label-row">
                            <label htmlFor="password" className="auth-label">Password</label>
                            {/* A real button, so a keyboard user can reach the password reset. */}
                            <button
                                type="button"
                                className="auth-text-button"
                                onClick={() => setShowForgot(true)}
                            >
                                Forgot Password?
                            </button>
                        </div>
                        <input
                            type="password"
                            placeholder="Password"
                            id="password"
                            name="password"
                            autoComplete="current-password"
                            onChange={handleChange}
                            className="field"
                        />
                    </div>

                    <button type="submit" className="btn btn-primary auth-wide">
                        Sign In
                    </button>
                </form>

                <p className="auth-divider">New here?</p>
                <p className="auth-switch">
                    Not registered?{' '}
                    <Link to="/sign-up" className="auth-switch-link">
                       <b> SIGN UP</b>
                    </Link>
                </p>
                <Link to="/" className="btn btn-ghost auth-wide">
                    Go To Home
                </Link>
            </main>

            {showForgot && (
                <div className="auth-overlay">
                    <div className="card auth-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
                        <span className="auth-modal-icon" aria-hidden="true"><FaKey /></span>
                        <h3 id="forgot-title" className="auth-modal-title">Forgot Password</h3>
                        <p className="auth-sub" style={{ marginBottom: '1.25rem' }}>
                            {forgotStep === 'email' && "Enter your email and we'll send you a code."}
                            {forgotStep === 'otp' && `Enter the code we sent to ${forgotEmail}.`}
                            {forgotStep === 'reset' && 'Choose a new password for your account.'}
                        </p>
                        <div className="auth-form">
                            {forgotStep === 'email' && (
                                <>
                                    <input type="email" name="reset-email" autoComplete="username" aria-label="Email" placeholder="Enter your email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className="field" />
                                    <button onClick={handleForgotSendOtp} className="btn btn-primary auth-wide">Send OTP</button>
                                </>
                            )}
                            {forgotStep === 'otp' && (
                                <>
                                    <input type="text" name="reset-otp" inputMode="numeric" autoComplete="one-time-code" aria-label="OTP" placeholder="Enter OTP" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} className="field" />
                                    <button onClick={handleForgotVerifyOtp} className="btn btn-primary auth-wide">Verify OTP</button>
                                    <button onClick={handleForgotSendOtp} className="auth-text-button" style={{ justifySelf: 'center' }}>Resend OTP</button>
                                </>
                            )}
                            {forgotStep === 'reset' && (
                                <>
                                    <input type="password" name="new-password" autoComplete="new-password" aria-label="New Password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="field" maxLength={128} aria-describedby="reset-password-rules" />
                                    <PasswordChecklist id="reset-password-rules" password={newPassword} email={forgotEmail} />
                                    <button onClick={handleForgotResetPassword} className="btn btn-primary auth-wide">Set New Password</button>
                                </>
                            )}
                            {forgotMsg && (
                                <p role="status" className={`auth-message ${forgotOk ? 'auth-message-ok' : 'auth-message-error'}`}>{forgotMsg}</p>
                            )}
                            <button onClick={() => setShowForgot(false)} className="btn btn-ghost auth-wide">Close</button>
                        </div>
                    </div>
                </div>
            )}
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
                Your next favourite book is <span className="auth-highlight">one tap</span> away.
            </p>
            <p className="auth-pitch-sub">New and second-hand books from readers across Bangladesh.</p>
            <ul className="auth-perks">
                <li><span className="auth-perk-icon"><FaBookOpen /></span>New and second-hand, fairly priced</li>
                <li><span className="auth-perk-icon"><FaTruck /></span>Delivered to your door</li>
                <li><span className="auth-perk-icon"><FaHeart /></span>Save favourites to your wishlist</li>
            </ul>
        </section>
    );
}
