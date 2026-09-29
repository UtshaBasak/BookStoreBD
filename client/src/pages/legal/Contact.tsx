import { Link } from 'react-router-dom';

import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

export default function Contact() {
  return (
    <LegalPage
      title="Contact us"
      intro={`${site.name} is run by ${site.owner} in ${site.location}. E-mail is the way to reach us.`}
    >
      <h2>By e-mail</h2>
      <p>
        <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
      <p>Anything to do with an order, include the order number - it is on your
        orders page and in the order's tracking link - and we can look it up
        straight away.</p>

      <h2>About a specific book</h2>
      <p>If the question is about a listing, message the seller directly from the
        book's page - they will know the condition of their copy better than we
        will. Anything that cannot be settled that way, bring to us.</p>

      <h2>Before you write</h2>
      <ul>
        <li>Delivery times and charges: see the <Link to="/terms#delivery">terms of service</Link>.</li>
        <li>Sending a book back: see <Link to="/returns">returns and refunds</Link>.</li>
        <li>Your data: see the <Link to="/privacy">privacy policy</Link>.</li>
      </ul>
    </LegalPage>
  );
}
