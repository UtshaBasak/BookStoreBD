import React from 'react';
import { Link } from 'react-router-dom';
import './Homepage.css';

export default function Homepage() {
  return (
    <div className="homepage" style={{ width: '100vw', minHeight: '100vh', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1>Welcome to Homepage</h1>
      <div style={{ display: 'flex', gap: '1rem', marginTop: '2rem' }}>
        <Link to="/profile">
          <button>Profile</button>
        </Link>
        <Link to="/sign-in">
          <button>Sign In</button>
        </Link>
        <Link to="/sign-up">
          <button>Sign Up</button>
        </Link>
      </div>
    </div>
  );
}
