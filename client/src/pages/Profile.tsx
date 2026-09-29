import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
    FaBirthdayCake,
    FaBook,
    FaBoxOpen,
    FaCheckCircle,
    FaExclamationTriangle,
    FaHeart,
    FaHome,
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
import Logo from '../components/Logo.js';
import { signOut } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { getUserEmail, isAdmin } from '../utils/auth.js';

// The homepage's header bar, then this page's own cards.
import './Homepage.css';
import './Profile.css';

export default function Profile() {
    const [profileMode, setProfileMode] = useState('buyer'); // 'buyer' or 'seller'
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

    // Helper: show only if value is not blank/undefined/null
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
            onClick: () => navigate('/update-profile'),
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
                <button
                    type="button"
                    className="logo-button"
                    onClick={() => navigate('/')}
                    aria-label="Go to homepage"
                >
                    <Logo size={38} />
                </button>
                <div className="user-options">
                    {/* Home icon button */}
                    <button
                        type="button"
                        className="icon-button"
                        style={{ color: '#6d28d9' }}
                        onClick={() => navigate('/')}
                        title="Go to Homepage"
                    >
                        <FaHome />
                    </button>
                    {/* Cart and Wishlist buttons for buyer profile */}
                    {profileMode === 'buyer' && (
                        <>
                            <Link to="/wishlist" className="icon-link" style={{ color: '#ff5c35' }} title="Go to Wishlist">
                                <FaHeart />
                            </Link>
                            <Link to="/cart" className="icon-link" style={{ color: '#6d28d9' }} title="Go to Cart">
                                <FaShoppingCart />
                            </Link>
                        </>
                    )}
                </div>
            </header>

            <main className="pf-main">
                <section className="card pf-hero">
                    <div className="pf-banner" aria-hidden="true" />
                    <div className="pf-hero-body">
                        {/* Profile Picture Segment */}
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

                        {/* User Information */}
                        <div className="pf-identity">
                            <p className="pf-kicker">Profile</p>
                            <h1 className="pf-name">{profileData.username || 'Your profile'}</h1>
                            <p className="pf-email">{profileData.email}</p>
                        </div>

                        {/* Profile Mode Switch */}
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
                            <Link to="/update-profile#bkash" className="btn btn-accent">Add it now</Link>
                        </div>
                    )
                )}

                {/* Buttons */}
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

                <AccountData />
            </main>
        </div>
    );
}
