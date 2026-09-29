import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import Logo from '../components/Logo.js';
import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { useToast } from '../hooks/useToast.js';
import { getUserEmail } from '../utils/auth.js';
import { isOwnProfile } from '../utils/profile.js';
import { safeImageSrc } from '../utils/safeImageSrc.js';
import FilePreview from '../components/FilePreview.js';
import { reportError } from '../utils/report.js';
import type { ApiError } from '@shared/api.js';

// The homepage's header bar, and the cards shared with the profile page.
import './Homepage.css';
import './Profile.css';

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
    const [errorMsg, setErrorMsg] = useState('');
    const navigate = useNavigate();
    const toast = useToast();
    const userEmail = getUserEmail();
    // Arriving from "add your bKash number first", straight to that field.
    const payoutFirst = useLocation().hash === '#bkash';

    const { data: profile } = useProfile(userEmail, { enabled: Boolean(userEmail) });
    const stored = isOwnProfile(profile) ? profile : null;

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
        e.preventDefault();
        try {
            setErrorMsg('');
            const formDataToSend = new FormData();
            // Always send all fields except password (send password only if non-empty)
            (Object.keys(formData) as Array<keyof ProfileForm>).forEach(key => {
                if (key === 'password') {
                    if (formData.password && formData.password !== '') {
                        formDataToSend.append('password', formData.password);
                    }
                } else {
                    // Always send, even if blank, so backend can unset
                    formDataToSend.append(key, formData[key] ?? '');
                }
            });
            if (profilePicture) {
                formDataToSend.append('profilePicture', profilePicture);
            }
            if (removeProfilePicture) {
                // Signal backend to remove profile picture
                formDataToSend.append('profilePicture', '');
            }

            const res = await apiFetch(`${API_BASE_URL}/user/profile`, {
                method: 'PUT',
                body: formDataToSend,
            });

            if (!res.ok) {
                const errorData = (await res.json()) as ApiError;
                // A rejected field says which and why, rather than the bare
                // "Validation failed" the envelope carries.
                setErrorMsg(errorData.errors?.[0]?.message || errorData.message || 'Failed to update profile.');
                return;
            }
            toast.success('Profile updated.');
            navigate('/profile');
        } catch (err) {
            reportError('Error updating profile:', err);
            setErrorMsg('Failed to update profile.');
        }
    };

    return (
        <div className="pf-page">
            <header className="header">
                <button
                    type="button"
                    className="logo-button"
                    onClick={() => navigate('/')}
                    aria-label="BookStoreBD home"
                >
                    <Logo size={38} />
                </button>
                <div className="user-options">
                    <button type="button" className="btn btn-ghost" onClick={() => navigate('/profile')}>
                        &#8592; Back to Profile
                    </button>
                </div>
            </header>

            <main className="pf-main pf-main-narrow">
                <div className="pf-page-head">
                    <h1>Update Profile</h1>
                    <p>Keep your details up to date so orders and payouts reach you.</p>
                </div>

                <form onSubmit={handleSubmit} className="card pf-form">
                    {/* Profile Picture Preview */}
                    <section className="pf-form-section">
                        <h2>Photo</h2>
                        <div className="pf-photo">
                            {profilePicture ? (
                                <FilePreview file={profilePicture} alt="Profile Preview" className="pf-avatar" max={240} />
                            ) : storedPicture ? (
                                <img
                                    src={safeImageSrc(storedPicture)}
                                    alt="Profile Preview"
                                    className="pf-avatar"
                                />
                            ) : (
                                <div className="pf-avatar pf-avatar-initial" aria-hidden="true">
                                    {formData.username && formData.username.length > 0
                                      ? formData.username[0].toUpperCase()
                                      : 'U'}
                                </div>
                            )}
                            {/* Profile Picture Upload */}
                            <div className="pf-photo-controls">
                                <label htmlFor="up-picture" className="pf-label">Profile Picture:</label>
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
                                        Remove Profile Picture
                                    </button>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* Username and Email fields */}
                    <section className="pf-form-section">
                        <h2>Account</h2>
                        <div className="pf-grid pf-grid-2">
                            <div>
                                <label htmlFor="up-username" className="pf-label">Username:</label>
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
                                <label htmlFor="up-email" className="pf-label">Email:</label>
                                <input
                                    id="up-email"
                                    type="email"
                                    name="email"
                                    value={formData.email}
                                    onChange={handleChange}
                                    className="field"
                                />
                            </div>
                        </div>

                        {/* New Password field */}
                        <div style={{ marginTop: '1rem' }}>
                            <label htmlFor="up-password" className="pf-label">New Password:</label>
                            <input
                                id="up-password"
                                type="password"
                                name="password"
                                placeholder="Enter new password"
                                onChange={handleChange}
                                className="field"
                                autoComplete="new-password"
                                value={formData.password}
                                aria-describedby="up-password-help"
                            />
                            <small id="up-password-help" className="pf-help">Leave blank to keep your current password.</small>
                        </div>
                    </section>

                    <section className="pf-form-section">
                        <h2>About you</h2>
                        <div className="pf-grid">
                            {/* Date of Birth field */}
                            <div>
                                <label htmlFor="up-dob" className="pf-label">Date of Birth:</label>
                                <input
                                    id="up-dob"
                                    type="date"
                                    name="dateOfBirth"
                                    value={formData.dateOfBirth || ''}
                                    onChange={handleChange}
                                    className="field sm:max-w-xs"
                                />
                            </div>

                            {/* Gender Selection */}
                            <fieldset className="pf-fieldset">
                                <legend className="pf-label">Gender:</legend>
                                {/* Each option is a 44px pill: a radio is a 13px
                                    box whatever anyone does, but the label is
                                    what a thumb actually lands on. */}
                                <div className="pf-pills">
                                    {[
                                        { value: 'male', label: 'Male' },
                                        { value: 'female', label: 'Female' },
                                        { value: '', label: 'None' },
                                    ].map((option) => (
                                        <label
                                            key={option.label}
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

                    {/* Address and Phone fields */}
                    <section className="pf-form-section">
                        <h2>Contact</h2>
                        <div className="pf-grid pf-grid-2">
                            <div>
                                <label htmlFor="up-address" className="pf-label">Address:</label>
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
                                <label htmlFor="up-phone" className="pf-label">Phone:</label>
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
                        <h2>Getting paid</h2>
                        <div className={`pf-payout ${payoutFirst ? 'pf-payout-first' : ''}`}>
                            <label htmlFor="bkash" className="pf-label">bKash merchant number (to get paid when your books sell):</label>
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
                                Only you and the shop can see it. Needed before you list a book.
                            </small>
                        </div>
                    </section>

                    {/* Next to the button rather than at the top of the form: on
                        a phone the top is a long scroll away from where the
                        visitor pressed Save. */}
                    {errorMsg && (
                      <div role="alert" className="pf-error">{errorMsg}</div>
                    )}

                    <button type="submit" className="btn btn-primary pf-submit">
                        Save Changes
                    </button>
                </form>
            </main>
        </div>
    );
}
