import { Link, useNavigate } from 'react-router-dom';
import React, { useState, useEffect } from 'react';

export default function SignIn() {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({});
    const [showForgot, setShowForgot] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotOtp, setForgotOtp] = useState('');
    const [forgotStep, setForgotStep] = useState('email'); // email | otp | reset
    const [forgotMsg, setForgotMsg] = useState('');
    const [newPassword, setNewPassword] = useState('');

    useEffect(() => {
        const userEmail = localStorage.getItem('userEmail');
        if (userEmail) {
            if (userEmail === 'utsha23basak@gmail.com') navigate('/admin/users', { replace: true });
            else navigate('/profile', { replace: true });
        }
    }, [navigate]);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.id]: e.target.value,
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        try {
            const res = await fetch('https://bookstorebd.onrender.com/auth/signin', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(formData),
            });

            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('userEmail', formData.email);
                navigate('/'); // Redirect to homepage after sign in
            } else {
                alert(JSON.stringify(data));
            }
        } catch (err) {
            console.error('Error submitting form:', err);
            alert('Error submitting form: ' + err.message);
        }
    };

    const handleForgotSendOtp = async () => {
        setForgotMsg('');
        const res = await fetch('https://bookstorebd.onrender.com/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, purpose: 'reset' }) // include purpose
        });
        const data = await res.json();
        if (res.ok) {
            setForgotStep('otp');
            setForgotMsg('OTP sent to your email.');
        } else {
            setForgotMsg(data.message || 'Failed to send OTP.');
        }
    };

    const handleForgotVerifyOtp = async () => {
        setForgotMsg('');
        const res = await fetch('https://bookstorebd.onrender.com/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, code: forgotOtp })
        });
        const data = await res.json();
        if (res.ok) {
            setForgotStep('reset');
            setForgotMsg('OTP verified. Enter new password.');
        } else {
            setForgotMsg(data.message || 'Invalid OTP.');
        }
    };

    const handleForgotResetPassword = async () => {
        setForgotMsg('');
        const res = await fetch('https://bookstorebd.onrender.com/auth/reset-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: forgotEmail, otp: forgotOtp, newPassword })
        });
        const data = await res.json();
        if (res.ok) {
            setForgotMsg('Password reset successful. Please sign in.');
            setTimeout(() => setShowForgot(false), 1000);
        } else {
            setForgotMsg(data.message || 'Failed to reset password.');
        }
    };

    console.log(formData);

    return (
        <div
            style={{
                backgroundImage: `url(https://images.unsplash.com/photo-1481627834876-b7833e8f5570?fm=jpg&q=60&w=3000&ixlib=rb-4.0.3&ixid=M3wxMjA3fDB8MHxzZWFyY2h8M3x8bGlicmFyeXxlbnwwfHwwfHx8MA%3D%3D)`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                height: '100vh',
                width: '100vw',
                margin: 0,
                padding: 0,
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                flexDirection: 'column',
                color: 'white',
                fontFamily: 'Arial, sans-serif',
                boxSizing: 'border-box',
            }}
        >
            {/* Header */}
            <h1
                style={{
                    fontSize: '2.5rem',
                    fontWeight: 'bold',
                    textAlign: 'center',
                    marginBottom: '1rem',
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)',
                }}
            >
                WELCOME TO OUR BOOKSTORE
            </h1>

            {/* Sign-In Form */}
            <div
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: '2rem',
                    borderRadius: '8px',
                    width: '300px',
                    textAlign: 'center',
                }}
            >
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Sign In</h2>
                <form onSubmit={handleSubmit}>
                    <div style={{ marginBottom: '1rem' }}>
                        <input
                            type="email"
                            placeholder="Email"
                            id="email"
                            onChange={handleChange}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: 'none',
                                borderBottom: '1px solid white',
                                background: 'transparent',
                                color: 'white',
                                fontSize: '1rem',
                                outline: 'none',
                            }}
                        />
                    </div>
                    <div style={{ marginBottom: '1.5rem' }}>
                        <input
                            type="password"
                            placeholder="Password"
                            id="password"
                            onChange={handleChange}
                            style={{
                                width: '100%',
                                padding: '0.5rem',
                                border: 'none',
                                borderBottom: '1px solid white',
                                background: 'transparent',
                                color: 'white',
                                fontSize: '1rem',
                                outline: 'none',
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        style={{
                            width: '100%',
                            padding: '0.75rem',
                            backgroundColor: '#333',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '1rem',
                            cursor: 'pointer',
                            transition: 'background-color 0.3s',
                        }}
                        onMouseOver={(e) => (e.target.style.backgroundColor = '#555')}
                        onMouseOut={(e) => (e.target.style.backgroundColor = '#333')}
                    >
                        Sign In
                    </button>
                </form>
                <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                    <span style={{ color: 'white', textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setShowForgot(true)}>
                        Forgot Password?
                    </span>
                </p>
                <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                    Not registered?{' '}
                    <Link to="/sign-up" style={{ color: 'white', textDecoration: 'none', backgroundColor: '#8B6F6F' }}>
                       <b> SIGN UP</b>
                    </Link>
                </p>
                {/* Go To Home Button */}
                <button
                    type="button"
                    style={{
                        width: '100%',
                        padding: '0.75rem',
                        backgroundColor: '#8B6F6F',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        fontSize: '1rem',
                        cursor: 'pointer',
                        marginTop: '1rem',
                        transition: 'background-color 0.3s',
                    }}
                    onClick={() => navigate('/')}
                    onMouseOver={e => (e.target.style.backgroundColor = '#6d5454')}
                    onMouseOut={e => (e.target.style.backgroundColor = '#8B6F6F')}
                >
                    Go To Home
                </button>
            </div>

            {/* Forgot Password Modal */}
            {showForgot && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
                    background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
                }}>
                    <div style={{ background: '#fff', color: '#222', padding: 32, borderRadius: 8, minWidth: 320 }}>
                        <h3>Forgot Password</h3>
                        {forgotStep === 'email' && (
                            <>
                                <input type="email" placeholder="Enter your email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
                                <button onClick={handleForgotSendOtp} style={{ width: '100%', padding: 10, background: '#333', color: '#fff', border: 'none', borderRadius: 4 }}>Send OTP</button>
                            </>
                        )}
                        {forgotStep === 'otp' && (
                            <>
                                <input type="text" placeholder="Enter OTP" value={forgotOtp} onChange={e => setForgotOtp(e.target.value)} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
                                <button onClick={handleForgotVerifyOtp} style={{ width: '100%', padding: 10, background: '#333', color: '#fff', border: 'none', borderRadius: 4 }}>Verify OTP</button>
                                <button onClick={handleForgotSendOtp} style={{ marginTop: 8, background: 'none', color: '#00f', border: 'none', cursor: 'pointer' }}>Resend OTP</button>
                            </>
                        )}
                        {forgotStep === 'reset' && (
                            <>
                                <input type="password" placeholder="New Password" value={newPassword} onChange={e => setNewPassword(e.target.value)} style={{ width: '100%', marginBottom: 12, padding: 8 }} />
                                <button onClick={handleForgotResetPassword} style={{ width: '100%', padding: 10, background: '#333', color: '#fff', border: 'none', borderRadius: 4 }}>Set New Password</button>
                            </>
                        )}
                        <div style={{ color: forgotMsg.startsWith('Password reset') ? 'green' : 'red', marginTop: 8 }}>{forgotMsg}</div>
                        <button onClick={() => setShowForgot(false)} style={{ marginTop: 16, background: '#e74c3c', color: '#fff', border: 'none', borderRadius: 4, padding: 8, width: '100%' }}>Close</button>
                    </div>
                </div>
            )}
        </div>
    );
}
