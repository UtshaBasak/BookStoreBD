import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Profile() {
    const [profileData, setProfileData] = useState({
        email: '',
        username: '',
    });
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
                setProfileData(data);
            } catch (err) {
                console.error('Error fetching profile:', err);
            }
        };
        fetchProfile();
    }, [navigate]);

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
                
                {/* Profile Picture */}
                {profileData.profilePicture && (
                    <div style={{ marginBottom: '1rem', textAlign: 'center' }}>
                        <img 
                            src={`http://localhost:1015/uploads/${profileData.profilePicture}`}
                            alt="Profile"
                            style={{
                                width: '100px',
                                height: '100px',
                                borderRadius: '50%',
                                objectFit: 'cover',
                                border: '3px solid white'
                            }}
                        />
                    </div>
                )}

                {/* User Information */}
                <div style={{ marginBottom: '1rem' }}>
                    <p><strong>Username:</strong> {profileData.username}</p>
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <p><strong>Email:</strong> {profileData.email}</p>
                </div>
                {profileData.dateOfBirth && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Date of Birth:</strong> {new Date(profileData.dateOfBirth).toLocaleDateString()}</p>
                    </div>
                )}
                {profileData.gender && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Gender:</strong> {profileData.gender.charAt(0).toUpperCase() + profileData.gender.slice(1)}</p>
                    </div>
                )}
                {profileData.address && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Address:</strong> {profileData.address}</p>
                    </div>
                )}
                {profileData.phone && (
                    <div style={{ marginBottom: '1rem' }}>
                        <p><strong>Phone:</strong> {profileData.phone}</p>
                    </div>
                )}
                
                {/* Add buttons container */}
                <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
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
                </div>
            </div>
        </div>
    );
}