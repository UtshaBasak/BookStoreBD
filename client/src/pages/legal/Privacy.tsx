import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

/**
 * Describes what the application actually does with personal data - the fields
 * the models store, the one cookie that is set, and the third parties involved.
 * Written from the code rather than from a template, so it can be checked.
 */
export default function Privacy() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`How ${site.name} handles your personal information.`}
      updated={site.policiesUpdated}
    >
      <p>
        This policy describes what we collect, why, and what you can ask us to do
        about it. It reflects how the service actually works rather than a
        generic template.
      </p>

      <h2>What we collect</h2>
      <p>When you create an account we store your username, e-mail address and a
        hashed version of your password. We never store the password itself — it
        is put through bcrypt and cannot be read back, by us or by anyone who
        obtained a copy of the database.</p>
      <ul>
        <li>Optional profile details you choose to add: phone number, delivery
          address, date of birth, gender and a profile picture.</li>
        <li>Orders you place, including the delivery address, contact name and
          phone number for that order.</li>
        <li>Listings you create as a seller, including the photographs you
          upload.</li>
        <li>Messages and images you exchange with other users through the chat.</li>
        <li>Standard technical data in our server logs: the request path, status,
          timestamp and IP address. Authorisation headers, cookies, passwords and
          one-time codes are removed before anything is written to a log.</li>
      </ul>

      <h2>Cookies</h2>
      <p>We set exactly one cookie, and it is not for tracking. It holds your
        session so you stay signed in, is marked <code>httpOnly</code> so page
        scripts cannot read it, is limited to the sign-in routes, and expires
        after 30 days. We use no advertising or analytics cookies.</p>
      <p>Your browser also keeps a short-lived access token in local storage so
        the app can identify you between page loads. Clearing your browser data
        signs you out.</p>

      <h2>Who else sees it</h2>
      <ul>
        <li><strong>Other users.</strong> A seller sees the delivery name,
          address and phone number for an order you place with them, because
          they have to post the book. Your handle and profile picture are visible
          on listings you create. Your address, phone number and date of birth
          are never shown to other buyers.</li>
        <li><strong>Cloudinary</strong> hosts uploaded book covers when image
          hosting is enabled.</li>
        <li><strong>Our e-mail provider</strong> delivers the one-time codes used
          for sign-up verification and password resets.</li>
        <li><strong>Sentry</strong>, if error reporting is enabled, receives
          technical details of server errors with credentials stripped out.</li>
      </ul>
      <p>We do not sell personal data, and we do not share it for advertising.</p>

      <h2>How long we keep it</h2>
      <p>Account and profile data is kept until you ask us to delete it. Orders
        are kept as business records. Chat messages are kept until either
        participant deletes the conversation.</p>

      <h2>Your rights</h2>
      <p>You can ask us for a copy of the data we hold about you, ask us to
        correct it, or ask us to delete your account. You can edit most of your
        profile yourself from the profile page. For a copy or a deletion, e-mail
        us at <a href={`mailto:${site.email}`}>{site.email}</a> and we will
        respond within {site.responseTime}.</p>
      <p>Deleting an account removes your profile and signs out every session.
        Records we are required to keep for accounting, such as completed orders,
        are retained with your personal details removed.</p>

      <h2>Security</h2>
      <p>Passwords are hashed with bcrypt. Sessions use short-lived tokens that
        are rotated on every use, and a reused token ends the session everywhere.
        Traffic is encrypted in transit. No system is perfectly secure, but if a
        breach ever affects your data we will tell you.</p>

      <h2>Children</h2>
      <p>This service is not intended for children under 13, and we do not
        knowingly collect their data.</p>

      <h2>Changes</h2>
      <p>If this policy changes materially we will say so on this page and update
        the date above.</p>

      <h2>Contact</h2>
      <p>Questions about this policy: <a href={`mailto:${site.email}`}>{site.email}</a>,
        or {site.address.line1}, {site.address.city}, {site.address.country}.</p>
    </LegalPage>
  );
}
