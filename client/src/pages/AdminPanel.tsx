import { useEffect } from 'react';
import { Link, Routes, Route, useNavigate } from 'react-router-dom';
import './AdminPanel.css';
import UserManagement from './UserManagement';
import TransactionHistory from './TransactionHistory';
import BookList from './BookList';
import ReturnManagement from './admin/ReturnManagement';
import ReviewModeration from './admin/ReviewModeration';
import { FaHome } from 'react-icons/fa';
import { isAdmin } from '../utils/auth.js';
import { signOut } from '../config/api.js';

export default function AdminPanel() {
  const navigate = useNavigate();

  // Rendering guard only; the API enforces the real check.
  useEffect(() => {
    if (!isAdmin()) {
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
            className="icon-button"
            onClick={() => navigate('/')}
            style={{
              background: '#fff',
              color: '#2c3e50',
              borderRadius: '50%',
              boxShadow: '0 2px 8px rgba(0,0,0,0.12)'
            }}
            title="Go to Homepage"
            aria-label="Go to Homepage"
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
            <li><Link to="/admin/returns">Return Management</Link></li>
            <li><Link to="/admin/reviews">Reported Reviews</Link></li>
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
          onClick={async () => {
            await signOut();
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
          <Route path="/returns" element={<ReturnManagement />} />
          <Route path="/reviews" element={<ReviewModeration />} />
        </Routes>
      </main>
    </div>
  );
}
