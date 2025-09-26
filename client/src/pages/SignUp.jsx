import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

export default function SignUp() {
    const [formData, setFormData] = useState({});
    const [step, setStep] = useState('form'); // form | otp | done
    const [otp, setOtp] = useState('');
    const [otpMsg, setOtpMsg] = useState('');
    const [emailForOtp, setEmailForOtp] = useState('');
    const navigate = useNavigate();

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

    const handleSendOtp = async (email) => {
        setOtpMsg('');
        const res = await fetch('http://localhost:4000/auth/send-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, username: formData.username, purpose: 'register' }) // include purpose
        });
        const data = await res.json();
        if (res.ok) {
            setOtpMsg('OTP sent to your email.');
            setStep('otp');
            setEmailForOtp(email);
        } else {
            setOtpMsg(data.message || 'Failed to send OTP.');
        }
    };

    const handleVerifyOtp = async () => {
        setOtpMsg('');
        const res = await fetch('http://localhost:4000/auth/verify-otp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: emailForOtp, code: otp })
        });
        const data = await res.json();
        if (res.ok) {
            setOtpMsg('OTP verified. Completing registration...');
            // Now submit registration
            handleSubmitFinal();
        } else {
            setOtpMsg(data.message || 'Invalid OTP. Try again.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.email || !formData.username || !formData.password) {
            alert('Please fill all fields.');
            return;
        }
        // Prevent sending OTP if already in OTP step
        if (step === 'otp') return;
        await handleSendOtp(formData.email);
    };

    const handleSubmitFinal = async () => {
        // ...existing code...
        try {
            const res = await fetch('http://localhost:4000/auth/signup', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formData, otp }),
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('userEmail', formData.email);
                setStep('done');
                setTimeout(() => navigate('/'), 1000);
            } else {
                alert(JSON.stringify(data));
            }
        } catch (error) {
            console.error('Error submitting form:', error);
            alert('Error submitting form: ' + error.message);
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

            {/* Sign-Up Form */}
            <div
                style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.7)',
                    padding: '2rem',
                    borderRadius: '8px',
                    width: '300px',
                    textAlign: 'center',
                }}
            >
                <h2 style={{ fontSize: '1.5rem', marginBottom: '1.5rem' }}>Sign Up</h2>
                {step === 'form' && (
                    <form onSubmit={handleSubmit}>
                        <div style={{ marginBottom: '1rem' }}>
                            <input
                                type="text"
                                placeholder="Username"
                                id="username"
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
                            Send OTP
                        </button>
                        {/* Show error or info message below the button */}
                        {otpMsg && (
                            <div style={{ color: otpMsg.startsWith('OTP sent') ? 'green' : 'red', marginTop: 8 }}>
                                {otpMsg}
                            </div>
                        )}
                    </form>
                )}
                {step === 'otp' && (
                    <div>
                        <input
                            type="text"
                            placeholder="Enter OTP"
                            value={otp}
                            onChange={e => setOtp(e.target.value)}
                            style={{ width: '100%', padding: '0.5rem', marginBottom: '1rem' }}
                        />
                        <button onClick={handleVerifyOtp} style={{ width: '100%', padding: '0.75rem', backgroundColor: '#333', color: 'white', border: 'none', borderRadius: '4px' }}>
                            Verify OTP & Register
                        </button>
                        <button type="button" onClick={() => handleSendOtp(emailForOtp)} style={{ marginTop: 8, background: 'none', color: '#00f', border: 'none', cursor: 'pointer' }}>
                            Resend OTP
                        </button>
                        <div style={{ color: otpMsg.startsWith('OTP verified') || otpMsg.startsWith('OTP sent') ? 'green' : 'red', marginTop: 8 }}>{otpMsg}</div>
                    </div>
                )}
                {step === 'done' && (
                    <div style={{ color: 'green', marginTop: 16 }}>Registration successful! Redirecting...</div>
                )}
                {/* Forgot Password Link */}
        {/* <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
          <Link to="/forgot-password" style={{ color: '#00f', textDecoration: 'underline' }}>
            Forgot Password?
          </Link>
        </p> */}
                <p style={{ marginTop: '1rem', fontSize: '0.9rem' }}>
                    Already registered?{' '}
                    <Link to="/sign-in" style={{ color: 'white', textDecoration: 'underline', textDecoration: 'none', backgroundColor: '#8B6F6F' }}>
                        <b>SIGN IN</b>
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
        </div>
    );
}
