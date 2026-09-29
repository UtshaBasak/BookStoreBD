import { Link } from 'react-router-dom';

import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

const { delivery } = site;

export default function Terms() {
  return (
    <LegalPage
      title="Terms of service"
      intro={`The rules for using ${site.name}.`}
      updated={site.policiesUpdated}
    >
      <p>{site.name} is run by {site.owner}, {site.location}. In these terms
        "we" and "us" mean {site.owner} running {site.name}; "you" means the
        person using it.</p>
      <p>By creating an account you agree to these terms. If you do not agree,
        please do not use the service.</p>

      <h2>Your account</h2>
      <ul>
        <li>You must be {site.minimumAge} or older to hold an account.</li>
        <li>You need a verified e-mail address, and you are responsible for what
          happens under your account.</li>
        <li>Use a password you do not use elsewhere, and tell us promptly if you
          think someone else has access.</li>
        <li>One person, one account. Do not impersonate anyone.</li>
      </ul>

      <h2>Buying</h2>
      <p>A listing is an offer by the seller. We run the marketplace: we take the
        order, arrange delivery, collect the payment and handle returns. Stock is
        reserved when you order, so a title can sell out while you are checking
        out. If that happens, checkout tells you which book it was, and you are
        not charged for it.</p>
      <p>Payment is <strong>{site.payment.toLowerCase()}</strong>: you pay the
        courier when the parcel arrives. The price you pay is the one shown at
        checkout, delivery included.</p>

      <h2 id="delivery">Delivery</h2>
      <p>Orders are sent by courier.</p>
      <ul>
        <li><strong>Inside Dhaka</strong> (Dhaka district): {delivery.insideDhaka} Tk,
          delivered within {delivery.daysInsideDhaka} working days.</li>
        <li><strong>Outside Dhaka</strong>: {delivery.outsideDhaka} Tk, delivered
          within {delivery.daysOutsideDhaka} working days.</li>
        <li>Orders whose books come to {delivery.freeFrom} Tk or more are
          delivered free.</li>
      </ul>
      <p>The charge is worked out from the district in your delivery address and
        shown at checkout before you place the order. If an order has not
        arrived within those times, e-mail us with the order number.</p>

      <h2>Selling</h2>
      <p>Listing a book is free. When a book sells, we keep a fee of
        <strong> {site.sellerFeePercent}%</strong> of the order's book total -
        the price times the quantity, not counting delivery - and the rest is
        yours. Your orders page shows the fee and what you receive for each
        order.</p>

      <h2 id="getting-paid">Getting paid</h2>
      <p>Before you list a book, add your <strong>bKash merchant number</strong> to
        your profile. We pay what you are owed for an order to that number once
        the buyer's {site.returns.windowDays}-day return window has closed and no
        return is pending - so money is never sent and then taken back. A book
        that is returned is not paid for, and no fee is taken on it.</p>
      <p>Your orders page shows where each payment stands, and the bKash
        transaction ID once it has been sent.</p>
      <ul>
        <li>List only books you own and are entitled to sell.</li>
        <li>Describe condition honestly. "Good" and "Fair" mean what a reasonable
          buyer would expect them to mean.</li>
        <li>Use your own photographs of the actual copy.</li>
        <li>Keep your stock counts current, and have a book ready to go promptly
          once it is ordered.</li>
      </ul>

      <h2>Returns</h2>
      <p>A buyer can ask to return a book within {site.returns.windowDays} days
        of delivery. How that works, and how refunds are paid, is set out in
        the <Link to="/returns">returns and refunds policy</Link>.</p>

      <h2>What you may not do</h2>
      <ul>
        <li>List counterfeit or pirated copies, or anything you may not legally
          sell.</li>
        <li>Post unlawful, abusive or misleading content, including in chat.</li>
        <li>Attempt to gain access to other accounts or to disrupt the service.</li>
        <li>Scrape the catalogue or use it to build a competing listing service.</li>
      </ul>

      <h2>Content you post</h2>
      <p>You keep ownership of your listings, photographs and messages. You give
        us permission to display them on the service so the marketplace can work.
        We may remove content that breaks these terms.</p>

      <h2>Availability</h2>
      <p>We aim to keep the service running but do not guarantee it will be
        uninterrupted. Features may change.</p>

      <h2>Liability</h2>
      <p>We are responsible for running the marketplace, delivering orders and
        handling returns as these terms describe. A book's description is the
        seller's; if it arrives not as described, the returns policy is the
        remedy. Nothing here limits liability that cannot be limited by law.</p>

      <h2>Ending your account</h2>
      <p>You can delete your account yourself, under <strong>Your
        data</strong> on your profile page, or ask us to by e-mailing
        <a href={`mailto:${site.email}`}> {site.email}</a>. We may suspend an
        account that breaks these terms.</p>

      <h2>Changes</h2>
      <p>If these terms change materially we will say so on this page and update
        the date above.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Bangladesh.</p>
    </LegalPage>
  );
}
