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
import { LanguageToggle } from '../components/LanguageToggle.js';
import NotificationSettings from '../components/NotificationSettings.js';
import TwoStepSetting from '../components/TwoStepSetting.js';
import SessionsSetting from '../components/SessionsSetting.js';
import { getUserEmail, isAdmin } from '../utils/auth.js';
import { useNotificationSettings, useProfile } from '../hooks/queries.js';
import { signOut } from '../config/api.js';
import { t } from '../utils/language.js';

interface Section {
  to: string;
  /** Worded when the sidebar is drawn, in the language shown then. */
  label: () => string;
  icon: IconType;
}

const SECTIONS: Section[] = [
  { to: '/admin/analytics', label: () => t('Shop Analytics', 'শপের পরিসংখ্যান'), icon: FaChartLine },
  { to: '/admin/users', label: () => t('User Management', 'ব্যবহারকারী ব্যবস্থাপনা'), icon: FaUsers },
  { to: '/admin/transactions', label: () => t('Transaction History', 'লেনদেনের ইতিহাস'), icon: FaReceipt },
  { to: '/admin/books', label: () => t('Book List', 'বইয়ের তালিকা'), icon: FaBook },
  { to: '/admin/returns', label: () => t('Return Management', 'রিটার্ন ব্যবস্থাপনা'), icon: FaUndoAlt },
  { to: '/admin/payouts', label: () => t('Seller Payouts', 'বিক্রেতার পেমেন্ট'), icon: FaMoneyBillWave },
  { to: '/admin/all-reviews', label: () => t('Reviews', 'রিভিউ'), icon: FaStar },
  { to: '/admin/reviews', label: () => t('Reported Reviews', 'রিপোর্ট করা রিভিউ'), icon: FaFlag },
  { to: '/admin/messages', label: () => t('Messages', 'বার্তা'), icon: FaPaperPlane },
  { to: '/admin/settings', label: () => t('Settings', 'সেটিংস'), icon: FaCog },
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
            {t('Settings', 'সেটিংস')}
          </h2>
          <p className="admin-lede">
            {t('What you hear about, and how your account is kept safe.', 'আপনি কী বিষয়ে খবর পান, আর আপনার অ্যাকাউন্ট কীভাবে নিরাপদ থাকে।')}
          </p>
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
            <Link
              to="/"
              className="admin-brand-link"
              aria-label={t('BookStoreBD home', 'BookStoreBD হোম')}
              title={t('Back to the shop', 'শপে ফিরে যান')}
            >
              <Logo inverted size={34} />
            </Link>
            <h2>{t('Admin Panel', 'অ্যাডমিন প্যানেল')}</h2>
          </div>
          <div className="admin-sidebar-actions">
            <LanguageToggle className="admin-side-button admin-language-toggle" withLabel />
            <ThemeToggle className="admin-side-button admin-theme-toggle" withLabel />
            <button type="button" className="admin-side-button is-danger" onClick={handleSignOut}>
              <FaSignOutAlt aria-hidden="true" />
              {t('Sign Out', 'সাইন আউট')}
            </button>
          </div>
        </div>

        <nav className="admin-nav" ref={navRef} aria-label={t('Admin sections', 'অ্যাডমিনের বিভাগ')}>
          <ul>
            {SECTIONS.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink to={to} className="admin-nav-link">
                  <Icon className="admin-nav-icon" aria-hidden="true" />
                  {label()}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="admin-sidebar-foot">
          <LanguageToggle className="admin-side-button admin-language-toggle" withLabel />
          <ThemeToggle className="admin-side-button admin-theme-toggle" withLabel />
          <button type="button" className="admin-side-button is-danger" onClick={handleSignOut}>
            <FaSignOutAlt aria-hidden="true" />
            {t('Sign Out', 'সাইন আউট')}
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
