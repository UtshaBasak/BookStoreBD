// import React from 'react';
import { Link } from 'react-router-dom';
import React, { useState } from 'react';


export default function SignIn() {
    const [formData,setFormData] = useState({}) 
        // for track the changes..object and based on function and keep empty obj
        const handleChange =(e) => {
            setFormData({
                ...formData,
                [e.target.id]:e.target.value,
            });
    
        };
    
        const handleSubmit = async (e) => {
            e.preventDefault();
    
            try {
                const res = await fetch('http://localhost:1015/auth/signin', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(formData),
                });
    
                const data = await res.json();
                console.log(data);
                alert(JSON.stringify(data));
            } catch (err) {
                console.error('Error submitting form:', err);
                alert('Error submitting form: ' + err.message);
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
        <form onSubmit = {handleSubmit}>
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
          Not registered?{' '}
          <Link to="/sign-up" style={{ color: '#00f', textDecoration: 'underline' }}>
            SIGN UP
          </Link>
        </p>
      </div>
    </div>
  );
}