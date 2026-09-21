import { site } from '../../config/site.js';
import LegalPage from './LegalPage.js';

/**
 * Describes the return flow the application actually implements: a three-day
 * window from the order date, a request carrying a defect description, and an
 * administrator decision of approved or rejected.
 */
export default function Returns() {
  return (
    <LegalPage
      title="Returns and refunds"
      intro="When a book can be sent back, and how to do it."
      updated={site.policiesUpdated}
    >
      <h2>The window</h2>
      <p>You can request a return within <strong>three days</strong> of placing
        the order. After that the option is no longer offered on your orders
        page.</p>

      <h2>What qualifies</h2>
      <p>Second-hand books are sold in the condition the seller describes, so
        ordinary wear consistent with the stated condition is not a fault. A
        return is appropriate when:</p>
      <ul>
        <li>the book is damaged beyond the condition described;</li>
        <li>pages are missing, or the copy is incomplete;</li>
        <li>the wrong title, edition or format arrived;</li>
        <li>the book never arrived.</li>
      </ul>

      <h2>How to request one</h2>
      <ul>
        <li>Open <strong>My orders</strong> from your profile.</li>
        <li>Choose <strong>Return</strong> on the book in question.</li>
        <li>Describe the problem. Photographs help and make a decision faster.</li>
      </ul>
      <p>Your request is marked <em>pending</em> until it is reviewed, and then
        <em> approved</em> or <em>rejected</em>. You can see the status on the
        same page.</p>

      <h2>Refunds</h2>
      <p>Orders are currently paid cash on delivery. An approved return is
        refunded by the arrangement agreed with you when it is approved. Delivery
        charges are refunded when the fault was ours or the seller's, and not
        when a book is returned for another reason.</p>

      <h2>If a decision seems wrong</h2>
      <p>Reply to us at <a href={`mailto:${site.email}`}>{site.email}</a> with
        the order number and we will look at it again within {site.responseTime}.</p>
    </LegalPage>
  );
}
