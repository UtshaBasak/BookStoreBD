import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FaHome } from 'react-icons/fa';

export default function Profile() {
    const [profileData, setProfileData] = useState({
        email: '',
        username: '',
    });
    const [profileMode, setProfileMode] = useState('buyer'); // 'buyer' or 'seller'
    const navigate = useNavigate();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const userEmail = localStorage.getItem('userEmail');
                if (!userEmail) {
                    navigate('/sign-in');
                    return;
                }
                
                const res = await fetch(`http://localhost:1015/user/profile?email=${userEmail}`);
                if (!res.ok) {
                    throw new Error(`Failed to fetch profile: ${res.statusText}`);
                }
                const data = await res.json();
                // Redirect admin to admin panel
                if (data.email === 'utsha23basak@gmail.com') {
                    navigate('/admin/users', { replace: true });
                    return;
                }
                setProfileData(data);
            } catch (err) {
                console.error('Error fetching profile:', err);
            }
        };
        fetchProfile();
    }, [navigate]);

    // Helper: show only if value is not blank/undefined/null
    const showIfFilled = (val) => val !== undefined && val !== null && val.toString().trim() !== '';

    return (
        <div
            style={{
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
            }}
        >
            {/* Home icon button */}
            <div style={{ position: 'absolute', top: 24, left: 24 }}>
                <button
                    type="button"
                    onClick={() => navigate('/')}
                    style={{
                        background: '#fff',
                        color: '#333',
                        border: 'none',
                        borderRadius: '50%',
                        width: 40,
                        height: 40,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                        cursor: 'pointer'
                    }}
                    title="Go to Homepage"
                >
                    <FaHome size={22} />
                </button>
            </div>
            <div
                style={{
                    background: 'rgba(0, 0, 0, 0.5)',
                    padding: '2rem',
                    borderRadius: '8px',
                    width: '100%',
                    maxWidth: '400px',
                    boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
                }}
            >
                <h1 style={{ textAlign: 'center', marginBottom: '2rem' }}>Profile</h1>

                {/* Profile Mode Switch */}
                <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', marginBottom: '1.5rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="radio"
                            name="profileMode"
                            value="buyer"
                            checked={profileMode === 'buyer'}
                            onChange={() => setProfileMode('buyer')}
                        />
                        Buyer Profile
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <input
                            type="radio"
                            name="profileMode"
                            value="seller"
                            checked={profileMode === 'seller'}
                            onChange={() => setProfileMode('seller')}
                        />
                        Seller Profile
                    </label>
                </div>
                
                {/* Profile Picture Segment */}
                <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    {showIfFilled(profileData.profilePicture) ? (
                        <img 
                            src={profileData.profilePicture}
                            alt="Profile"
                            style={{
                                width: '100px',
                                height: '100px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '3px solid white',
                                display: 'block'
                            }}
                        />
                    ) : (
                        <div style={{
                            width: '100px',
                            height: '100px',
                            borderRadius: '50%',
                            background: '#bbb',
                            display: 'block',
                            border: '3px solid white'
                        }} />
                    )}
                </div>

                {/* User Information */}
                <div style={{ marginBottom: '1rem' }}>
                    <p><strong>Username:</strong> {profileData.username}</p>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <p><strong>Email:</strong> {profileData.email}</p>
                </div>
                {showIfFilled(profileData.dateOfBirth) && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Date of Birth:</strong> {new Date(profileData.dateOfBirth).toLocaleDateString()}</p>
                    </div>
                )}
                {showIfFilled(profileData.gender) && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Gender:</strong> {profileData.gender.charAt(0).toUpperCase() + profileData.gender.slice(1)}</p>
                    </div>
                )}
                {showIfFilled(profileData.address) && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Address:</strong> {profileData.address}</p>
                    </div>
                )}
                {showIfFilled(profileData.phone) && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Phone:</strong> {profileData.phone}</p>
                    </div>
                )}
                
                {/* Buttons */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1.5rem', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => navigate('/update-profile')}
                        style={{
                            backgroundColor: '#4CAF50',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s'
                        }}
                    >
                        Update Profile
                    </button>
                    {profileMode === 'seller' && (
                        <button
                            onClick={() => navigate('/add-book')}
                            style={{
                                backgroundColor: '#2196F3',
                                color: 'white',
                                padding: '0.5rem 1rem',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                transition: 'background-color 0.3s'
                            }}
                        >
                            Add Book
                        </button>
                    )}
                    <button
                        onClick={() => {/* TODO: navigate to order list page */}}
                        style={{
                            backgroundColor: '#FF9800',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s'
                        }}
                    >
                        Order List
                    </button>
                    <button
                        onClick={() => {
                            if (profileMode === 'seller') {
                                navigate('/seller-books');
                            } else {
                                // TODO: buyer book list page
                            }
                        }}
                        style={{
                            backgroundColor: '#9C27B0',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s'
                        }}
                    >
                        Book List
                    </button>
                    <button
                        onClick={() => {
                            localStorage.removeItem('userEmail');
                            // Optionally clear other auth info here
                            window.location.href = '/sign-in';
                        }}
                        style={{
                            backgroundColor: '#e74c3c',
                            color: 'white',
                            padding: '0.5rem 1rem',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s'
                        }}
                    >
                        Sign Out
                    </button>
                </div>
            </div>
        </div>
    );
}