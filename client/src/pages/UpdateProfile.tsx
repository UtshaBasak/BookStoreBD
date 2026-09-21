import { useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { API_BASE_URL, apiFetch } from '../config/api.js';
import { useProfile } from '../hooks/queries.js';
import { getUserEmail } from '../utils/auth.js';
import { isOwnProfile } from '../utils/profile.js';
import { safeImageSrc, safeObjectUrl } from '../utils/safeImageSrc.js';

/** The editable profile. Every field a string, because every field is an input. */
interface ProfileForm {
    email: string;
    username: string;
    password: string;
    address: string;
    phone: string;
    dateOfBirth: string;
    gender: string;
}

export default function UpdateProfile() {
    const [profilePicture, setProfilePicture] = useState<File | null>(null);
    const [removeProfilePicture, setRemoveProfilePicture] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');
    const navigate = useNavigate();
    const userEmail = getUserEmail();

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
        dateOfBirth: edits.dateOfBirth ?? stored?.dateOfBirth?.slice(0, 10) ?? '',
        gender: edits.gender ?? stored?.gender ?? '',
    };

    // A freshly picked file wins; otherwise the stored avatar, unless it has
    // been removed in this session.
    const pickedPreview = profilePicture ? safeObjectUrl(profilePicture) : null;
    const profilePicturePreview =
        pickedPreview ?? (removeProfilePicture ? null : profile?.profilePicture ?? null);

    const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        // Only allow numbers in the phone field.
        if (name === 'phone' && !/^\d*$/.test(value)) return;
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
                const errorData = await res.json();
                if (errorData.message === "Username already exists" || errorData.message === "Email already exists") {
                    setErrorMsg(errorData.message);
                } else {
                    setErrorMsg(errorData.message || "Failed to update profile.");
                }
                return;
            }
            alert('Profile updated successfully!');
            navigate('/profile');
        } catch (err) {
            console.error('Error updating profile:', err);
            setErrorMsg('Failed to update profile.');
        }
    };

    return (
        <div style={{
            backgroundImage: 'url(https://a-static.besthdwallpaper.com/a-peaceful-library-with-a-variety-of-books-on-the-shelves-wallpaper-1280x720-98073_45.jpg)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            minHeight: '100vh',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '2rem',
            color: '#fff',
            width: '100vw',
        }}>
            <div style={{ position: 'absolute', top: 24, left: 24 }}>
                <button
                    type="button"
                    onClick={() => navigate('/profile')}
                    style={{
                        background: '#2196F3',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        padding: '0.5rem 1rem',
                        cursor: 'pointer',
                        fontWeight: 500,
                        fontSize: 16,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem'
                    }}
                >
                    &#8592; Back to Profile
                </button>
            </div>
            <form onSubmit={handleSubmit} style={{
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '2rem',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '400px',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
            }}>
                <h1 style={{ textAlign: 'center', marginBottom: '1rem' }}>Update Profile</h1>
                {errorMsg && (
                  <div style={{ color: 'red', marginBottom: '1rem' }}>{errorMsg}</div>
                )}

                {/* Profile Picture Preview */}
                <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                    {profilePicturePreview ? (
                        <>
                            <img
                                src={safeImageSrc(profilePicturePreview)}
                                alt="Profile Preview"
                                style={{
                                    width: '100px',
                                    height: '100px',
                                    borderRadius: '50%',
                                    objectFit: 'cover',
                                    border: '3px solid white'
                                }}
                            />
                            <div>
                                <button
                                    type="button"
                                    onClick={handleRemoveProfilePicture}
                                    style={{
                                        marginTop: '0.5rem',
                                        background: '#e74c3c',
                                        color: 'white',
                                        border: 'none',
                                        borderRadius: '4px',
                                        padding: '0.25rem 0.75rem',
                                        cursor: 'pointer'
                                    }}
                                >
                                    Remove Profile Picture
                                </button>
                            </div>
                        </>
                    ) : (
                        <div style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: '#bbb',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '2.5rem',
                            color: '#fff',
                            border: '3px solid white',
                            margin: '0 auto'
                        }}>
                            {formData.username && formData.username.length > 0
                              ? formData.username[0].toUpperCase()
                              : 'U'}
                        </div>
                    )}
                </div>

                {/* Username and Email fields */}
                <div style={{ marginBottom: '1rem' }}>
                    <label>Username:</label>
                    <input
                        type="text"
                        name="username"
                        value={formData.username}
                        onChange={handleChange}
                        style={inputStyle}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Email:</label>
                    <input
                        type="email"
                        name="email"
                        value={formData.email}
                        onChange={handleChange}
                        style={inputStyle}
                    />
                </div>

                {/* New Password field */}
                <div style={{ marginBottom: '1rem' }}>
                    <label>New Password:</label>
                    <input
                        type="password"
                        name="password"
                        placeholder="Enter new password"
                        onChange={handleChange}
                        style={inputStyle}
                        autoComplete="new-password"
                        value={formData.password}
                    />
                </div>

                {/* Date of Birth field */}
                <div style={{ marginBottom: '1rem' }}>
                    <label>Date of Birth:</label>
                    <input
                        type="date"
                        name="dateOfBirth"
                        value={formData.dateOfBirth || ''}
                        onChange={handleChange}
                        style={inputStyle}
                    />
                </div>

                {/* Gender Selection */}
                <div style={{ marginBottom: '1rem' }}>
                    <label>Gender:</label>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                        <label>
                            <input
                                type="radio"
                                name="gender"
                                value="male"
                                checked={formData.gender === 'male'}
                                onChange={handleChange}
                            /> Male
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="gender"
                                value="female"
                                checked={formData.gender === 'female'}
                                onChange={handleChange}
                            /> Female
                        </label>
                        <label>
                            <input
                                type="radio"
                                name="gender"
                                value=""
                                checked={formData.gender === ''}
                                onChange={handleChange}
                            /> None
                        </label>
                    </div>
                </div>

                {/* Profile Picture Upload */}
                <div style={{ marginBottom: '1rem' }}>
                    <label>Profile Picture:</label>
                    <input
                        type="file"
                        accept="image/*"
                        onChange={handleFileChange}
                        style={{
                            ...inputStyle,
                            padding: '0.5rem 0'
                        }}
                    />
                </div>

                {/* Address and Phone fields */}
                <div style={{ marginBottom: '1rem' }}>
                    <label>Address:</label>
                    <input
                        type="text"
                        name="address"
                        value={formData.address || ''}
                        onChange={handleChange}
                        style={inputStyle}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Phone:</label>
                    <input
                        type="text"
                        name="phone"
                        value={formData.phone || ''}
                        onChange={handleChange}
                        style={inputStyle}
                        inputMode="numeric"
                        pattern="[0-9]*"
                    />
                </div>

                <button type="submit" style={{
                    width: '100%',
                    padding: '0.75rem',
                    backgroundColor: '#007BFF',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    marginTop: '1rem',
                }}>
                    Save Changes
                </button>
            </form>
        </div>
    );
}

const inputStyle = {
    width: '100%',
    padding: '0.5rem',
    margin: '0.5rem 0',
    borderRadius: '4px',
    border: '1px solid #ccc',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    color: '#000',
};
