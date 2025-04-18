import React from 'react';
import { Link, Routes, Route } from 'react-router-dom';
import './AdminPanel.css';
import UserManagement from './UserManagement';
import TransactionHistory from './TransactionHistory';
import BookList from './BookList';

export default function AdminPanel() {
  return (
    <div className="admin-panel">
      {/* Sidebar */}
      <aside className="sidebar">
        <h2>Admin Panel</h2>
        <nav>
          <ul>
            <li><Link to="/admin/users">User Management</Link></li>
            <li><Link to="/admin/transactions">Transaction History</Link></li>
            <li><Link to="/admin/books">Book List</Link></li>
          </ul>
        </nav>
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