import { site } from '../../config/site.js';
import { openConsentSettings } from '../../utils/consent.js';
import LegalPage from './LegalPage.js';

/**
 * Describes what the application actually does with personal data - the fields
 * the models store, the cookie and browser storage used, and the third parties
 * involved.
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
      <p>{site.name} is run by {site.owner}, {site.location}, who is
        responsible for the personal information described here.</p>

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
        <li>Return requests: what was wrong, any photographs you add, and the
          bKash number you give for the refund.</li>
        <li>Listings you create as a seller, including the photographs you
          upload, and the bKash merchant number your sales are paid to. Only you
          and we can see that number.</li>
        <li>Messages and images you exchange with other users through the chat.</li>
        <li>Reviews you write, which are public and carry the name on your
          account beside them.</li>
        <li>One-time codes sent for sign-up and password resets. They are stored
          only in a hashed form and are deleted once they expire.</li>
        <li>Standard technical data in our server logs: the request path, status,
          timestamp and IP address. Authorisation headers, cookies, passwords and
          one-time codes are removed before anything is written to a log.</li>
        <li>If a page breaks in your browser, and you allow error reports, a short
          report: what failed, the page address and your browser's name. It does
          not include what you typed or anything you were shown.</li>
        <li>Books you ask for on the Wanted board. Others see the book and how
          many people want it, never who.</li>
        <li>The e-mail addresses of friends you invite, so we can tell you when
          they join and do not invite the same person over and over.</li>
        <li>Which notifications and e-mails you have chosen to receive.</li>
        <li>What is searched for in the catalogue and how many books each search
          found, without who searched, for 90 days - to show popular searches
          and learn which books people cannot find.</li>
        <li>That a book was viewed, as a code that cannot be traced back to you,
          for a day, so each person counts once in the book's view count.</li>
      </ul>

      <h2 id="cookies">Cookies and storage</h2>
      <p>We use no advertising or analytics cookies, and we do not track you
        across other sites. What we keep in your browser is in four groups, and
        only the first is kept without your say-so:</p>
      <ul>
        <li><strong>Necessary</strong> (always on): one cookie holding your
          session, so you stay signed in - marked <code>httpOnly</code> so page
          scripts cannot read it, limited to the sign-in routes, and expiring
          after 30 days; your e-mail address and account type in local storage,
          so a reload knows you are signed in; a random
          code that lets us recognise this browser, so we can e-mail you when
          your account is signed in to from one we have not seen; the security
          check on sign-in and sign-up; and your choice about the rest.</li>
        <li><strong>Preferences</strong>: light or dark mode, your voice search
          language, how lists are sorted and sized, and your recent searches.</li>
        <li><strong>Personalisation</strong>: the books you viewed lately, for
          "Recently viewed" and "Top picks for you".</li>
        <li><strong>Error reports</strong>: a report sent to us when a page
          breaks, as described above.</li>
      </ul>
      <p>When you first visit, you choose: accept all, necessary only, or each
        group on its own. Turning a group off deletes what it kept. You can
        change your mind at any time.</p>
      <p>
        <button type="button" className="btn btn-ghost" onClick={openConsentSettings}>
          Change cookie settings
        </button>
      </p>

      <h2>Who else sees it</h2>
      <ul>
        <li><strong>Other users.</strong> A seller sees the delivery name,
          address and phone number for an order you place with them, because
          they have to get the book to you. Your handle and profile picture are
          visible on listings you create. Your address, phone number and date of
          birth are never shown to other buyers.</li>
        <li><strong>Our courier</strong> receives the delivery name, address and
          phone number for an order, and nothing else, so they can deliver it
          and collect the payment.</li>
        <li><strong>bKash</strong> receives the number a refund or a seller's
          payment is sent to, when we send it.</li>
        <li><strong>Cloudinary</strong> hosts the photographs of listings and of
          return requests, when image hosting is enabled.</li>
        <li><strong>Google (Gmail)</strong> delivers our e-mail, including the
          one-time codes used for sign-up verification and password resets.</li>
        <li><strong>Google sign-in</strong>, if you choose Continue with Google:
          Google tells us your name, e-mail address and profile picture, and that
          the address is verified. We never see your Google password.</li>
        <li><strong>Cloudflare Turnstile</strong> runs the security check on
          sign-in and sign-up, to tell people from bots. It looks at your
          browser, not at who you are, and we receive only a pass or a fail.</li>
        <li><strong>Sentry</strong>, if error reporting is enabled, receives
          technical details of errors, with credentials stripped out.</li>
      </ul>
      <p>We do not sell personal data, and we do not share it for advertising.</p>

      <h2>How long we keep it</h2>
      <p>Account and profile data is kept until you delete your account or ask
        us to. Orders and return requests are kept as business records. Chat
        messages are kept until either participant deletes the conversation.</p>

      <h2>Your rights</h2>
      <p>You do not have to ask us for any of this. On your profile page,
        under <strong>Your data</strong>, you can download everything this
        account holds as a single file, and you can delete the account outright.
        Both are immediate. You can also edit most of your profile there.</p>
      <p>If you would rather we did it, or you cannot sign in, e-mail us at{' '}
        <a href={`mailto:${site.email}`}>{site.email}</a>.</p>
      <p>Deleting an account removes your profile, your cart, your wishlist and
        any listings you posted, and signs out every session.</p>
      <p>Some things are kept rather than deleted, because they are not only
        yours. Orders and return requests stay as accounting records, with your
        name, phone number, address, e-mail and bKash number removed from them.
        Messages stay in the other person's conversation and reviews stay on the
        books they are about, both shown as coming from a deleted user - what
        was agreed is often the reason the other person still has the thread,
        and the next buyer's decision rests on the reviews.</p>

      <h2>Security</h2>
      <p>Passwords are hashed with bcrypt. Sessions use short-lived tokens that
        are rotated on every use, and a reused token ends the session everywhere.
        Traffic is encrypted in transit, and your phone number, address and bKash
        numbers are encrypted in the database as well, so a stolen copy of it
        would not reveal them.</p>
      <ul>
        <li>After five wrong passwords in a row, signing in to that address is
          paused for 15 minutes.</li>
        <li>Changing your password or bKash number needs your current password,
          and we e-mail you when either changes. A new password signs out every
          other device.</li>
        <li>We e-mail you when your account is signed in to from a new browser,
          and you can sign out everywhere else from your profile.</li>
        <li>You can turn on two-step sign-in, which also asks for a code sent to
          your e-mail.</li>
      </ul>
      <p>No system is perfectly secure, but if a breach ever affects your data
        we will tell you. To report a security problem, see our{' '}
        <a href="/.well-known/security.txt">security contact</a>.</p>

      <h2>Age</h2>
      <p>You must be {site.minimumAge} or older to use {site.name}, and we do not
        knowingly collect information about anyone younger.</p>

      <h2>Changes</h2>
      <p>If this policy changes materially we will say so on this page and update
        the date above.</p>

      <h2>Contact</h2>
      <p>Questions about this policy: <a href={`mailto:${site.email}`}>{site.email}</a>.</p>
    </LegalPage>
  );
}
