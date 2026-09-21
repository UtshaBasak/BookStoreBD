import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

export default function Terms() {
  return (
    <LegalPage
      title="Terms of service"
      intro={`The rules for using ${site.name}.`}
      updated={site.policiesUpdated}
    >
      <p>By creating an account you agree to these terms. If you do not agree,
        please do not use the service.</p>

      <h2>Your account</h2>
      <ul>
        <li>You need a verified e-mail address, and you are responsible for what
          happens under your account.</li>
        <li>Use a password you do not use elsewhere, and tell us promptly if you
          think someone else has access.</li>
        <li>One person, one account. Do not impersonate anyone.</li>
      </ul>

      <h2>Buying</h2>
      <p>A listing is an offer by the seller, not by us. When you place an order
        the contract is between you and that seller; we provide the marketplace,
        take the order and pass on your delivery details so the book can be sent.
        Stock is reserved when you order, so a title can sell out while you are
        checking out.</p>

      <h2>Selling</h2>
      <ul>
        <li>List only books you own and are entitled to sell.</li>
        <li>Describe condition honestly. "Good" and "Fair" mean what a reasonable
          buyer would expect them to mean.</li>
        <li>Use your own photographs of the actual copy.</li>
        <li>Keep your stock counts current, and dispatch promptly once an order
          is placed.</li>
      </ul>

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
      <p>We are responsible for running the marketplace. We are not a party to
        the sale itself and cannot guarantee the condition of a book another user
        ships. Nothing here limits liability that cannot be limited by law.</p>

      <h2>Ending your account</h2>
      <p>You can ask us to close your account at any time by e-mailing
        <a href={`mailto:${site.email}`}> {site.email}</a>. We may suspend an
        account that breaks these terms.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of Bangladesh.</p>
    </LegalPage>
  );
}
