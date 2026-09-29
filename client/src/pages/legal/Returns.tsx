import { Link } from 'react-router-dom';

import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

const { returns } = site;

/**
 * Describes the return flow the application actually implements: a window
 * that opens on delivery, a request naming the order line with a description
 * and a bKash number, and an administrator's decision. The API enforces the
 * window, so what this page promises is what the server allows.
 */
export default function Returns() {
  return (
    <LegalPage
      title="Returns and refunds"
      intro="When a book can be sent back, and how you are refunded."
      updated={site.policiesUpdated}
    >
      <h2>The window</h2>
      <p>You can ask for a return within <strong>{returns.windowDays} days of
        delivery</strong>. The days count from when the order is marked
        delivered, not from when you placed it, so a parcel that takes longer to
        reach you does not cost you any of them. Your orders page shows the last
        day for each book.</p>

      <h2>What qualifies</h2>
      <p>Second-hand books are sold in the condition the seller describes, so
        ordinary wear consistent with the stated condition is not a fault. A
        return is appropriate when:</p>
      <ul>
        <li>the book is damaged beyond the condition described;</li>
        <li>pages are missing, or the copy is incomplete;</li>
        <li>the wrong title, edition or format arrived.</li>
      </ul>
      <p>If your order has not arrived at all, that is not a return: e-mail us
        at <a href={`mailto:${site.email}`}>{site.email}</a> with the order
        number and we will chase it.</p>

      <h2>How to ask for one</h2>
      <ul>
        <li>Open <strong>My orders</strong> from your profile.</li>
        <li>Choose <strong>Return</strong> on the book in question.</li>
        <li>Describe the problem, and add photographs if you can - they make a
          decision faster.</li>
        <li>Give the bKash number the refund should go to.</li>
      </ul>
      <p>Your request is marked <em>pending</em> until it is reviewed, and then
        <em> approved</em> or <em>rejected</em>. You can see the status on the
        same page.</p>

      <h2>Sending the book back</h2>
      <p>When a return is approved, we e-mail you the address of our office in
        Dhaka. Send the book there by courier. <strong>We pay the courier charge
        for sending it back.</strong></p>

      <h2>Refunds</h2>
      <p>We refund the price you paid for the book to the bKash number you gave,
        within <strong>{returns.refundWorkingDays} working days of the book
        reaching us</strong>.</p>
      <p>The delivery charge you paid on the original order is not refunded.</p>

      <h2>If a decision seems wrong</h2>
      <p>E-mail us at <a href={`mailto:${site.email}`}>{site.email}</a> with
        the order number and we will look at it again.</p>

      <p>See also the <Link to="/terms">terms of service</Link>.</p>
    </LegalPage>
  );
}
