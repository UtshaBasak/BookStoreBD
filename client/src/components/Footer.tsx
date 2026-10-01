import { Link } from 'react-router-dom';

import { site } from '../config/site.js';
import Logo from './Logo.js';
import { useTheme } from '../utils/theme.js';
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
        <p>{site.tagline}</p>
        <div className="footer-controls">
          <button
            type="button"
            className="footer-pill"
            onClick={() => setTheme(resolved === 'dark' ? 'light' : 'dark')}
            aria-label={`Switch to ${resolved === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span aria-hidden="true">{resolved === 'dark' ? '☀️' : '🌙'}</span>
            {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
        </div>
      </div>

      <div className="footer-section">
        <h2>About us</h2>
        <ul>
          <li>
            <Link to="/about">Who we are</Link>
          </li>
          <li>
            <Link to="/how-it-works">How BookStoreBD works</Link>
          </li>
          <li>
            <Link to="/wanted">Wanted board</Link>
          </li>
          <li>
            <Link to="/contact">Contact us</Link>
          </li>
        </ul>
      </div>

      <div className="footer-section">
        <h2>Policies</h2>
        <ul>
          <li>
            <Link to="/privacy">Privacy policy</Link>
          </li>
          <li>
            <Link to="/terms">Terms of service</Link>
          </li>
          <li>
            <Link to="/returns">Returns and refunds</Link>
          </li>
        </ul>
      </div>

      <div className="footer-section">
        <h2>Get in touch</h2>
        <ul>
          <li>
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </li>
          <li>
            <Link to="/contact">Contact page</Link>
          </li>
          <li>{site.location}</li>
        </ul>
      </div>

      {/* The name of the person running the shop lives on the About and
          policy pages, where it is needed; the footer carries the shop. */}
      <div className="footer-legal">
        <p>© {new Date().getFullYear()} {site.name}. All rights reserved.</p>
        <ul className="footer-trust" aria-label="Why shop here">
          <li>🔒 Secure checkout</li>
          <li>💵 {site.payment}</li>
          <li>↩️ {site.returns.windowDays}-day returns</li>
        </ul>
        <p>
          Made with <span aria-label="love">💜</span> for readers in Bangladesh <span aria-hidden="true">🇧🇩</span>
        </p>
      </div>
    </footer>
  );
}
