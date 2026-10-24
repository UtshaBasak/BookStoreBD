import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom';

import Logo from '../components/Logo.js';
import PasswordChecklist from '../components/PasswordChecklist.js';
import { passwordReady } from '../utils/passwordPolicy.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { t } from '../utils/language.js';
import { isOwnProfile } from '../utils/profile.js';
import { safeImageSrc } from '../utils/safeImageSrc.js';
import FilePreview from '../components/FilePreview.js';
import ChangeEmail from '../components/ChangeEmail.js';
import { reportError } from '../utils/report.js';
import { resizeImage } from '../utils/resizeImage.js';
import { readProfileMode } from '../utils/profileMode.js';
import type { ApiError } from '@shared/api.js';

// The homepage's header bar, and the cards shared with the profile page.
import './Homepage.css';
import './Profile.css';

type BannerRole = 'buyer' | 'seller';

/** The editable profile. Every field a string, because every field is an input. */
interface ProfileForm {
    email: string;
    username: string;
    password: string;
    address: string;
    phone: string;
    bkashMerchant: string;
    dateOfBirth: string;
    gender: string;
}

export default function UpdateProfile() {
    const [profilePicture, setProfilePicture] = useState<File | null>(null);
    const [removeProfilePicture, setRemoveProfilePicture] = useState(false);
    /** A new banner for each side, or 'remove', or nothing changed. */
    const [banners, setBanners] = useState<Record<BannerRole, File | 'remove' | null>>({ buyer: null, seller: null });
    // Back to whichever side of the profile this was opened from.
    const [searchParams] = useSearchParams();
    const mode = readProfileMode(searchParams.get('mode'));
    const [errorMsg, setErrorMsg] = useState('');
    const navigate = useNavigate();
    const toast = useToast();
    const queryClient = useQueryClient();
    const userEmail = getUserEmail();
    // Arriving from "add your bKash number first", straight to that field.
    const { hash } = useLocation();
    const payoutFirst = hash === '#bkash';

    const { data: profile } = useProfile(userEmail, { enabled: Boolean(userEmail) });
    const stored = isOwnProfile(profile) ? profile : null;

    // Arriving from a step of the profile set-up: to that field, ready to type.
    useEffect(() => {
        if (!profile || !hash || payoutFirst) return;
        const field = document.getElementById(decodeURIComponent(hash.slice(1)));
        field?.scrollIntoView({ block: 'center' });
        if (field instanceof HTMLInputElement) field.focus({ preventScroll: true });
    }, [profile, hash, payoutFirst]);

    /**
     * The saved profile is the starting point; an edit is kept as an override
     * on top of it. Derived during render rather than copied in by an effect,
     * so a slow response cannot land after the user has started typing and
     * overwrite what they wrote.
     */
    const [edits, setEdits] = useState<Partial<ProfileForm>>({});
    const formData: ProfileForm = {
        username: edits.username ?? profile?.username ?? '',
        email: edits.email ?? profile?.email ?? '',
        password: edits.password ?? '',
        address: edits.address ?? stored?.address ?? '',
        phone: edits.phone ?? stored?.phone ?? '',
        bkashMerchant: edits.bkashMerchant ?? stored?.bkashMerchant ?? '',
        dateOfBirth: edits.dateOfBirth ?? stored?.dateOfBirth?.slice(0, 10) ?? '',
        gender: edits.gender ?? stored?.gender ?? '',
    };

    /*
     * The current password, asked for only when it is needed: to change the
     * password, or the bKash number sales are paid to. An account made through
     * Google has none until it sets one.
     */
    const [currentPassword, setCurrentPassword] = useState('');
    const hasOwnPassword = stored?.passwordSet !== false;
    const storedBkash = stored?.bkashMerchant ?? '';
    const typedBkash = formData.bkashMerchant.replace(/\D/g, '').replace(/^880/, '0');
    const bkashChanged = Boolean(storedBkash) && typedBkash !== storedBkash;
    const needsCurrentPassword = hasOwnPassword && (formData.password !== '' || bkashChanged);

    // A freshly picked file wins; otherwise the stored avatar, unless it has
    // been removed in this session.
    const storedPicture = removeProfilePicture ? null : profile?.profilePicture ?? null;
    const profilePicturePreview = Boolean(profilePicture || storedPicture);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        // Only allow numbers in the phone field.
        if (name === 'phone' && !/^\d*$/.test(value)) return;
        // The merchant number may be typed with spaces, dashes or +880; the
        // server keeps it as eleven digits.
        if (name === 'bkashMerchant' && !/^[\d\s+-]*$/.test(value)) return;
        setEdits((prev) => ({ ...prev, [name]: value }));
    };

    const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0] ?? null;
        setProfilePicture(file);
        // Uploading a new one cancels a pending removal.
        if (file) setRemoveProfilePicture(false);
    };

    const handleRemoveProfilePicture = () => {
        setProfilePicture(null);
        setRemoveProfilePicture(true);
    };

    const handleSubmit = async (e: FormEvent) => {
        // A new password is only sent once it meets every rule; blank keeps
        // the current one, whatever rules it was set under.
        if (formData.password && !passwordReady(formData.password, { email: formData.email, username: formData.username })) {
            e.preventDefault();
            toast.warning(
                t(
                    'Your new password does not meet every rule yet - see the list under it.',
                    'নতুন পাসওয়ার্ড এখনো সব নিয়ম মানছে না - নিচের তালিকাটি দেখুন।'
                )
            );
            return;
        }
        e.preventDefault();
        if (needsCurrentPassword && !currentPassword) {
            setErrorMsg(
                t(
                    'Enter your current password to change your password or bKash number.',
                    'পাসওয়ার্ড বা বিকাশ নম্বর বদলাতে বর্তমান পাসওয়ার্ড দিন।'
                )
            );
            document.getElementById('up-current-password')?.focus();
            return;
        }
        try {
            setErrorMsg('');
            const formDataToSend = new FormData();
            // Every field is sent, blank included, so the server can clear one;
            // the password only when a new one is typed.
            (Object.keys(formData) as Array<keyof ProfileForm>).forEach(key => {
                if (key === 'password') {
                    if (formData.password && formData.password !== '') {
                        formDataToSend.append('password', formData.password);
                    }
                } else if (key !== 'email') {
                    // The e-mail is changed on its own, with a code sent to
                    // the new address (ChangeEmail below), never with the form.
                    formDataToSend.append(key, formData[key] ?? '');
                }
            });
            if (needsCurrentPassword) formDataToSend.append('currentPassword', currentPassword);
            if (profilePicture) {
                formDataToSend.append('profilePicture', profilePicture);
            }
            if (removeProfilePicture) {
                // An empty value asks the server to remove the picture.
                formDataToSend.append('profilePicture', '');
            }
            // Banners are scaled down first: a phone photograph is megabytes,
            // for a strip two hundred pixels tall.
            for (const role of ['buyer', 'seller'] as const) {
                const banner = banners[role];
                const field = role === 'buyer' ? 'buyerBanner' : 'sellerBanner';
                if (banner === 'remove') formDataToSend.append(field, '');
                else if (banner) formDataToSend.append(field, await resizeImage(banner), 'banner.jpg');
            }

            const res = await apiFetch(`${API_BASE_URL}/user/profile`, {
                method: 'PUT',
                body: formDataToSend,
            });

            if (!res.ok) {
                const errorData = (await res.json()) as ApiError;
                // A rejected field says which and why, rather than the bare
                // "Validation failed" the envelope carries.
                setErrorMsg(errorData.errors?.[0]?.message || errorData.message || t('Failed to update profile.', 'প্রোফাইল আপডেট করা যায়নি।'));
                if (errorData.code === 'current-password') {
                    setCurrentPassword('');
                    document.getElementById('up-current-password')?.focus();
                }
                return;
            }
            // The profile is cached for half a minute, so the cache is refreshed
            // before returning to the profile page.
            await queryClient.invalidateQueries({ queryKey: ['profile'] });
            toast.success(t('Profile updated.', 'প্রোফাইল আপডেট হয়েছে।'));
            navigate(`/profile?mode=${mode}`);
        } catch (err) {
            reportError('Error updating profile:', err);
            setErrorMsg(t('Failed to update profile.', 'প্রোফাইল আপডেট করা যায়নি।'));
        }
    };

    return (
        <div className="pf-page">
            <header className="header">
                <Link to="/"
                    className="logo-button"
                    aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}
                >
                    <Logo size={38} />
                </Link>
                <div className="user-options">
                    <Link to={`/profile?mode=${mode}`} className="btn btn-ghost">
                        &#8592; {t('Back to Profile', 'প্রোফাইলে ফিরুন')}
                    </Link>
                </div>
            </header>

            <main className="pf-main pf-main-narrow">
                <div className="pf-page-head">
                    <h1>{t('Update Profile', 'প্রোফাইল আপডেট')}</h1>
                    <p>
                        {t(
                            'Keep your details up to date so orders and payouts reach you.',
                            'আপনার তথ্য হালনাগাদ রাখুন, যাতে অর্ডার ও পেমেন্ট আপনার কাছে পৌঁছায়।'
                        )}
                    </p>
                </div>

                <form onSubmit={handleSubmit} className="card pf-form">
                    <section className="pf-form-section">
                        <h2>{t('Photo', 'ছবি')}</h2>
                        <div className="pf-photo">
                            {profilePicture ? (
                                <FilePreview file={profilePicture} alt={t('Profile Preview', 'প্রোফাইল ছবির প্রিভিউ')} className="pf-avatar" max={240} />
                            ) : storedPicture ? (
                                <img
                                    src={safeImageSrc(storedPicture)}
                                    alt={t('Profile Preview', 'প্রোফাইল ছবির প্রিভিউ')}
                                    className="pf-avatar"
                                />
                            ) : (
                                <div className="pf-avatar pf-avatar-initial" aria-hidden="true">
                                    {formData.username && formData.username.length > 0
                                      ? formData.username[0].toUpperCase()
                                      : 'U'}
                                </div>
                            )}
                            <div className="pf-photo-controls">
                                <label htmlFor="up-picture" className="pf-label">{t('Profile Picture:', 'প্রোফাইল ছবি:')}</label>
                                <input
                                    id="up-picture"
                                    type="file"
                                    accept="image/png,image/jpeg,image/webp,image/gif"
                                    onChange={handleFileChange}
                                    className="w-full max-w-full text-sm text-ink-muted file:mr-3 file:min-h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-brand-tint file:px-4 file:font-bold file:text-brand"
                                />
                                {profilePicturePreview && (
                                    <button
                                        type="button"
                                        onClick={handleRemoveProfilePicture}
                                        className="btn btn-danger"
                                    >
                                        {t('Remove Profile Picture', 'প্রোফাইল ছবি সরান')}
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Banners: one for each side of the shop. */}
                    <section className="pf-form-section" id="banners">
                        <h2>{t('Banners', 'ব্যানার')}</h2>
                        <p className="pf-help">
                            {t(
                                'The picture across the top of your profile. Use a different one for buying and for selling, so each side looks like itself.',
                                'আপনার প্রোফাইলের ওপরের ছবি। কেনা আর বেচার জন্য আলাদা ছবি দিন, যাতে দুই দিক আলাদা করে চেনা যায়।'
                            )}
                        </p>
                        <div className="pf-banner-pickers">
                            {(['buyer', 'seller'] as const).map((role) => {
                                const picked = banners[role];
                                const saved = role === 'buyer' ? profile?.buyerBanner : profile?.sellerBanner;
                                const showing = picked instanceof File ? picked : picked === 'remove' ? null : saved ?? null;
                                const inputId = `up-banner-${role}`;
                                return (
                                    <div key={role} className="pf-banner-picker">
                                        <p className="pf-label">{role === 'buyer' ? t('Buyer banner', 'ক্রেতার ব্যানার') : t('Seller banner', 'বিক্রেতার ব্যানার')}</p>
                                        {showing instanceof File ? (
                                            <FilePreview file={showing} alt={t(`New ${role} banner`, role === 'buyer' ? 'ক্রেতার নতুন ব্যানার' : 'বিক্রেতার নতুন ব্যানার')} className="pf-banner-thumb" max={800} />
                                        ) : showing ? (
                                            <img src={safeImageSrc(showing)} alt={t(`Your ${role} banner`, role === 'buyer' ? 'আপনার ক্রেতা ব্যানার' : 'আপনার বিক্রেতা ব্যানার')} className="pf-banner-thumb" />
                                        ) : (
                                            <div className={`pf-banner-thumb pf-banner ${role === 'seller' ? 'pf-banner-seller' : ''}`} aria-hidden="true" />
                                        )}
                                        <div className="pf-banner-actions">
                                            <label htmlFor={inputId} className="btn btn-ghost">
                                                {showing ? t('Change', 'বদলান') : t('Choose picture', 'ছবি বেছে নিন')}
                                            </label>
                                            <input
                                                id={inputId}
                                                name={role === 'buyer' ? 'buyerBanner' : 'sellerBanner'}
                                                type="file"
                                                accept="image/png,image/jpeg,image/webp"
                                                className="sr-only"
                                                aria-label={
                                                    role === 'buyer'
                                                        ? t('Buyer banner picture', 'ক্রেতার ব্যানারের ছবি')
                                                        : t('Seller banner picture', 'বিক্রেতার ব্যানারের ছবি')
                                                }
                                                onChange={(e) => {
                                                    const file = e.target.files?.[0] ?? null;
                                                    if (file) setBanners((prev) => ({ ...prev, [role]: file }));
                                                }}
                                            />
                                            {showing && (
                                                <button
                                                    type="button"
                                                    className="btn btn-danger"
                                                    onClick={() => setBanners((prev) => ({ ...prev, [role]: saved ? 'remove' : null }))}
                                                >
                                                    {t('Remove', 'সরান')}
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </section>

                    <section className="pf-form-section">
                        <h2>{t('Account', 'অ্যাকাউন্ট')}</h2>
                        <div className="pf-grid pf-grid-2">
                            <div>
                                <label htmlFor="up-username" className="pf-label">{t('Username:', 'ইউজারনেম:')}</label>
                                <input
                                    id="up-username"
                                    type="text"
                                    name="username"
                                    value={formData.username}
                                    onChange={handleChange}
                                    className="field"
                                />
                            </div>
                            <div>
                                <label htmlFor="up-email" className="pf-label">{t('Email:', 'ই-মেইল:')}</label>
                                <input
                                    id="up-email"
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    readOnly
                                    className="field"
                                />
                                <ChangeEmail
                                    currentEmail={formData.email}
                                    passwordSet={hasOwnPassword}
                                    pendingEmail={stored?.pendingEmail ?? null}
                                />
                            </div>
                        </div>

                        <div style={{ marginTop: '1rem' }}>
                            <label htmlFor="up-password" className="pf-label">{hasOwnPassword ? t('New Password:', 'নতুন পাসওয়ার্ড:') : t('Choose a password:', 'একটি পাসওয়ার্ড বেছে নিন:')}</label>
                            <input
                                id="up-password"
                                type="password"
                                name="password"
                                placeholder={t('Enter new password', 'নতুন পাসওয়ার্ড লিখুন')}
                                onChange={handleChange}
                                className="field"
                                autoComplete="new-password"
                                maxLength={128}
                                value={formData.password}
                                aria-describedby="up-password-help"
                            />
                            <small id="up-password-help" className="pf-help">
                                {hasOwnPassword
                                    ? t('Leave blank to keep your current password.', 'বর্তমান পাসওয়ার্ড রাখতে ঘরটি ফাঁকা রাখুন।')
                                    : t(
                                          'You joined with Google. Choose a password to sign in with your e-mail as well.',
                                          'আপনি Google দিয়ে যোগ দিয়েছেন। ই-মেইল দিয়েও সাইন ইন করতে একটি পাসওয়ার্ড বেছে নিন।'
                                      )}
                            </small>
                            {formData.password && (
                                <PasswordChecklist password={formData.password} email={formData.email} username={formData.username} />
                            )}
                        </div>
                    </section>

                    <section className="pf-form-section">
                        <h2>{t('About you', 'আপনার সম্পর্কে')}</h2>
                        <div className="pf-grid">
                            <div>
                                <label htmlFor="up-dob" className="pf-label">{t('Date of Birth:', 'জন্মতারিখ:')}</label>
                                <input
                                    id="up-dob"
                                    type="date"
                                    name="dateOfBirth"
                                    value={formData.dateOfBirth || ''}
                                    onChange={handleChange}
                                    className="field sm:max-w-xs"
                                />
                            </div>

                            <fieldset className="pf-fieldset">
                                <legend className="pf-label">{t('Gender:', 'লিঙ্গ:')}</legend>
                                {/* Each option is a 44px pill: the label, not the
                                    small radio, is what a thumb lands on. */}
                                <div className="pf-pills">
                                    {[
                                        { value: 'male', label: t('Male', 'পুরুষ') },
                                        { value: 'female', label: t('Female', 'নারী') },
                                        { value: '', label: t('None', 'বলতে চাই না') },
                                    ].map((option) => (
                                        <label
                                            key={option.value}
                                            className={`pf-pill ${formData.gender === option.value ? 'pf-pill-on' : ''}`}
                                        >
                                            <input
                                                type="radio"
                                                name="gender"
                                                value={option.value}
                                                className="sr-only"
                                                checked={formData.gender === option.value}
                                                onChange={handleChange}
                                            />
                                            {option.label}
                                        </label>
                                    ))}
                                </div>
                            </fieldset>
                        </div>
                    </section>

                    <section className="pf-form-section">
                        <h2>{t('Contact', 'যোগাযোগ')}</h2>
                        <div className="pf-grid pf-grid-2">
                            <div>
                                <label htmlFor="up-address" className="pf-label">{t('Address:', 'ঠিকানা:')}</label>
                                <input
                                    id="up-address"
                                    type="text"
                                    name="address"
                                    value={formData.address || ''}
                                    onChange={handleChange}
                                    className="field"
                                />
                            </div>
                            <div>
                                <label htmlFor="up-phone" className="pf-label">{t('Phone:', 'ফোন:')}</label>
                                <input
                                    id="up-phone"
                                    type="text"
                                    name="phone"
                                    value={formData.phone || ''}
                                    onChange={handleChange}
                                    className="field"
                                    inputMode="numeric"
                                    pattern="[0-9]*"
                                />
                            </div>
                        </div>
                    </section>

                    {/*
                      Where a seller's sales are paid. Asked for here rather than
                      on the listing form, and required before a first listing.
                    */}
                    <section className="pf-form-section">
                        <h2>{t('Getting paid', 'পেমেন্ট পাওয়া')}</h2>
                        <div className={`pf-payout ${payoutFirst ? 'pf-payout-first' : ''}`}>
                            <label htmlFor="bkash" className="pf-label">
                                {t(
                                    'bKash merchant number (to get paid when your books sell):',
                                    'বিকাশ মার্চেন্ট নম্বর (বই বিক্রি হলে টাকা পেতে):'
                                )}
                            </label>
                            <input
                                id="bkash"
                                type="tel"
                                name="bkashMerchant"
                                value={formData.bkashMerchant || ''}
                                onChange={handleChange}
                                className="field"
                                inputMode="numeric"
                                autoComplete="off"
                                placeholder="01XXXXXXXXX"
                                autoFocus={payoutFirst}
                                aria-describedby="bkash-help"
                            />
                            <small id="bkash-help" className="pf-help">
                                {t(
                                    'Only you and the shop can see it. Needed before you list a book.',
                                    'শুধু আপনি আর শপ এটি দেখতে পায়। বই তালিকাভুক্ত করার আগে এটি লাগবে।'
                                )}
                            </small>
                        </div>
                    </section>

                    {/* Asked for only when changing the password or bKash number. */}
                    {needsCurrentPassword && (
                        <section className="pf-form-section pf-confirm">
                            <h2>{t('Confirm it\u2019s you', 'এটি আপনিই, নিশ্চিত করুন')}</h2>
                            <label htmlFor="up-current-password" className="pf-label">{t('Current password:', 'বর্তমান পাসওয়ার্ড:')}</label>
                            <input
                                id="up-current-password"
                                type="password"
                                name="currentPassword"
                                autoComplete="current-password"
                                className="field"
                                maxLength={200}
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                aria-describedby="up-current-password-help"
                            />
                            <small id="up-current-password-help" className="pf-help">
                                {t(
                                    'Needed to change your password or bKash number, so nobody else can.',
                                    'পাসওয়ার্ড বা বিকাশ নম্বর বদলাতে এটি লাগবে, যাতে অন্য কেউ বদলাতে না পারে।'
                                )}
                            </small>
                        </section>
                    )}

                    {/* Next to the button rather than at the top of the form,
                        so on a phone the error is in view where Save was pressed. */}
                    {errorMsg && (
                      <div role="alert" className="pf-error">{errorMsg}</div>
                    )}

                    <button type="submit" className="btn btn-primary pf-submit">
                        {t('Save Changes', 'পরিবর্তন সংরক্ষণ করুন')}
                    </button>
                </form>
            </main>
        </div>
    );
}
