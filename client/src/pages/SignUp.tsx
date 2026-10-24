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
import { formatNumber, pick, t } from '../utils/language.js';
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
    const [otpMsg, setOtpMsgText] = useState('');
    // Whether the line reports progress (green) or a failure (red).
    const [otpOk, setOtpOk] = useState(false);
    const setOtpMsg = (message: string, ok = false) => {
        setOtpMsgText(message);
        setOtpOk(ok);
    };
    const [emailForOtp, setEmailForOtp] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [checking, setChecking] = useState(false);
    const navigate = useNavigate();
    const toast = useToast();
    // The bot check, before a code is e-mailed.
    const bot = useBotCheck();

    useEffect(() => {
        if (isAuthenticated()) {
            navigate(isAdmin() ? '/admin/analytics' : '/profile', { replace: true });
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
            setOtpMsg(t('OTP sent to your email.', 'আপনার ই-মেইলে কোড পাঠানো হয়েছে।'), true);
            setStep('otp');
            setEmailForOtp(email);
        } else {
            setOtpMsg(data.message || t('Failed to send OTP.', 'কোড পাঠানো যায়নি।'));
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
            setOtpMsg(t('OTP verified. Completing registration...', 'কোড যাচাই হয়েছে। নিবন্ধন শেষ হচ্ছে...'), true);
            handleSubmitFinal();
        } else {
            setOtpMsg(data.message || t('Invalid OTP. Try again.', 'কোডটি সঠিক নয়। আবার চেষ্টা করুন।'));
        }
    };

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        if (!formData.email || !formData.username || !formData.password) {
            toast.warning(t('Please fill in every field.', 'অনুগ্রহ করে সব ঘর পূরণ করুন।'));
            return;
        }
        // A code has already been sent.
        if (step === 'otp') return;
        const context = { email: formData.email, username: formData.username };
        if (!passwordReady(formData.password, context)) {
            toast.warning(
                t(
                    'Your password does not meet every rule yet - see the list under it.',
                    'আপনার পাসওয়ার্ড এখনো সব নিয়ম মানছে না - নিচের তালিকাটি দেখুন।'
                )
            );
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
                toast.error(verdict.message || t('Please choose a different password.', 'অনুগ্রহ করে অন্য একটি পাসওয়ার্ড বেছে নিন।'));
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
                toast.error(failure.message || t('Could not create your account.', 'আপনার অ্যাকাউন্ট খোলা যায়নি।'));
            }
        } catch (error) {
            reportError('Error submitting form:', error);
            toast.error(t('Could not reach the server. Please check your connection.', 'সার্ভারে পৌঁছানো যায়নি। আপনার ইন্টারনেট সংযোগ দেখুন।'));
        }
    };

    // Where the visitor is in the three steps, for the progress bar.
    const stepIndex = step === 'form' ? 0 : step === 'otp' ? 1 : 2;

    return (
        <div className="auth-page aurora">
            <AuthPitch />

            <main className="card auth-card">
                <Link to="/" className="auth-logo" aria-label={t(`${site.name} home`, `${site.name} হোম`)}>
                    <Logo size={40} />
                </Link>
                <h1 className="auth-title">{t('Sign Up', 'সাইন আপ')}</h1>
                <p className="auth-sub">
                    {t(
                        'Create your free account to buy, sell and save books you love.',
                        'প্রিয় বই কিনতে, বিক্রি করতে আর সংরক্ষণ করতে বিনা খরচে অ্যাকাউন্ট খুলুন।'
                    )}
                </p>

                <ol className="auth-steps" aria-label={t('Sign-up steps', 'সাইন-আপের ধাপ')}>
                    {[t('Your details', 'আপনার তথ্য'), t('Verify email', 'ই-মেইল যাচাই'), t('All set', 'সব প্রস্তুত')].map((label, i) => (
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
                            <label htmlFor="username" className="auth-label">{t('Username', 'ইউজারনেম')}</label>
                            <input
                                type="text"
                                placeholder={t('Username', 'ইউজারনেম')}
                                id="username"
                                name="username"
                                autoComplete="username"
                                onChange={handleChange}
                                className="field"
                            />
                        </div>
                        <div>
                            <label htmlFor="email" className="auth-label">{t('Email', 'ই-মেইল')}</label>
                            <input
                                type="email"
                                placeholder={t('Email', 'ই-মেইল')}
                                id="email"
                                name="email"
                                autoComplete="email"
                                onChange={handleChange}
                                className="field"
                            />
                        </div>
                        <div>
                            <div className="auth-label-row">
                                <label htmlFor="password" className="auth-label">{t('Password', 'পাসওয়ার্ড')}</label>
                                <button
                                    type="button"
                                    className="auth-show"
                                    onClick={() => setShowPassword((shown) => !shown)}
                                    aria-pressed={showPassword}
                                >
                                    {showPassword ? t('Hide', 'লুকান') : t('Show', 'দেখান')}
                                </button>
                            </div>
                            <input
                                type={showPassword ? 'text' : 'password'}
                                placeholder={t('Password', 'পাসওয়ার্ড')}
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
                            {checking ? t('Checking...', 'যাচাই হচ্ছে...') : t('Send OTP', 'কোড পাঠান')}
                        </button>
                        {/*
                          A sentence rather than a tick-box: it says the same
                          thing and costs nobody a click on the way in.
                        */}
                        <p className="auth-fine-print">
                            {pick(
                                <>
                                    By creating an account you confirm you are {site.minimumAge} or older and agree
                                    to the <Link to="/terms">terms of service</Link> and{' '}
                                    <Link to="/privacy">privacy policy</Link>.
                                </>,
                                <>
                                    অ্যাকাউন্ট খোলার মাধ্যমে আপনি নিশ্চিত করছেন যে আপনার বয়স {formatNumber(site.minimumAge)} বা তার বেশি,
                                    এবং <Link to="/terms">পরিষেবার শর্তাবলি</Link> ও{' '}
                                    <Link to="/privacy">গোপনীয়তা নীতিতে</Link> সম্মতি দিচ্ছেন।
                                </>
                            )}
                        </p>
                        {otpMsg && (
                            <p role="status" className={`auth-message ${otpOk ? 'auth-message-ok' : 'auth-message-error'}`}>
                                {otpMsg}
                            </p>
                        )}
                    </form>
                )}
                {step === 'otp' && (
                    <div className="auth-form">
                        <p className="auth-note">
                            {pick(
                                <>
                                    We sent a code to <b>{emailForOtp}</b>. It can take a minute to arrive - check your spam folder too.
                                </>,
                                <>
                                    <b>{emailForOtp}</b> ঠিকানায় একটি কোড পাঠানো হয়েছে। আসতে এক মিনিট লাগতে পারে - স্প্যাম ফোল্ডারও দেখুন।
                                </>
                            )}
                        </p>
                        <div>
                            <label htmlFor="signup-otp" className="auth-label">{t('Code from your email', 'ই-মেইলে পাওয়া কোড')}</label>
                            <input
                                id="signup-otp"
                                type="text"
                                name="otp"
                                inputMode="numeric"
                                autoComplete="one-time-code"
                                placeholder={t('Enter OTP', 'কোডটি লিখুন')}
                                value={otp}
                                onChange={e => setOtp(e.target.value)}
                                className="field"
                            />
                        </div>
                        <button onClick={handleVerifyOtp} className="btn btn-primary auth-wide">
                            {t('Verify OTP & Register', 'কোড যাচাই করে নিবন্ধন করুন')}
                        </button>
                        <button type="button" onClick={() => handleSendOtp(emailForOtp)} className="auth-text-button" style={{ justifySelf: 'center' }} disabled={!bot.ready}>
                            {t('Resend OTP', 'আবার কোড পাঠান')}
                        </button>
                        {otpMsg && (
                            <p role="status" className={`auth-message ${otpOk ? 'auth-message-ok' : 'auth-message-error'}`}>{otpMsg}</p>
                        )}
                    </div>
                )}
                {step === 'done' && (
                    <div className="auth-done" role="status">
                        <span className="auth-done-emoji" aria-hidden="true">🎉</span>
                        <p className="auth-message auth-message-ok">
                            {t('Registration successful! Redirecting...', 'নিবন্ধন সফল হয়েছে! নিয়ে যাওয়া হচ্ছে...')}
                        </p>
                    </div>
                )}

                {/* Outside the forms, so it stays put for "Resend OTP". */}
                {step !== 'done' && bot.element}
                {step === 'form' && <GoogleButton />}

                <p className="auth-divider">{t('Have an account?', 'অ্যাকাউন্ট আছে?')}</p>
                <p className="auth-switch">
                    {t('Already registered?', 'আগেই নিবন্ধন করেছেন?')}{' '}
                    <Link to="/sign-in" className="auth-switch-link">
                        <b>{t('SIGN IN', 'সাইন ইন')}</b>
                    </Link>
                </p>
                <Link to="/" className="btn btn-ghost auth-wide">
                    {t('Go To Home', 'হোমে যান')}
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
            <p className="auth-kicker">📚 {t('Welcome to our bookstore', 'আমাদের বইয়ের দোকানে স্বাগতম')}</p>
            <p className="auth-pitch-title">
                {pick(
                    <>Join the readers who <span className="auth-highlight">buy and sell</span> here.</>,
                    <>যে পাঠকেরা এখানে <span className="auth-highlight">কেনেন ও বিক্রি করেন</span>, তাঁদের সঙ্গে যোগ দিন।</>
                )}
            </p>
            <p className="auth-pitch-sub">
                {t(
                    'One free account to shop, save favourites and sell the books you have finished.',
                    'একটি ফ্রি অ্যাকাউন্টেই কেনাকাটা, প্রিয় বই সংরক্ষণ আর পড়া শেষ হওয়া বই বিক্রি।'
                )}
            </p>
            <ul className="auth-perks">
                <li><span className="auth-perk-icon"><FaBookOpen /></span>{t('New and second-hand, fairly priced', 'নতুন ও পুরোনো, ন্যায্য দামে')}</li>
                <li><span className="auth-perk-icon"><FaStore /></span>{t('Sell your books and get paid by bKash', 'বই বিক্রি করে বিকাশে টাকা নিন')}</li>
                <li><span className="auth-perk-icon"><FaHeart /></span>{t('Save favourites to your wishlist', 'প্রিয় বই উইশলিস্টে রাখুন')}</li>
            </ul>
        </section>
    );
}
