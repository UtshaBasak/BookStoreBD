import { useState, useEffect, type ChangeEvent, type FormEvent } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { FaBookOpen, FaEnvelopeOpenText, FaHeart, FaKey, FaTruck } from 'react-icons/fa';

import type { ApiError, SignInResponse, TwoFactorChallenge } from '@shared/api.js';

import Logo from '../components/Logo.js';
import PasswordChecklist from '../components/PasswordChecklist.js';
import { passwordReady } from '../utils/passwordPolicy.js';
import { API_BASE_URL, apiFetch, refreshSession } from '../config/api.js';
import GoogleButton from '../components/GoogleButton.js';
import { useBotCheck } from '../hooks/useBotCheck.js';
import { site } from '../config/site.js';
import { useToast } from '../hooks/useToast.js';
import { isAdmin, isAuthenticated, setSession } from '../utils/auth.js';
import { reportError } from '../utils/report.js';

import './Auth.css';

export default function SignIn() {
    const navigate = useNavigate();
    const toast = useToast();
    const { hash } = useLocation();
    // Back from Google with two-step sign-in on: straight to the code.
    const googleTwoStep = /#google-2fa=([^&]+)/.exec(hash)?.[1];
    const googleEmail = googleTwoStep ? decodeURIComponent(googleTwoStep) : '';
    const [formData, setFormData] = useState<{ email?: string; password?: string }>(googleEmail ? { email: googleEmail } : {});
    // Two-step sign-in: the password was right and a code is on its way.
    const [challenge, setChallenge] = useState<TwoFactorChallenge | null>(
        googleEmail ? { twoFactor: true, sentTo: googleEmail, message: 'Enter the 6-digit code we sent to your e-mail.' } : null
    );
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [forgotStep, setForgotStep] = useState('email'); // email | otp | reset
    const [forgotMsg, setForgotMsg] = useState('');
    const [newPassword, setNewPassword] = useState('');
    /** Where a two-step code came from: the password form, or Google. */
    const [challengeFrom, setChallengeFrom] = useState<'password' | 'google'>(googleEmail ? 'google' : 'password');
    // The bot check, for the form and for the password reset - one each, since
    // a token works once.
    const bot = useBotCheck();
    const forgotBot = useBotCheck();
    const [searchParams] = useSearchParams();
    const next = searchParams.get('next') ?? '/';
    const after = /^\/(?!\/)/.test(next) ? next : '/';

    useEffect(() => {
        if (isAuthenticated()) {
            navigate(isAdmin() ? '/admin/users' : '/profile', { replace: true });
        }
    }, [navigate]);

    // Back from Google: signed in (the session is in the cookie it set), or
    // a reason it did not work. A code to enter is handled above.
    useEffect(() => {
        if (searchParams.get('google') === 'done') {
            void refreshSession().then((ok) => {
                if (ok) navigate(isAdmin() ? '/admin/users' : after, { replace: true });
                else toast.error('Could not finish signing in with Google. Please try again.');
            });
            return;
        }
        const reason = /#google-error=([^&]+)/.exec(hash)?.[1];
        if (reason) {
            const messages: Record<string, string> = {
                cancelled: 'Google sign-in was cancelled.',
                expired: 'That took a little too long. Please try Google sign-in again.',
                unverified: 'Google has not verified that e-mail address yet.',
                unavailable: 'Google sign-in is not available right now.',
                codes: 'Sign-in codes cannot be sent right now. Please try again later.',
            };
            toast.error(messages[reason] ?? 'Could not sign in with Google. Please try again.');
        }
        // Once, on arrival.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        setFormData({
            ...formData,
            [e.target.id]: e.target.value,
        });
    };

    const handleSubmit = async (e?: FormEvent) => {
        e?.preventDefault();

        setBusy(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/signin`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ ...formData, captchaToken: bot.token }),
            });
            // A bot-check token works once, whatever the answer.
            bot.reset();

            const data = (await res.json()) as SignInResponse | ApiError;
            if (res.ok && 'twoFactor' in data) {
                setChallengeFrom('password');
                setChallenge(data);
                setCode('');
                toast.info(`A sign-in code is on its way to ${data.sentTo}.`);
            } else if (res.ok && 'token' in data) {
                // The token is what authorises every later request.
                setSession(data);
                navigate(after);
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
        } finally {
            setBusy(false);
        }
    };

    const handleVerifyCode = async (e: FormEvent) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(code.trim())) {
            toast.warning('Enter the 6-digit code from the e-mail.');
            return;
        }
        setBusy(true);
        try {
            const res = await apiFetch(`${API_BASE_URL}/auth/signin/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email, code: code.trim() }),
            });
            const data = (await res.json()) as SignInResponse | ApiError;
            if (res.ok && 'token' in data) {
                setSession(data);
                navigate(isAdmin() ? '/admin/users' : after);
            } else {
                toast.error((data as ApiError).message || 'That code did not work.');
            }
        } catch (err) {
            reportError('Error verifying the sign-in code:', err);
            toast.error('Could not reach the server. Please check your connection.');
        } finally {
            setBusy(false);
        }
    };

    const handleForgotSendOtp = async () => {
        setForgotMsg('');
        const res = await apiFetch(`${API_BASE_URL}/auth/send-otp`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, purpose: 'reset', captchaToken: forgotBot.token })
        });
        forgotBot.reset();
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
                <h1 className="auth-title">{challenge ? 'Check your e-mail' : 'Sign In'}</h1>
                <p className="auth-sub">
                    {challenge
                        ? `Two-step sign-in is on. Enter the 6-digit code we sent to ${challenge.sentTo}.`
                        : 'Welcome back! Your cart, wishlist and orders are waiting.'}
                </p>

                {challenge ? (
                    <form onSubmit={handleVerifyCode} className="auth-form">
                        <span className="auth-modal-icon" aria-hidden="true" style={{ justifySelf: 'center' }}><FaEnvelopeOpenText /></span>
                        <div>
                            <label htmlFor="signin-code" className="auth-label">Sign-in code</label>
                            <input
                                id="signin-code"
                                name="code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder="6-digit code"
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                className="field"
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary auth-wide" disabled={busy}>
                            {busy ? 'Checking...' : 'Verify and sign in'}
                        </button>
                        {challengeFrom === 'google' ? (
                            <a className="auth-text-button" style={{ justifySelf: 'center' }} href={`${API_BASE_URL}/auth/google?next=${encodeURIComponent(after)}`}>
                                Send a new code
                            </a>
                        ) : (
                            <button type="button" className="auth-text-button" style={{ justifySelf: 'center' }} disabled={busy || !bot.ready} onClick={() => void handleSubmit()}>
                                Send a new code
                            </button>
                        )}
                        <button
                            type="button"
                            className="btn btn-ghost auth-wide"
                            onClick={() => {
                                setChallenge(null);
                                setCode('');
                            }}
                        >
                            Back
                        </button>
                    </form>
                ) : (
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

                        <button type="submit" className="btn btn-primary auth-wide" disabled={busy || !bot.ready}>
                            Sign In
                        </button>
                    </form>
                )}
                {/* Outside both forms, so it stays put for "Send a new code". */}
                {challengeFrom === 'password' && bot.element}
                {!challenge && <GoogleButton next={after} />}

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
                                    {forgotBot.element}
                                    <button onClick={handleForgotSendOtp} className="btn btn-primary auth-wide" disabled={!forgotBot.ready}>Send OTP</button>
                                </>
                            )}
                            {forgotStep === 'otp' && (
                                <>
                                    <input type="text" name="reset-otp" inputMode="numeric" autoComplete="one-time-code" aria-label="OTP" placeholder="Enter OTP" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} className="field" />
                                    <button onClick={handleForgotVerifyOtp} className="btn btn-primary auth-wide">Verify OTP</button>
                                    {forgotBot.element}
                                    <button onClick={handleForgotSendOtp} className="auth-text-button" style={{ justifySelf: 'center' }} disabled={!forgotBot.ready}>Resend OTP</button>
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
