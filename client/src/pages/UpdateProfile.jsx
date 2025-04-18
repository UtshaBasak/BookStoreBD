import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function UpdateProfile() {
    const [formData, setFormData] = useState({
        email: '',
        username: '',
        password: '',
        address: '',
        phone: '',
        dateOfBirth: '',
        gender: '',
    });
    const [profilePicture, setProfilePicture] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchProfile = async () => {
            try {
                const userEmail = localStorage.getItem('userEmail') || 'user@example.com';
                const res = await fetch(`http://localhost:1015/user/profile?email=${userEmail}`);
                if (!res.ok) {
                    console.error(`Failed to fetch profile: ${res.statusText}`);
                    return;
                }
                const data = await res.json();
                // Don't set password in form data
                const { password, ...profileData } = data;
                setFormData(prev => ({
                    ...prev,
                    ...profileData
                }));
            } catch (err) {
                console.error('Error fetching profile:', err);
            }
        };
        fetchProfile();
    }, []);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value,
        });
    };

    const handleFileChange = (e) => {
        setProfilePicture(e.target.files[0]);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const formDataToSend = new FormData();
            Object.keys(formData).forEach(key => {
                formDataToSend.append(key, formData[key]);
            });
            if (profilePicture) {
                formDataToSend.append('profilePicture', profilePicture);
            }

            const res = await fetch('http://localhost:1015/user/profile', {
                method: 'PUT',
                body: formDataToSend,
            });

            if (!res.ok) {
                const errorData = await res.json();
                alert(`Error: ${errorData.message}`);
                return;
            }
            alert('Profile updated successfully!');
            navigate('/profile');
        } catch (err) {
            console.error('Error updating profile:', err);
            alert('Failed to update profile.');
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
            <form onSubmit={handleSubmit} style={{
                background: 'rgba(0, 0, 0, 0.5)',
                padding: '2rem',
                borderRadius: '8px',
                width: '100%',
                maxWidth: '400px',
                boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
            }}>
                <h1 style={{ textAlign: 'center', marginBottom: '1rem' }}>Update Profile</h1>
                
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
                        disabled
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
                    />
                </div>

                {/* Date of Birth field */}
                <div style={{ marginBottom: '1rem' }}>
                    <label>Date of Birth:</label>
                    <input
                        type="date"
                        name="dateOfBirth"
                        value={formData.dateOfBirth}
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
                        value={formData.address}
                        onChange={handleChange}
                        style={inputStyle}
                    />
                </div>
                <div style={{ marginBottom: '1rem' }}>
                    <label>Phone:</label>
                    <input
                        type="text"
                        name="phone"
                        value={formData.phone}
                        onChange={handleChange}
                        style={inputStyle}
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