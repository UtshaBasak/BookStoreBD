import { useEffect, useRef } from 'react';
import { Link, NavLink, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import type { IconType } from 'react-icons';
import './AdminPanel.css';
import UserManagement from './UserManagement';
import TransactionHistory from './TransactionHistory';
import BookList from './BookList';
import ReturnManagement from './admin/ReturnManagement';
import ReviewModeration from './admin/ReviewModeration';
import SellerPayouts from './admin/SellerPayouts';
import AllReviews from './admin/AllReviews';
import AdminMessages from './admin/AdminMessages';
import {
  FaBook,
  FaFlag,
  FaMoneyBillWave,
  FaPaperPlane,
  FaStar,
  FaReceipt,
  FaSignOutAlt,
  FaUndoAlt,
  FaUsers,
} from 'react-icons/fa';
import Logo from '../components/Logo.js';
import { isAdmin } from '../utils/auth.js';
import { signOut } from '../config/api.js';

interface Section {
  to: string;
  label: string;
  icon: IconType;
  /** One line for the cards on /admin. */
  blurb: string;
}

const SECTIONS: Section[] = [
  { to: '/admin/users', label: 'User Management', icon: FaUsers, blurb: 'Find an account, or remove one.' },
  { to: '/admin/transactions', label: 'Transaction History', icon: FaReceipt, blurb: 'Every order, and where it is.' },
  { to: '/admin/books', label: 'Book List', icon: FaBook, blurb: 'Every listing in the shop.' },
  { to: '/admin/returns', label: 'Return Management', icon: FaUndoAlt, blurb: 'Approve or refuse a return.' },
  { to: '/admin/payouts', label: 'Seller Payouts', icon: FaMoneyBillWave, blurb: 'What sellers are owed, and paid.' },
  { to: '/admin/all-reviews', label: 'Reviews', icon: FaStar, blurb: 'Every review in the shop.' },
  { to: '/admin/reviews', label: 'Reported Reviews', icon: FaFlag, blurb: 'Reviews somebody has reported.' },
  { to: '/admin/messages', label: 'Messages', icon: FaPaperPlane, blurb: 'Notify or e-mail buyers and sellers.' },
];

/** /admin on its own used to be a blank page beside the menu. */
function AdminHome() {
  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h1 className="admin-page-title">Welcome back 👋</h1>
          <p className="admin-lede">Pick up where the shop needs you.</p>
        </div>
      </header>
      <div className="admin-welcome-grid">
        {SECTIONS.map(({ to, label, icon: Icon, blurb }) => (
          <Link key={to} to={to} className="card admin-welcome-card">
            <span className="admin-page-icon" aria-hidden="true">
              <Icon />
            </span>
            <span>
              <strong>{label}</strong>
              <span className="admin-cell-muted">{blurb}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function AdminPanel() {
  const navigate = useNavigate();
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);

  // Rendering guard only; the API enforces the real check.
  useEffect(() => {
    if (!isAdmin()) {
      navigate('/sign-in', { replace: true });
    }
  }, [navigate]);

  // On a phone the sections scroll sideways; bring the current one into view
  // so "Reported Reviews" is not hidden off the edge while it is open.
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('.admin-nav-link.active');
    const nav = navRef.current;
    if (!active || !nav || nav.scrollWidth <= nav.clientWidth) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [location.pathname]);

  const handleSignOut = async () => {
    await signOut();
    window.location.href = '/sign-in';
  };

  return (
    <div className="admin-panel">
      {/* Sidebar: a bar across the top on a phone. */}
      <aside className="admin-sidebar aurora">
        <div className="admin-sidebar-top">
          {/* The logo is the way back to the shop, as on every other page;
              the "Back to shop" buttons it replaces said the same thing twice. */}
          <div className="admin-brand">
            <Link to="/" className="admin-brand-link" aria-label="BookStoreBD home" title="Back to the shop">
              <Logo inverted size={34} />
            </Link>
            <h2>Admin Panel</h2>
          </div>
          <div className="admin-sidebar-actions">
            <button type="button" className="admin-side-button is-danger" onClick={handleSignOut}>
              <FaSignOutAlt aria-hidden="true" />
              Sign Out
            </button>
          </div>
        </div>

        <nav className="admin-nav" ref={navRef} aria-label="Admin sections">
          <ul>
            {SECTIONS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className="admin-nav-link">
                  <Icon className="admin-nav-icon" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="admin-sidebar-foot">
          <button type="button" className="admin-side-button is-danger" onClick={handleSignOut}>
            <FaSignOutAlt aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>
      {/* Main Content */}
      <main className="admin-main">
        <Routes>
          <Route index element={<AdminHome />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/transactions" element={<TransactionHistory />} />
          <Route path="/books" element={<BookList />} />
          <Route path="/returns" element={<ReturnManagement />} />
          <Route path="/payouts" element={<SellerPayouts />} />
          <Route path="/all-reviews" element={<AllReviews />} />
          <Route path="/reviews" element={<ReviewModeration />} />
          <Route path="/messages" element={<AdminMessages />} />
        </Routes>
      </main>
    </div>
  );
}
