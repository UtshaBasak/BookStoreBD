import { useEffect, useRef } from 'react';
import { Link, NavLink, Navigate, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
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
import ShopAnalytics from './admin/ShopAnalytics';
import {
  FaBook,
  FaChartLine,
  FaCog,
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
import { ThemeToggle } from '../components/ThemeToggle.js';
import NotificationSettings from '../components/NotificationSettings.js';
import TwoStepSetting from '../components/TwoStepSetting.js';
import SessionsSetting from '../components/SessionsSetting.js';
import { getUserEmail, isAdmin } from '../utils/auth.js';
import { useNotificationSettings, useProfile } from '../hooks/queries.js';
import { signOut } from '../config/api.js';

interface Section {
  to: string;
  label: string;
  icon: IconType;
}

const SECTIONS: Section[] = [
  { to: '/admin/analytics', label: 'Shop Analytics', icon: FaChartLine },
  { to: '/admin/users', label: 'User Management', icon: FaUsers },
  { to: '/admin/transactions', label: 'Transaction History', icon: FaReceipt },
  { to: '/admin/books', label: 'Book List', icon: FaBook },
  { to: '/admin/returns', label: 'Return Management', icon: FaUndoAlt },
  { to: '/admin/payouts', label: 'Seller Payouts', icon: FaMoneyBillWave },
  { to: '/admin/all-reviews', label: 'Reviews', icon: FaStar },
  { to: '/admin/reviews', label: 'Reported Reviews', icon: FaFlag },
  { to: '/admin/messages', label: 'Messages', icon: FaPaperPlane },
  { to: '/admin/settings', label: 'Settings', icon: FaCog },
];

/** The administrator's own settings: what they hear about, and keeping the account safe. */
function AdminSettings() {
  // A link from a security e-mail lands on the card it is about, once the
  // cards above it have their content and will not push it down again.
  const { hash } = useLocation();
  const email = getUserEmail();
  const profile = useProfile(email, { enabled: Boolean(email) });
  const notifications = useNotificationSettings();
  const settled = !profile.isPending && !notifications.isPending;
  useEffect(() => {
    if (hash && settled) document.getElementById(hash.slice(1))?.scrollIntoView({ block: 'start' });
  }, [hash, settled]);

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <h2 className="admin-page-title">
            <span className="admin-page-icon" aria-hidden="true">
              <FaCog />
            </span>
            Settings
          </h2>
          <p className="admin-lede">What you hear about, and how your account is kept safe.</p>
        </div>
      </header>
      <div className="admin-settings">
        <NotificationSettings />
        {/* An administrator's account is the one most worth protecting. */}
        <TwoStepSetting />
        <SessionsSetting />
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
          {/* The logo is the way back to the shop, as on every other page. */}
          <div className="admin-brand">
            <Link to="/" className="admin-brand-link" aria-label="BookStoreBD home" title="Back to the shop">
              <Logo inverted size={34} />
            </Link>
            <h2>Admin Panel</h2>
          </div>
          <div className="admin-sidebar-actions">
            <ThemeToggle className="admin-side-button admin-theme-toggle" withLabel />
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
          <ThemeToggle className="admin-side-button admin-theme-toggle" withLabel />
          <button type="button" className="admin-side-button is-danger" onClick={handleSignOut}>
            <FaSignOutAlt aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </aside>
      <main className="admin-main">
        <Routes>
          {/* The panel opens on how the shop is doing. */}
          <Route index element={<Navigate to="/admin/analytics" replace />} />
          <Route path="/analytics" element={<ShopAnalytics />} />
          <Route path="/users" element={<UserManagement />} />
          <Route path="/transactions" element={<TransactionHistory />} />
          <Route path="/books" element={<BookList />} />
          <Route path="/returns" element={<ReturnManagement />} />
          <Route path="/payouts" element={<SellerPayouts />} />
          <Route path="/all-reviews" element={<AllReviews />} />
          <Route path="/reviews" element={<ReviewModeration />} />
          <Route path="/messages" element={<AdminMessages />} />
          <Route path="/settings" element={<AdminSettings />} />
        </Routes>
      </main>
    </div>
  );
}
