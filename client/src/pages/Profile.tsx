import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
    FaBirthdayCake,
    FaBook,
    FaBoxOpen,
    FaCheckCircle,
    FaExclamationTriangle,
    FaHeart,
    FaMapMarkerAlt,
    FaPhone,
    FaPlus,
    FaShoppingBag,
    FaShoppingCart,
    FaSignOutAlt,
    FaStore,
    FaUser,
    FaUserEdit,
} from 'react-icons/fa';

import type { OwnProfile } from '@shared/api.js';

import AccountData from '../components/AccountData.js';
import TwoStepSetting from '../components/TwoStepSetting.js';
import SessionsSetting from '../components/SessionsSetting.js';
import NotificationSettings from '../components/NotificationSettings.js';
import ProfileSetup from '../components/ProfileSetup.js';
import InviteFriends from '../components/InviteFriends.js';
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import { ThemeSetting, ThemeToggle } from '../components/ThemeToggle.js';
import { LanguageSetting, LanguageToggle } from '../components/LanguageToggle.js';
import { signOut } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { getUserEmail, isAdmin } from '../utils/auth.js';
import { formatDate, pick, t } from '../utils/language.js';
import { readProfileMode, rememberProfileMode, type ProfileMode } from '../utils/profileMode.js';

// The homepage's header bar, then this page's own cards.
import './Homepage.css';
import './Profile.css';

export default function Profile() {
    /*
     * Buyer or seller, kept in the address and on this device. The address
     * says which one this is, so the back button returns to it; the device
     * remembers the last one chosen, for links to /profile that do not say.
     */
    const [searchParams, setSearchParams] = useSearchParams();
    const [profileMode, setMode] = useState<ProfileMode>(() => readProfileMode(searchParams.get('mode')));
    const setProfileMode = (mode: ProfileMode) => {
        setMode(mode);
        rememberProfileMode(mode);
        setSearchParams({ mode }, { replace: true });
    };
    const navigate = useNavigate();
    const userEmail = getUserEmail();

    // Rendering guards only; the API re-checks both on every request.
    // An administrator's account settings live in the panel: a link from an
    // e-mail to the security cards here lands on the same cards there.
    const { hash } = useLocation();
    useEffect(() => {
        if (!userEmail) navigate('/sign-in');
        else if (isAdmin()) {
            const toSettings = ['#security', '#two-step', '#notification-settings'].includes(hash);
            navigate(toSettings ? `/admin/settings${hash}` : '/admin/analytics', { replace: true });
        }
    }, [navigate, userEmail, hash]);

    // Partial because the API returns only the public fields to anyone who is
    // not the owner; this page always asks for its own, but the type should
    // not pretend the rest are guaranteed.
    const { data } = useProfile(userEmail, { enabled: Boolean(userEmail) });
    const profileData: Partial<OwnProfile> = data ?? { email: '', username: '' };

    // A link to the set-up card or two-step sign-in, from a notification or
    // the set-up checklist, lands on it once the page has its content.
    useEffect(() => {
        // The notification settings too: whichever of the profile and the
        // settings arrives last, the page ends up on them.
        if (data && ['#setup', '#two-step', '#security', '#notification-settings'].includes(hash)) {
            document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
        }
    }, [data, hash]);

    // Blank, null and undefined fields are left off the page.
    const showIfFilled = (val: unknown) =>
        val !== undefined && val !== null && String(val).trim() !== '';

    const isSeller = profileMode === 'seller';
    const gender = profileData.gender ?? '';
    const details = [
        showIfFilled(profileData.dateOfBirth) && {
            label: t('Date of Birth', 'জন্মতারিখ'),
            value: formatDate(profileData.dateOfBirth ?? 0),
            icon: <FaBirthdayCake />,
        },
        showIfFilled(profileData.gender) && {
            label: t('Gender', 'লিঙ্গ'),
            value:
                gender === 'male'
                    ? t('Male', 'পুরুষ')
                    : gender === 'female'
                      ? t('Female', 'নারী')
                      : gender.charAt(0).toUpperCase() + gender.slice(1),
            icon: <FaUser />,
        },
        showIfFilled(profileData.address) && { label: t('Address', 'ঠিকানা'), value: profileData.address, icon: <FaMapMarkerAlt /> },
        showIfFilled(profileData.phone) && { label: t('Phone', 'ফোন'), value: profileData.phone, icon: <FaPhone /> },
    ].filter((detail) => detail !== false);

    const tiles = [
        {
            key: 'update',
            title: t('Update Profile', 'প্রোফাইল আপডেট'),
            desc: t('Photo, contact details and password', 'ছবি, যোগাযোগের তথ্য ও পাসওয়ার্ড'),
            icon: <FaUserEdit />,
            onClick: () => navigate(`/update-profile?mode=${profileMode}`),
        },
        ...(isSeller
            ? [{
                key: 'add',
                title: t('Add Book', 'বই যোগ করুন'),
                desc: t('List a book for sale in a couple of minutes', 'কয়েক মিনিটেই একটি বই বিক্রির জন্য তালিকাভুক্ত করুন'),
                icon: <FaPlus />,
                onClick: () => navigate('/add-book'),
                accent: true,
            }]
            : []),
        {
            key: 'orders',
            title: t('Order List', 'অর্ডার তালিকা'),
            desc: isSeller
                ? t('Orders from your buyers', 'আপনার ক্রেতাদের অর্ডার')
                : t('Track what you have bought', 'আপনার কেনা জিনিস ট্র্যাক করুন'),
            icon: <FaBoxOpen />,
            onClick: () => {
                if (profileMode === 'seller') {
                    navigate('/seller-orders');
                } else {
                    navigate('/buyer/orders');
                }
            },
        },
        {
            key: 'books',
            title: t('Book List', 'বইয়ের তালিকা'),
            desc: isSeller
                ? t('The books you are selling', 'আপনি যে বইগুলো বিক্রি করছেন')
                : t('Every book you have bought', 'আপনার কেনা সব বই'),
            icon: <FaBook />,
            onClick: () => {
                if (profileMode === 'seller') {
                    navigate('/seller-books');
                } else {
                    navigate('/buyer-books');
                }
            },
        },
    ];

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
                    <LanguageToggle />
                    <ThemeToggle className="icon-button theme-toggle header-theme-toggle" />
                    <NotificationBell />
                    {/* Cart and wishlist on the buyer side only. */}
                    {profileMode === 'buyer' && (
                        <>
                            <Link to="/wishlist" className="icon-link" style={{ color: 'var(--color-accent)' }} title={t('Go to Wishlist', 'উইশলিস্টে যান')} aria-label={t('Go to Wishlist', 'উইশলিস্টে যান')}>
                                <FaHeart />
                            </Link>
                            <Link to="/cart" className="icon-link" style={{ color: 'var(--color-brand)' }} title={t('Go to Cart', 'কার্টে যান')} aria-label={t('Go to Cart', 'কার্টে যান')}>
                                <FaShoppingCart />
                            </Link>
                        </>
                    )}
                </div>
            </header>

            <main className="pf-main">
                <section className="card pf-hero">
                    {/* The banner for the side of the shop on show: the
                        person's own picture when they have set one. */}
                    {(isSeller ? profileData.sellerBanner : profileData.buyerBanner) ? (
                        <img
                            className="pf-banner pf-banner-photo"
                            src={(isSeller ? profileData.sellerBanner : profileData.buyerBanner) ?? undefined}
                            alt=""
                        />
                    ) : (
                        <div className={`pf-banner ${isSeller ? 'pf-banner-seller' : ''}`} aria-hidden="true">
                            <Link to={`/update-profile?mode=${profileMode}#banners`} className="pf-banner-add">
                                {isSeller
                                    ? t('Add a seller banner', 'বিক্রেতা ব্যানার যোগ করুন')
                                    : t('Add a buyer banner', 'ক্রেতা ব্যানার যোগ করুন')}
                            </Link>
                        </div>
                    )}
                    <div className="pf-hero-body">
                        {showIfFilled(profileData.profilePicture) ? (
                            <img
                                src={profileData.profilePicture ?? undefined}
                                alt={t('Profile', 'প্রোফাইল')}
                                className="pf-avatar"
                            />
                        ) : (
                            <div className="pf-avatar pf-avatar-initial" aria-hidden="true">
                                {profileData.username && profileData.username.length > 0
                                  ? profileData.username[0].toUpperCase()
                                  : 'U'}
                            </div>
                        )}

                        <div className="pf-identity">
                            <p className="pf-kicker">{t('Profile', 'প্রোফাইল')}</p>
                            <h1 className="pf-name">{profileData.username || t('Your profile', 'আপনার প্রোফাইল')}</h1>
                            <p className="pf-email">{profileData.email}</p>
                        </div>

                        <div className="pf-mode" role="radiogroup" aria-label={t('Profile mode', 'প্রোফাইলের ধরন')}>
                            <label className={`pf-mode-option ${profileMode === 'buyer' ? 'pf-mode-option-on' : ''}`}>
                                <input
                                    type="radio"
                                    name="profileMode"
                                    value="buyer"
                                    className="sr-only"
                                    checked={profileMode === 'buyer'}
                                    onChange={() => setProfileMode('buyer')}
                                />
                                <FaShoppingBag aria-hidden="true" />
                                {t('Buyer Profile', 'ক্রেতা প্রোফাইল')}
                            </label>
                            <label className={`pf-mode-option ${profileMode === 'seller' ? 'pf-mode-option-on' : ''}`}>
                                <input
                                    type="radio"
                                    name="profileMode"
                                    value="seller"
                                    className="sr-only"
                                    checked={profileMode === 'seller'}
                                    onChange={() => setProfileMode('seller')}
                                />
                                <FaStore aria-hidden="true" />
                                {t('Seller Profile', 'বিক্রেতা প্রোফাইল')}
                            </label>
                        </div>
                    </div>

                    {details.length > 0 && (
                        <dl className="pf-details">
                            {details.map((detail) => (
                                <div key={detail.label} className="pf-detail">
                                    <span className="pf-detail-icon" aria-hidden="true">{detail.icon}</span>
                                    <div style={{ minWidth: 0 }}>
                                        <dt>{detail.label}</dt>
                                        <dd>{detail.value}</dd>
                                    </div>
                                </div>
                            ))}
                        </dl>
                    )}
                </section>

                <ProfileSetup profile={profileData} mode={profileMode} />

                {/* Where sales are paid - and, without it, why listing will not work. */}
                {profileMode === 'seller' && (
                    profileData.bkashMerchant ? (
                        <div className="pf-note pf-note-ok">
                            <FaCheckCircle className="pf-note-icon" aria-hidden="true" />
                            <p><strong>{t('Paid to bKash:', 'বিকাশে টাকা যায়:')}</strong> {profileData.bkashMerchant}</p>
                        </div>
                    ) : (
                        <div className="pf-note pf-note-warn">
                            <FaExclamationTriangle className="pf-note-icon" aria-hidden="true" />
                            <p>
                                {pick(
                                    <><strong>To sell, add your bKash merchant number</strong> so we can pay you.{' '}</>,
                                    <><strong>বিক্রি করতে আপনার বিকাশ মার্চেন্ট নম্বর যোগ করুন</strong>, যাতে আমরা টাকা পাঠাতে পারি।{' '}</>
                                )}
                            </p>
                            <Link to="/update-profile?mode=seller#bkash" className="btn btn-accent">{t('Add it now', 'এখনই যোগ করুন')}</Link>
                        </div>
                    )
                )}

                <h2 className="pf-section-title">{isSeller ? t('Your shop', 'আপনার শপ') : t('Your account', 'আপনার অ্যাকাউন্ট')}</h2>
                <div className="pf-tiles">
                    {tiles.map((tile) => (
                        <div key={tile.key} className={`card pf-tile ${tile.accent ? 'pf-tile-accent' : ''}`}>
                            <span className="pf-tile-icon" aria-hidden="true">{tile.icon}</span>
                            <button
                                type="button"
                                className="pf-tile-button"
                                onClick={tile.onClick}
                                aria-describedby={`tile-${tile.key}`}
                            >
                                {tile.title}
                            </button>
                            <p id={`tile-${tile.key}`} className="pf-tile-desc">{tile.desc}</p>
                        </div>
                    ))}
                </div>

                <div className="pf-signout">
                    <button
                        type="button"
                        className="btn btn-danger"
                        onClick={async () => {
                            await signOut();
                            window.location.href = '/sign-in';
                        }}
                    >
                        <FaSignOutAlt aria-hidden="true" />
                        {t('Sign Out', 'সাইন আউট')}
                    </button>
                </div>

                <InviteFriends />
                <NotificationSettings />
                <TwoStepSetting />
                <SessionsSetting />
                <ThemeSetting />
                <LanguageSetting />
                <AccountData />
            </main>
        </div>
    );
}
