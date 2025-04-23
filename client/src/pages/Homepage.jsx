import React from 'react';
import { Link } from 'react-router-dom';
import './Homepage.css';

export default function Homepage() {
  return (
    <div
      className="homepage"
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
      {/* Content Box */}
      <div
        style={{
          background: 'rgba(0, 0, 0, 0.5)',
          padding: '2rem',
          borderRadius: '8px',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 4px 8px rgba(0, 0, 0, 0.2)',
          textAlign: 'center',
        }}
      >
        <h1 style={{ marginBottom: '2rem' }}>Welcome to Homepage</h1>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            justifyContent: 'center',
            gap: '1rem',
          }}
        >
          <Link to="/sign-in">
            <button
              style={{
                backgroundColor: '#2196F3',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.3s',
              }}
            >
              Sign In
            </button>
          </Link>
          <Link to="/sign-up">
            <button
              style={{
                backgroundColor: '#FF9800',
                color: 'white',
                padding: '0.5rem 1rem',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                transition: 'background-color 0.3s',
              }}
            >
              Sign Up
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
}
