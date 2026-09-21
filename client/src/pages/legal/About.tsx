import { Link } from 'react-router-dom';

import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

export default function About() {
  return (
    <LegalPage title={`About ${site.name}`} intro={site.tagline}>
      <p>{site.name} is a marketplace for new and second-hand books in
        Bangladesh. Anyone with an account can buy, and anyone with books to
        part with can list them.</p>

      <h2 id="how-it-works">How it works</h2>
      <p><strong>Buying.</strong> Browse or search the catalogue, filter by
        category, condition or price, and add what you want to your cart. At
        checkout you give a delivery address and a contact number. Payment is
        cash on delivery. You can follow the order through to delivery from your
        profile, and message the seller directly if something needs clarifying.</p>
      <p><strong>Selling.</strong> Add a listing with photographs, a description
        and an honest condition. You set the price and the stock count. When
        somebody orders, the stock is reserved immediately so the same copy
        cannot be sold twice, and you get the delivery details you need to post
        it.</p>

      <h2>Second-hand, described honestly</h2>
      <p>Most of the catalogue is used books, so condition matters more than it
        would in a new-book shop. Sellers state a condition and add details, and
        buyers can raise a return within three days if what arrived does not
        match. See the <Link to="/returns">returns policy</Link>.</p>

      <h2>Why it exists</h2>
      <p>Textbooks and novels tend to be read once and then sit on a shelf.
        Moving them to somebody who wants them is cheaper for the buyer, useful
        for the seller, and better than a landfill.</p>

      <h2>Talk to us</h2>
      <p>Questions, problems or ideas: <Link to="/contact">get in touch</Link>.</p>
    </LegalPage>
  );
}
