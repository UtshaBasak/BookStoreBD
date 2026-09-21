import { Link } from 'react-router-dom';

import { site } from '../config/site.js';
import './Footer.css';

/**
 * The site footer.
 *
 * Every entry here used to be a plain `<li>` with `cursor: pointer` and nothing
 * behind it - the page advertised a privacy policy, a returns policy and
 * contact details that did not exist. For a shop handling delivery addresses
 * and phone numbers that is worse than having no footer, so each one is now a
 * real route with real content.
 */
export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-section">
        <h4>About us</h4>
        <ul>
          <li>
            <Link to="/about">Who we are</Link>
          </li>
          <li>
            <Link to="/about#how-it-works">How buying and selling works</Link>
          </li>
          <li>
            <Link to="/contact">Contact us</Link>
          </li>
        </ul>
      </div>

      <div className="footer-section">
        <h4>Policies</h4>
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
        <h4>Get in touch</h4>
        <ul>
          <li>
            <a href={`mailto:${site.email}`}>{site.email}</a>
          </li>
          <li>
            <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a>
          </li>
          <li>
            {site.address.line1}, {site.address.city}, {site.address.country}
          </li>
        </ul>
      </div>

      <p className="footer-legal">
        © {new Date().getFullYear()} {site.name}. Prices include VAT where applicable.
      </p>
    </footer>
  );
}
