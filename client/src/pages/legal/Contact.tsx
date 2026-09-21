import { Link } from 'react-router-dom';

import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

export default function Contact() {
  return (
    <LegalPage
      title="Contact us"
      intro={`We aim to reply within ${site.responseTime}.`}
    >
      <h2>By e-mail</h2>
      <p>
        <a href={`mailto:${site.email}`}>{site.email}</a> — the fastest route for
        anything to do with an order. Include the order number if you have one.
      </p>

      <h2>By phone</h2>
      <p>
        <a href={`tel:${site.phone.replace(/\s/g, '')}`}>{site.phone}</a>
      </p>

      <h2>By post</h2>
      <p>
        {site.name}
        <br />
        {site.address.line1}
        <br />
        {site.address.city}
        <br />
        {site.address.country}
      </p>

      <h2>About a specific book</h2>
      <p>If the question is about a listing, message the seller directly from the
        book's page — they will know the condition of their copy better than we
        will. Anything that cannot be settled that way, bring to us.</p>

      <h2>Before you write</h2>
      <ul>
        <li>Sending a book back: see <Link to="/returns">returns and refunds</Link>.</li>
        <li>Your data: see the <Link to="/privacy">privacy policy</Link>.</li>
        <li>Rules of the marketplace: see the <Link to="/terms">terms of service</Link>.</li>
      </ul>
    </LegalPage>
  );
}
