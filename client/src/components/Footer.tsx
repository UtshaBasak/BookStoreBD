import { Link } from 'react-router-dom';

import { site, siteLocation, sitePayment, siteTagline } from '../config/site.js';
import Logo from './Logo.js';
import { useTheme } from '../utils/theme.js';
import { openConsentSettings } from '../utils/consent.js';
import { LanguageToggle } from './LanguageToggle.js';
import { digits, pick, t } from '../utils/language.js';
import './Footer.css';

/**
 * The site footer. Every entry is a real link to a page with real content: a
 * shop that handles delivery addresses and phone numbers publishes its
 * privacy policy, returns policy and contact details.
 */
export default function Footer() {
  const { resolved, setTheme } = useTheme();
  return (
    <footer className="footer">
      <div className="footer-brand">
        <Logo size={34} inverted />
        <p>{siteTagline()}</p>
        <div className="footer-controls">
          <button
            type="button"
            className="footer-pill"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={
              resolved === 'dark'
                ? t('Switch to light mode', 'হালকা মোডে যান')
                : t('Switch to dark mode', 'গাঢ় মোডে যান')
            }
          >
            <span aria-hidden="true">{resolved === 'dark' ? '☀️' : '🌙'}</span>
            {resolved === 'dark' ? t('Light mode', 'হালকা মোড') : t('Dark mode', 'গাঢ় মোড')}
          </button>
          <LanguageToggle className="footer-pill" withLabel />
          <button type="button" className="footer-pill" onClick={openConsentSettings}>
            <span aria-hidden="true">🍪</span>
            {t('Cookie settings', 'কুকি সেটিংস')}
          </button>
        </div>
      </div>

      <div className="footer-section">
        <h2>{t('About us', 'আমাদের কথা')}</h2>
        <ul>
          <li>
            <Link to="/about">{t('Who we are', 'আমরা কারা')}</Link>
          </li>
          <li>
            <Link to="/how-it-works">{t('How BookStoreBD works', 'BookStoreBD কীভাবে কাজ করে')}</Link>
          </li>
          <li>
            <Link to="/wanted">{t('Wanted board', 'চাহিদার বোর্ড')}</Link>
          </li>
          <li>
            <Link to="/contact">{t('Contact us', 'যোগাযোগ করুন')}</Link>
          </li>
        </ul>
      </div>

      <div className="footer-section">
        <h2>{t('Policies', 'নীতিমালা')}</h2>
        <ul>
          <li>
            <Link to="/privacy">{t('Privacy policy', 'গোপনীয়তা নীতি')}</Link>
          </li>
          <li>
            <Link to="/terms">{t('Terms of service', 'সেবার শর্তাবলি')}</Link>
          </li>
          <li>
            <Link to="/returns">{t('Returns and refunds', 'রিটার্ন ও টাকা ফেরত')}</Link>
          </li>
        </ul>
      </div>

      <div className="footer-section">
        <h2>{t('Get in touch', 'যোগাযোগ')}</h2>
        <ul>
          <li>
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </li>
          <li>
            <Link to="/contact">{t('Contact page', 'যোগাযোগ পাতা')}</Link>
          </li>
          <li>{siteLocation()}</li>
        </ul>
      </div>

      {/* The name of the person running the shop lives on the About and
          policy pages, where it is needed; the footer carries the shop. */}
      <div className="footer-legal">
        <p>
          {t(
            `© ${new Date().getFullYear()} ${site.name}. All rights reserved.`,
            `© ${digits(new Date().getFullYear())} ${site.name}। সর্বস্বত্ব সংরক্ষিত।`
          )}
        </p>
        <ul className="footer-trust" aria-label={t('Why shop here', 'কেন এখানে কিনবেন')}>
          <li>🔒 {t('Secure checkout', 'নিরাপদ চেকআউট')}</li>
          <li>💵 {sitePayment()}</li>
          <li>
            ↩️{' '}
            {t(
              `${site.returns.windowDays}-day returns if not as described`,
              `বর্ণনার সঙ্গে না মিললে ${digits(site.returns.windowDays)} দিনে ফেরত`
            )}
          </li>
        </ul>
        <p>
          {pick(
            <>
              Made with <span aria-label="love">💜</span> for readers in Bangladesh
            </>,
            <>
              বাংলাদেশের পাঠকদের জন্য <span aria-label="ভালোবাসা">💜</span> দিয়ে তৈরি
            </>
          )}{' '}
          <span aria-hidden="true">🇧🇩</span>
        </p>
      </div>
    </footer>
  );
}
