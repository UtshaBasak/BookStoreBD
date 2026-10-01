import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
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
import Logo from '../components/Logo.js';
import NotificationBell from '../components/NotificationBell.js';
import { ThemeSetting, ThemeToggle } from '../components/ThemeToggle.js';
import { signOut } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { getUserEmail, isAdmin } from '../utils/auth.js';
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
    useEffect(() => {
        if (!userEmail) navigate('/sign-in');
        else if (isAdmin()) navigate('/admin/users', { replace: true });
    }, [navigate, userEmail]);

    // Partial because the API returns only the public fields to anyone who is
    // not the owner; this page always asks for its own, but the type should
    // not pretend the rest are guaranteed.
    const { data } = useProfile(userEmail, { enabled: Boolean(userEmail) });
    const profileData: Partial<OwnProfile> = data ?? { email: '', username: '' };

    // Blank, null and undefined fields are left off the page.
    const showIfFilled = (val: unknown) =>
        val !== undefined && val !== null && String(val).trim() !== '';

    const isSeller = profileMode === 'seller';
    const gender = profileData.gender ?? '';
    const details = [
        showIfFilled(profileData.dateOfBirth) && {
            label: 'Date of Birth',
            value: new Date(profileData.dateOfBirth ?? 0).toLocaleDateString(),
            icon: <FaBirthdayCake />,
        },
        showIfFilled(profileData.gender) && {
            label: 'Gender',
            value: gender.charAt(0).toUpperCase() + gender.slice(1),
            icon: <FaUser />,
        },
        showIfFilled(profileData.address) && { label: 'Address', value: profileData.address, icon: <FaMapMarkerAlt /> },
        showIfFilled(profileData.phone) && { label: 'Phone', value: profileData.phone, icon: <FaPhone /> },
    ].filter((detail) => detail !== false);

    const tiles = [
        {
            key: 'update',
            title: 'Update Profile',
            desc: 'Photo, contact details and password',
            icon: <FaUserEdit />,
            onClick: () => navigate(`/update-profile?mode=${profileMode}`),
        },
        ...(isSeller
            ? [{
                key: 'add',
                title: 'Add Book',
                desc: 'List a book for sale in a couple of minutes',
                icon: <FaPlus />,
                onClick: () => navigate('/add-book'),
                accent: true,
            }]
            : []),
        {
            key: 'orders',
            title: 'Order List',
            desc: isSeller ? 'Orders from your buyers' : 'Track what you have bought',
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
            title: 'Book List',
            desc: isSeller ? 'The books you are selling' : 'Every book you have bought',
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
                    aria-label="BookStoreBD home"
                >
                    <Logo size={38} />
                </Link>
                <div className="user-options">
                    <ThemeToggle className="icon-button theme-toggle header-theme-toggle" />
                    <NotificationBell />
                    {/* Cart and wishlist on the buyer side only. */}
                    {profileMode === 'buyer' && (
                        <>
                            <Link to="/wishlist" className="icon-link" style={{ color: 'var(--color-accent)' }} title="Go to Wishlist" aria-label="Go to Wishlist">
                                <FaHeart />
                            </Link>
                            <Link to="/cart" className="icon-link" style={{ color: 'var(--color-brand)' }} title="Go to Cart" aria-label="Go to Cart">
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
                                Add a {isSeller ? 'seller' : 'buyer'} banner
                            </Link>
                        </div>
                    )}
                    <div className="pf-hero-body">
                        {showIfFilled(profileData.profilePicture) ? (
                            <img
                                src={profileData.profilePicture ?? undefined}
                                alt="Profile"
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
                            <p className="pf-kicker">Profile</p>
                            <h1 className="pf-name">{profileData.username || 'Your profile'}</h1>
                            <p className="pf-email">{profileData.email}</p>
                        </div>

                        <div className="pf-mode" role="radiogroup" aria-label="Profile mode">
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
                                Buyer Profile
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
                                Seller Profile
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

                {/* Where sales are paid - and, without it, why listing will not work. */}
                {profileMode === 'seller' && (
                    profileData.bkashMerchant ? (
                        <div className="pf-note pf-note-ok">
                            <FaCheckCircle className="pf-note-icon" aria-hidden="true" />
                            <p><strong>Paid to bKash:</strong> {profileData.bkashMerchant}</p>
                        </div>
                    ) : (
                        <div className="pf-note pf-note-warn">
                            <FaExclamationTriangle className="pf-note-icon" aria-hidden="true" />
                            <p>
                                <strong>To sell, add your bKash merchant number</strong> so we can pay you.{' '}
                            </p>
                            <Link to="/update-profile?mode=seller#bkash" className="btn btn-accent">Add it now</Link>
                        </div>
                    )
                )}

                <h2 className="pf-section-title">{isSeller ? 'Your shop' : 'Your account'}</h2>
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
                        Sign Out
                    </button>
                </div>

                <TwoStepSetting />
                <ThemeSetting />
                <AccountData />
            </main>
        </div>
    );
}
