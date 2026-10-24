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
import { pick, t } from '../utils/language.js';
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
        googleEmail ? { twoFactor: true, sentTo: googleEmail, message: t('Enter the 6-digit code we sent to your e-mail.', 'আপনার ই-মেইলে পাঠানো ৬ সংখ্যার কোডটি লিখুন।') } : null
    );
    const [code, setCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [forgotStep, setForgotStep] = useState('email'); // email | otp | reset
    const [forgotMsg, setForgotMsgText] = useState('');
    // Whether the line reports progress (green) or a failure (red).
    const [forgotOk, setForgotOk] = useState(false);
    const setForgotMsg = (message: string, ok = false) => {
        setForgotMsgText(message);
        setForgotOk(ok);
    };
    const [newPassword, setNewPassword] = useState('');
    /** Opens or closes the reset dialog at its first step, with nothing left from last time. */
    const showForgotDialog = (open: boolean) => {
        setShowForgot(open);
        setForgotStep('email');
        setForgotOtp('');
        setNewPassword('');
        setForgotMsg('');
    };
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
            navigate(isAdmin() ? '/admin/analytics' : '/profile', { replace: true });
        }
    }, [navigate]);

    // Back from Google: signed in (the session is in the cookie it set), or
    // a reason it did not work. A code to enter is handled above.
    useEffect(() => {
        if (searchParams.get('google') === 'done') {
            void refreshSession().then((ok) => {
                if (ok) navigate(isAdmin() ? '/admin/analytics' : after, { replace: true });
                else toast.error(t('Could not finish signing in with Google. Please try again.', 'Google দিয়ে সাইন ইন শেষ করা যায়নি। আবার চেষ্টা করুন।'));
            });
            return;
        }
        const reason = /#google-error=([^&]+)/.exec(hash)?.[1];
        if (reason) {
            const messages: Record<string, string> = {
                cancelled: t('Google sign-in was cancelled.', 'Google দিয়ে সাইন ইন বাতিল হয়েছে।'),
                expired: t(
                    'That took a little too long. Please try Google sign-in again.',
                    'একটু বেশি সময় লেগে গেছে। আবার Google দিয়ে সাইন ইন করে দেখুন।'
                ),
                unverified: t(
                    'Google has not verified that e-mail address yet.',
                    'Google এখনো ওই ই-মেইল ঠিকানাটি যাচাই করেনি।'
                ),
                unavailable: t('Google sign-in is not available right now.', 'Google দিয়ে সাইন ইন এখন চালু নেই।'),
                codes: t(
                    'Sign-in codes cannot be sent right now. Please try again later.',
                    'এখন সাইন-ইন কোড পাঠানো যাচ্ছে না। পরে আবার চেষ্টা করুন।'
                ),
            };
            toast.error(
                messages[reason] ??
                    t('Could not sign in with Google. Please try again.', 'Google দিয়ে সাইন ইন করা যায়নি। আবার চেষ্টা করুন।')
            );
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
                toast.info(t(`A sign-in code is on its way to ${data.sentTo}.`, `${data.sentTo} ঠিকানায় একটি সাইন-ইন কোড পাঠানো হচ্ছে।`));
            } else if (res.ok && 'token' in data) {
                // The token is what authorises every later request. An
                // administrator goes to the admin pages, as the two-step and
                // Google paths do.
                setSession(data);
                navigate(isAdmin() ? '/admin/analytics' : after);
            } else {
                // The API's sentence, not the raw error envelope. A wrong
                // email and a wrong password answer the same on purpose.
                toast.error((data as ApiError).message || t('Could not sign you in.', 'সাইন ইন করানো যায়নি।'));
            }
        } catch (err) {
            // The detail belongs in the console; what reaches the visitor is
            // something they can act on.
            reportError('Error submitting form:', err);
            toast.error(t('Could not reach the server. Please check your connection.', 'সার্ভারে পৌঁছানো যায়নি। আপনার ইন্টারনেট সংযোগ দেখুন।'));
        } finally {
            setBusy(false);
        }
    };

    const handleVerifyCode = async (e: FormEvent) => {
        e.preventDefault();
        if (!/^\d{6}$/.test(code.trim())) {
            toast.warning(t('Enter the 6-digit code from the e-mail.', 'ই-মেইলে পাওয়া ৬ সংখ্যার কোডটি লিখুন।'));
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
                navigate(isAdmin() ? '/admin/analytics' : after);
            } else {
                toast.error((data as ApiError).message || t('That code did not work.', 'কোডটি কাজ করেনি।'));
            }
        } catch (err) {
            reportError('Error verifying the sign-in code:', err);
            toast.error(t('Could not reach the server. Please check your connection.', 'সার্ভারে পৌঁছানো যায়নি। আপনার ইন্টারনেট সংযোগ দেখুন।'));
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
            setForgotMsg(t('OTP sent to your email.', 'আপনার ই-মেইলে কোড পাঠানো হয়েছে।'), true);
        } else {
            setForgotMsg(data.message || t('Failed to send OTP.', 'কোড পাঠানো যায়নি।'));
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
            setForgotMsg(t('OTP verified. Enter new password.', 'কোড যাচাই হয়েছে। নতুন পাসওয়ার্ড দিন।'), true);
        } else {
            setForgotMsg(data.message || t('Invalid OTP.', 'কোডটি সঠিক নয়।'));
        }
    };

    const handleForgotResetPassword = async () => {
        setForgotMsg('');
        if (!passwordReady(newPassword, { email: forgotEmail })) {
            setForgotMsg(t('Your new password does not meet every rule yet - see the list.', 'নতুন পাসওয়ার্ড এখনো সব নিয়ম মানছে না - তালিকাটি দেখুন।'));
            return;
        }
        const res = await apiFetch(`${API_BASE_URL}/auth/reset-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            setForgotMsg(t('Password reset successful. Please sign in.', 'পাসওয়ার্ড রিসেট হয়েছে। অনুগ্রহ করে সাইন ইন করুন।'), true);
            setTimeout(() => showForgotDialog(false), 1000);
        } else {
            setForgotMsg(data.message || t('Failed to reset password.', 'পাসওয়ার্ড রিসেট করা যায়নি।'));
        }
    };

    // Every step of the reset reports back in one line: green for progress,
    // red for a failure (forgotOk, set with the message).

    return (
        <div className="auth-page aurora">
            <AuthPitch />

            <main className="card auth-card">
                <Link to="/" className="auth-logo" aria-label={t(`${site.name} home`, `${site.name} হোম`)}>
                    <Logo size={40} />
                </Link>
                <h1 className="auth-title">{challenge ? t('Check your e-mail', 'ই-মেইল দেখুন') : t('Sign In', 'সাইন ইন')}</h1>
                <p className="auth-sub">
                    {challenge
                        ? t(
                              `Two-step sign-in is on. Enter the 6-digit code we sent to ${challenge.sentTo}.`,
                              `দুই ধাপের সাইন-ইন চালু আছে। ${challenge.sentTo} ঠিকানায় পাঠানো ৬ সংখ্যার কোডটি লিখুন।`
                          )
                        : t(
                              'Welcome back! Your cart, wishlist and orders are waiting.',
                              'আবার স্বাগতম! আপনার কার্ট, উইশলিস্ট আর অর্ডার অপেক্ষা করছে।'
                          )}
                </p>

                {challenge ? (
                    <form onSubmit={handleVerifyCode} className="auth-form">
                        <span className="auth-modal-icon" aria-hidden="true" style={{ justifySelf: 'center' }}><FaEnvelopeOpenText /></span>
                        <div>
                            <label htmlFor="signin-code" className="auth-label">{t('Sign-in code', 'সাইন-ইন কোড')}</label>
                            <input
                                id="signin-code"
                                name="code"
                                type="text"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                maxLength={6}
                                placeholder={t('6-digit code', '৬ সংখ্যার কোড')}
                                value={code}
                                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                                className="field"
                                autoFocus
                            />
                        </div>
                        <button type="submit" className="btn btn-primary auth-wide" disabled={busy}>
                            {busy ? t('Checking...', 'যাচাই হচ্ছে...') : t('Verify and sign in', 'যাচাই করে সাইন ইন করুন')}
                        </button>
                        {challengeFrom === 'google' ? (
                            <a className="auth-text-button" style={{ justifySelf: 'center' }} href={`${API_BASE_URL}/auth/google?next=${encodeURIComponent(after)}`}>
                                {t('Send a new code', 'নতুন কোড পাঠান')}
                            </a>
                        ) : (
                            <button type="button" className="auth-text-button" style={{ justifySelf: 'center' }} disabled={busy || !bot.ready} onClick={() => void handleSubmit()}>
                                {t('Send a new code', 'নতুন কোড পাঠান')}
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
                            {t('Back', 'ফিরে যান')}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={handleSubmit} className="auth-form">
                        <div>
                            <label htmlFor="email" className="auth-label">{t('Email', 'ই-মেইল')}</label>
                            <input
                                type="email"
                                placeholder={t('Email', 'ই-মেইল')}
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
                                <label htmlFor="password" className="auth-label">{t('Password', 'পাসওয়ার্ড')}</label>
                                {/* A real button, so a keyboard user can reach the password reset. */}
                                <button
                                    type="button"
                                    className="auth-text-button"
                                    onClick={() => showForgotDialog(true)}
                                >
                                    {t('Forgot Password?', 'পাসওয়ার্ড ভুলে গেছেন?')}
                                </button>
                            </div>
                            <input
                                type="password"
                                placeholder={t('Password', 'পাসওয়ার্ড')}
                                id="password"
                                name="password"
                                autoComplete="current-password"
                                onChange={handleChange}
                                className="field"
                            />
                        </div>

                        <button type="submit" className="btn btn-primary auth-wide" disabled={busy || !bot.ready}>
                            {t('Sign In', 'সাইন ইন')}
                        </button>
                    </form>
                )}
                {/* Outside both forms, so it stays put for "Send a new code". */}
                {challengeFrom === 'password' && bot.element}
                {!challenge && <GoogleButton next={after} />}

                <p className="auth-divider">{t('New here?', 'নতুন?')}</p>
                <p className="auth-switch">
                    {t('Not registered?', 'নিবন্ধন করেননি?')}{' '}
                    <Link to="/sign-up" className="auth-switch-link">
                       <b> {t('SIGN UP', 'সাইন আপ')}</b>
                    </Link>
                </p>
                <Link to="/" className="btn btn-ghost auth-wide">
                    {t('Go To Home', 'হোমে যান')}
                </Link>
            </main>

            {showForgot && (
                <div className="auth-overlay">
                    <div className="card auth-modal" role="dialog" aria-modal="true" aria-labelledby="forgot-title">
                        <span className="auth-modal-icon" aria-hidden="true"><FaKey /></span>
                        <h3 id="forgot-title" className="auth-modal-title">{t('Forgot Password', 'পাসওয়ার্ড ভুলে গেছেন')}</h3>
                        <p className="auth-sub" style={{ marginBottom: '1.25rem' }}>
                            {forgotStep === 'email' &&
                                t("Enter your email and we'll send you a code.", 'আপনার ই-মেইল লিখুন, আমরা একটি কোড পাঠাব।')}
                            {forgotStep === 'otp' &&
                                t(`Enter the code we sent to ${forgotEmail}.`, `${forgotEmail} ঠিকানায় পাঠানো কোডটি লিখুন।`)}
                            {forgotStep === 'reset' &&
                                t('Choose a new password for your account.', 'আপনার অ্যাকাউন্টের জন্য একটি নতুন পাসওয়ার্ড বেছে নিন।')}
                        </p>
                        <div className="auth-form">
                            {forgotStep === 'email' && (
                                <>
                                    <input type="email" name="reset-email" autoComplete="username" aria-label={t('Email', 'ই-মেইল')} placeholder={t('Enter your email', 'আপনার ই-মেইল লিখুন')} value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} className="field" />
                                    {forgotBot.element}
                                    <button onClick={handleForgotSendOtp} className="btn btn-primary auth-wide" disabled={!forgotBot.ready}>{t('Send OTP', 'কোড পাঠান')}</button>
                                </>
                            )}
                            {forgotStep === 'otp' && (
                                <>
                                    <input type="text" name="reset-otp" inputMode="numeric" autoComplete="one-time-code" aria-label={t('OTP', 'কোড')} placeholder={t('Enter OTP', 'কোডটি লিখুন')} value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} className="field" />
                                    <button onClick={handleForgotVerifyOtp} className="btn btn-primary auth-wide">{t('Verify OTP', 'কোড যাচাই করুন')}</button>
                                    {forgotBot.element}
                                    <button onClick={handleForgotSendOtp} className="auth-text-button" style={{ justifySelf: 'center' }} disabled={!forgotBot.ready}>{t('Resend OTP', 'আবার কোড পাঠান')}</button>
                                </>
                            )}
                            {forgotStep === 'reset' && (
                                <>
                                    <input type="password" name="new-password" autoComplete="new-password" aria-label={t('New Password', 'নতুন পাসওয়ার্ড')} placeholder={t('New Password', 'নতুন পাসওয়ার্ড')} value={newPassword} onChange={e => setNewPassword(e.target.value)} className="field" maxLength={128} aria-describedby="reset-password-rules" />
                                    <PasswordChecklist id="reset-password-rules" password={newPassword} email={forgotEmail} />
                                    <button onClick={handleForgotResetPassword} className="btn btn-primary auth-wide">{t('Set New Password', 'নতুন পাসওয়ার্ড সেট করুন')}</button>
                                </>
                            )}
                            {forgotMsg && (
                                <p role="status" className={`auth-message ${forgotOk ? 'auth-message-ok' : 'auth-message-error'}`}>{forgotMsg}</p>
                            )}
                            <button onClick={() => showForgotDialog(false)} className="btn btn-ghost auth-wide">{t('Close', 'বন্ধ করুন')}</button>
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
            <p className="auth-kicker">📚 {t('Welcome to our bookstore', 'আমাদের বইয়ের দোকানে স্বাগতম')}</p>
            <p className="auth-pitch-title">
                {pick(
                    <>Your next favourite book is <span className="auth-highlight">one tap</span> away.</>,
                    <>আপনার পরের প্রিয় বইটি মাত্র <span className="auth-highlight">এক ট্যাপ</span> দূরে।</>
                )}
            </p>
            <p className="auth-pitch-sub">
                {t('New and second-hand books from readers across Bangladesh.', 'সারা বাংলাদেশের পাঠকদের কাছ থেকে নতুন ও পুরোনো বই।')}
            </p>
            <ul className="auth-perks">
                <li><span className="auth-perk-icon"><FaBookOpen /></span>{t('New and second-hand, fairly priced', 'নতুন ও পুরোনো, ন্যায্য দামে')}</li>
                <li><span className="auth-perk-icon"><FaTruck /></span>{t('Delivered to your door', 'আপনার দরজায় ডেলিভারি')}</li>
                <li><span className="auth-perk-icon"><FaHeart /></span>{t('Save favourites to your wishlist', 'প্রিয় বই উইশলিস্টে রাখুন')}</li>
            </ul>
        </section>
    );
}
