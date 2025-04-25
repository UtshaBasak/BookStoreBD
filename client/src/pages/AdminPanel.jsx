import React, { useEffect } from 'react';
import { Link, Routes, Route, useNavigate } from 'react-router-dom';
import './AdminPanel.css';
import UserManagement from './UserManagement';
import TransactionHistory from './TransactionHistory';
import BookList from './BookList';
import { FaHome } from 'react-icons/fa';

const ADMIN_EMAIL = 'utsha23basak@gmail.com';

export default function AdminPanel() {
  const navigate = useNavigate();

  useEffect(() => {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail !== ADMIN_EMAIL) {
      navigate('/sign-in', { replace: true });
    }
  }, [navigate]);

  return (
    <div className="admin-panel">
      {/* Sidebar */}
      <aside className="sidebar">
        {/* Home icon button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{
              background: '#fff',
              color: '#2c3e50',
              border: 'none',
              borderRadius: '50%',
              width: 36,
              height: 36,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
              cursor: 'pointer'
            }}
            title="Go to Homepage"
          >
            <FaHome size={20} />
          </button>
        </div>
        <h2>Admin Panel</h2>
        <nav>
          <ul>
            <li><Link to="/admin/users">User Management</Link></li>
            <li><Link to="/admin/transactions">Transaction History</Link></li>
            <li><Link to="/admin/books">Book List</Link></li>
          </ul>
        </nav>
        <button
          style={{
            marginTop: '2rem',
            width: '100%',
            padding: '0.75rem',
            backgroundColor: '#e74c3c',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            fontWeight: 'bold'
          }}
          onClick={() => {
            localStorage.removeItem('userEmail');
            window.location.href = '/sign-in';
          }}
        >
          Sign Out
        </button>
      </aside>
      {/* Main Content */}
      <main className="main-content">
        <Routes>
          <Route path="/users" element={<UserManagement />} />
          <Route path="/transactions" element={<TransactionHistory />} />
          <Route path="/books" element={<BookList />} />
        </Routes>
      </main>
    </div>
  );
}