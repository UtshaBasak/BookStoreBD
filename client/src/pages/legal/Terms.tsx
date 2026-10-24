import { Link } from 'react-router-dom';

import { promotionDescription, site, siteLocation, sitePayment, sitePoliciesUpdated } from '../../config/site.js';
import { formatNumber, pick, t } from '../../utils/language.js';
import LegalPage from './LegalPage.js';

const { delivery } = site;
const { firstOrder, freeDelivery } = site.promotions;

export default function Terms() {
  const n = formatNumber;
  const location = siteLocation();
  return (
    <LegalPage
      title={t('Terms of service', 'সেবার শর্তাবলি')}
      intro={t(`The rules for using ${site.name}.`, `${site.name} ব্যবহারের নিয়মকানুন।`)}
      updated={sitePoliciesUpdated()}
    >
      <p>
        {pick(
          <>{site.name} is run by {site.owner}, {location}. In these terms
            "we" and "us" mean {site.owner} running {site.name}; "you" means the
            person using it.</>,
          <>{site.name} পরিচালনা করেন {site.owner}, {location}। এই শর্তাবলিতে "আমরা" ও "আমাদের" বলতে
            {' '}{site.name} পরিচালনাকারী হিসেবে {site.owner}-কে বোঝায়; "আপনি" বলতে যিনি এটি ব্যবহার করছেন
            তাঁকে বোঝায়।</>
        )}
      </p>
      <p>
        {pick(
          <>By creating an account you agree to these terms. If you do not agree,
            please do not use the service.</>,
          <>অ্যাকাউন্ট খোলার মাধ্যমে আপনি এই শর্তাবলিতে সম্মতি দিচ্ছেন। আপনি সম্মত না হলে অনুগ্রহ করে সেবাটি
            ব্যবহার করবেন না।</>
        )}
      </p>

      <h2>{t('Your account', 'আপনার অ্যাকাউন্ট')}</h2>
      <ul>
        <li>
          {pick(
            <>You must be {site.minimumAge} or older to hold an account.</>,
            <>অ্যাকাউন্ট রাখতে আপনার বয়স {n(site.minimumAge)} বছর বা তার বেশি হতে হবে।</>
          )}
        </li>
        <li>
          {pick(
            <>You need a verified e-mail address, and you are responsible for what
              happens under your account.</>,
            <>আপনার একটি যাচাই করা ই-মেইল ঠিকানা থাকতে হবে, এবং আপনার অ্যাকাউন্টে যা ঘটে তার দায় আপনার।</>
          )}
        </li>
        <li>
          {pick(
            <>Use a password you do not use elsewhere, and tell us promptly if you
              think someone else has access.</>,
            <>এমন পাসওয়ার্ড ব্যবহার করুন যা অন্য কোথাও ব্যবহার করেন না, এবং অন্য কেউ আপনার অ্যাকাউন্টে ঢুকতে
              পারছে বলে মনে হলে দ্রুত আমাদের জানান।</>
          )}
        </li>
        <li>
          {pick(
            <>One person, one account. Do not impersonate anyone.</>,
            <>একজনের একটিই অ্যাকাউন্ট। অন্য কারও পরিচয় ধারণ করবেন না।</>
          )}
        </li>
      </ul>

      <h2>{t('Buying', 'কেনা')}</h2>
      <p>
        {pick(
          <>A listing is an offer by the seller. We run the marketplace: we take the
            order, arrange delivery, collect the payment and handle returns. Stock is
            reserved when you order, so a title can sell out while you are checking
            out. If that happens, checkout tells you which book it was, and you are
            not charged for it. If fewer copies are left than you asked for, your
            order gets the copies there are, and checkout says so.</>,
          <>একটি লিস্টিং হলো বিক্রেতার দেওয়া প্রস্তাব। মার্কেটপ্লেসটি আমরা চালাই: আমরা অর্ডার নিই, ডেলিভারির
            ব্যবস্থা করি, টাকা সংগ্রহ করি এবং রিটার্ন সামলাই। অর্ডার দেওয়ার সময় স্টক সংরক্ষিত হয়, তাই আপনি
            চেকআউট করার মাঝেই কোনো বই বিক্রি শেষ হয়ে যেতে পারে। এমন হলে চেকআউট আপনাকে জানিয়ে দেয় কোন বইটি,
            এবং সেটির জন্য আপনার কাছ থেকে টাকা নেওয়া হয় না। আপনি যত কপি চেয়েছেন তার চেয়ে কম থাকলে, যত কপি আছে
            ততগুলোই আপনার অর্ডারে যায়, এবং চেকআউট তা জানিয়ে দেয়।</>
        )}
      </p>
      <p>
        {pick(
          <>Payment is <strong>{site.payment.toLowerCase()}</strong>: you pay the
            courier when the parcel arrives. The price you pay is the one shown at
            checkout, delivery included.</>,
          <>পেমেন্ট <strong>{sitePayment()}</strong>: পার্সেল পৌঁছালে আপনি কুরিয়ারকে টাকা দেন। আপনি যে দাম
            দেবেন তা চেকআউটে দেখানো দামই, ডেলিভারি চার্জসহ।</>
        )}
      </p>
      <p>{t('Sellers cannot buy their own books.', 'বিক্রেতা নিজের বই কিনতে পারেন না।')}</p>

      <h2 id="cancelling">{t('Cancelling an order', 'অর্ডার বাতিল করা')}</h2>
      <ul>
        <li>
          {pick(
            <>You can cancel an order from your orders page while it is still
              "Order Confirmed", before any seller in it has started preparing it.
              After that, message the seller, or ask for a return once it arrives.</>,
            <>অর্ডারটি যতক্ষণ "অর্ডার নিশ্চিত" অবস্থায় থাকে, অর্থাৎ এর কোনো বিক্রেতা প্রস্তুত করা শুরু করার
              আগে, ততক্ষণ আপনার অর্ডারের পাতা থেকে আপনি তা বাতিল করতে পারেন। এরপর বিক্রেতাকে মেসেজ দিন, অথবা
              অর্ডার পৌঁছালে রিটার্নের অনুরোধ করুন।</>
          )}
        </li>
        <li>
          {pick(
            <>A seller can cancel their books in an order until they ship them,
              and we can cancel an order until it is delivered.</>,
            <>একজন বিক্রেতা কোনো অর্ডারে থাকা তাঁর বই পাঠানোর আগ পর্যন্ত বাতিল করতে পারেন, আর আমরা একটি
              অর্ডার ডেলিভারি হওয়ার আগ পর্যন্ত বাতিল করতে পারি।</>
          )}
        </li>
        <li>
          {pick(
            <>When a seller cancels part of an order, you pay only for the books
              left. A promo discount never comes to more than those books, and free
              delivery stays free.</>,
            <>কোনো বিক্রেতা অর্ডারের একটি অংশ বাতিল করলে আপনি শুধু বাকি বইগুলোর দাম দেন। প্রোমো ছাড় কখনো ওই
              বইগুলোর দামের চেয়ে বেশি হয় না, এবং ফ্রি ডেলিভারি ফ্রি-ই থাকে।</>
          )}
        </li>
      </ul>

      <h2 id="delivery">{t('Delivery', 'ডেলিভারি')}</h2>
      <p>{t('Orders are sent by courier.', 'অর্ডার কুরিয়ারে পাঠানো হয়।')}</p>
      <ul>
        <li>
          {pick(
            <><strong>Inside Dhaka</strong> (Dhaka district): {delivery.insideDhaka} Tk,
              delivered within {delivery.daysInsideDhaka} working days.</>,
            <><strong>ঢাকার ভেতরে</strong> (ঢাকা জেলা): {n(delivery.insideDhaka)} টাকা,{' '}
              {n(delivery.daysInsideDhaka)} কর্মদিবসের মধ্যে ডেলিভারি।</>
          )}
        </li>
        <li>
          {pick(
            <><strong>Outside Dhaka</strong>: {delivery.outsideDhaka} Tk, delivered
              within {delivery.daysOutsideDhaka} working days.</>,
            <><strong>ঢাকার বাইরে</strong>: {n(delivery.outsideDhaka)} টাকা, {n(delivery.daysOutsideDhaka)}{' '}
              কর্মদিবসের মধ্যে ডেলিভারি।</>
          )}
        </li>
        <li>
          {pick(
            <>Orders whose books come to {freeDelivery.minBooksTotal} Tk or more are
              delivered free with the promo code <strong>{freeDelivery.code}</strong>.</>,
            <>যে অর্ডারে বইয়ের মোট দাম {n(freeDelivery.minBooksTotal)} টাকা বা তার বেশি, প্রোমো কোড{' '}
              <strong>{freeDelivery.code}</strong> দিলে সেটি ফ্রি ডেলিভারি পায়।</>
          )}
        </li>
      </ul>
      <p>
        {pick(
          <>The charge is worked out from the district in your delivery address and
            shown at checkout before you place the order. If an order has not
            arrived within those times, e-mail us with the order number.</>,
          <>চার্জ ঠিক হয় আপনার ডেলিভারির ঠিকানার জেলা অনুযায়ী, এবং অর্ডার দেওয়ার আগেই চেকআউটে দেখানো হয়।
            ওই সময়ের মধ্যে কোনো অর্ডার না পৌঁছালে অর্ডার নম্বরসহ আমাদের ই-মেইল করুন।</>
        )}
      </p>

      <h2 id="promo-codes">{t('Promo codes', 'প্রোমো কোড')}</h2>
      <p>
        {pick(
          <>A promo code is entered at checkout, one per order, and its discount is
            shown before you confirm. A code whose conditions an order does not
            meet is refused with the reason, so you are never charged a price you
            did not see.</>,
          <>প্রোমো কোড চেকআউটে দিতে হয়, প্রতি অর্ডারে একটি, এবং নিশ্চিত করার আগেই তার ছাড় দেখানো হয়। কোনো
            অর্ডার কোডের শর্ত পূরণ না করলে কারণসহ কোডটি গ্রহণ করা হয় না, তাই আপনি না দেখা কোনো দাম আপনার
            কাছ থেকে কখনো নেওয়া হয় না।</>
        )}
      </p>
      <ul>
        <li>
          <strong>{firstOrder.code}</strong>:{' '}
          {promotionDescription(firstOrder)}
          {t('.', '।')}
        </li>
        <li>
          <strong>{freeDelivery.code}</strong>:{' '}
          {promotionDescription(freeDelivery)}
          {t('.', '।')}
        </li>
      </ul>

      <h2>{t('Selling', 'বিক্রি')}</h2>
      <p>
        {pick(
          <>Listing a book is free. When a book sells, we keep a fee of
            <strong> {site.sellerFeePercent}%</strong> of the order's book total -
            the price times the quantity, not counting delivery - and the rest is
            yours. Your orders page shows the fee and what you receive for each
            order.</>,
          <>বই তালিকাভুক্ত করতে কোনো খরচ নেই। বই বিক্রি হলে আমরা অর্ডারের বইয়ের মোট দামের
            <strong> {n(site.sellerFeePercent)}%</strong> ফি হিসেবে রাখি — দাম গুণ পরিমাণ, ডেলিভারি চার্জ বাদে
            — আর বাকিটা আপনার। আপনার অর্ডারের পাতায় প্রতিটি অর্ডারের ফি এবং আপনি কত পাবেন তা দেখানো থাকে।</>
        )}
      </p>

      <h2 id="getting-paid">{t('Getting paid', 'টাকা পাওয়া')}</h2>
      <p>
        {pick(
          <>Before you list a book, add your <strong>bKash merchant number</strong> to
            your profile. We pay what you are owed for an order to that number once
            the buyer's {site.returns.windowDays}-day return window has closed and no
            return is pending - so money is never sent and then taken back. A book
            that is returned is not paid for, and no fee is taken on it.</>,
          <>বই তালিকাভুক্ত করার আগে আপনার প্রোফাইলে আপনার <strong>বিকাশ মার্চেন্ট নম্বর</strong> যোগ করুন।
            ক্রেতার {n(site.returns.windowDays)} দিনের ফেরতের সময়সীমা শেষ হলে এবং কোনো রিটার্ন অপেক্ষায় না থাকলে
            একটি অর্ডারের জন্য আপনার পাওনা আমরা ওই নম্বরে পাঠাই — যাতে টাকা পাঠিয়ে আবার ফেরত নিতে না হয়। ফেরত
            আসা বইয়ের জন্য টাকা দেওয়া হয় না, এবং তার ওপর কোনো ফিও নেওয়া হয় না।</>
        )}
      </p>
      <p>
        {pick(
          <>Your orders page shows where each payment stands, and the bKash
            transaction ID once it has been sent. You can change the number at any
            time; you can remove it once none of your books are on sale and nothing
            is still to be paid to it.</>,
          <>আপনার অর্ডারের পাতায় প্রতিটি পেমেন্টের অবস্থা দেখা যায়, এবং টাকা পাঠানো হলে বিকাশের ট্রানজ্যাকশন
            আইডিও। নম্বরটি যেকোনো সময় বদলাতে পারেন; আপনার কোনো বই বিক্রির জন্য না থাকলে এবং ওই নম্বরে আর কোনো
            টাকা পাঠানো বাকি না থাকলে নম্বরটি সরিয়েও ফেলতে পারেন।</>
        )}
      </p>
      <ul>
        <li>
          {pick(
            <>List only books you own and are entitled to sell.</>,
            <>শুধু সেই বই তালিকাভুক্ত করুন যা আপনার নিজের এবং যা বিক্রির অধিকার আপনার আছে।</>
          )}
        </li>
        <li>
          {pick(
            <>Describe condition honestly. "Good" and "Fair" mean what a reasonable
              buyer would expect them to mean.</>,
            <>বইয়ের অবস্থা সৎভাবে বর্ণনা করুন। "ভালো" ও "মোটামুটি" বলতে একজন সাধারণ বিবেচনাবান ক্রেতা যা
              আশা করবেন, তা-ই বোঝায়।</>
          )}
        </li>
        <li>
          {pick(
            <>Use your own photographs of the actual copy.</>,
            <>যে কপিটি বিক্রি করছেন, সেটিরই নিজের তোলা ছবি দিন।</>
          )}
        </li>
        <li>
          {pick(
            <>Keep your stock counts current, and have a book ready to go promptly
              once it is ordered.</>,
            <>স্টকের সংখ্যা হালনাগাদ রাখুন, এবং অর্ডার এলে দ্রুত পাঠানোর জন্য বই প্রস্তুত রাখুন।</>
          )}
        </li>
        <li>
          {pick(
            <>Move an order forward as you prepare and ship it - Order Confirmed,
              Processing, Shipped. Out for Delivery and Delivered are set by us. If a
              status needs correcting, message us.</>,
            <>অর্ডার প্রস্তুত করে পাঠানোর সঙ্গে সঙ্গে তার অবস্থা এগিয়ে দিন — অর্ডার নিশ্চিত, প্রস্তুত হচ্ছে,
              পাঠানো হয়েছে। ডেলিভারির পথে ও ডেলিভারি হয়েছে — এই দুটি আমরা ঠিক করি। কোনো অবস্থা সংশোধন করতে
              হলে আমাদের মেসেজ দিন।</>
          )}
        </li>
      </ul>

      <h2>{t('Returns', 'রিটার্ন')}</h2>
      <p>
        {pick(
          <>A buyer can ask to return a book within {site.returns.windowDays} days
            of delivery. How that works, and how refunds are paid, is set out in
            the <Link to="/returns">returns and refunds policy</Link>.</>,
          <>ক্রেতা ডেলিভারির {n(site.returns.windowDays)} দিনের মধ্যে বই ফেরতের অনুরোধ করতে পারেন। এটি কীভাবে
            কাজ করে এবং টাকা কীভাবে ফেরত দেওয়া হয়, তা <Link to="/returns">রিটার্ন ও টাকা ফেরতের নীতিতে</Link>{' '}
            বলা আছে।</>
        )}
      </p>

      <h2 id="reviews">{t('Reviews and ratings', 'রিভিউ ও রেটিং')}</h2>
      <p>
        {pick(
          <>You can review a book, and rate the seller you bought it from, once your
            order has been delivered. If an order is cancelled, a review or rating
            it was the only purchase behind is removed. You cannot review your own
            books or rate your own shop.</>,
          <>আপনার অর্ডার ডেলিভারি হয়ে গেলে আপনি বইটির রিভিউ দিতে পারেন এবং যে বিক্রেতার কাছ থেকে কিনেছেন
            তাঁকে রেটিং দিতে পারেন। কোনো অর্ডার বাতিল হলে, যে রিভিউ বা রেটিংয়ের পেছনে ওই অর্ডারটিই একমাত্র
            কেনা ছিল, সেটি সরিয়ে ফেলা হয়। নিজের বইয়ের রিভিউ বা নিজের শপের রেটিং দেওয়া যায় না।</>
        )}
      </p>

      <h2>{t('What you may not do', 'যা করা যাবে না')}</h2>
      <ul>
        <li>
          {pick(
            <>List counterfeit or pirated copies, or anything you may not legally
              sell.</>,
            <>নকল বা পাইরেটেড কপি, অথবা আইনত আপনি বিক্রি করতে পারেন না এমন কিছু তালিকাভুক্ত করা।</>
          )}
        </li>
        <li>
          {pick(
            <>Post unlawful, abusive or misleading content, including in chat.</>,
            <>বেআইনি, অপমানজনক বা বিভ্রান্তিকর কিছু পোস্ট করা, চ্যাটেও।</>
          )}
        </li>
        <li>
          {pick(
            <>Attempt to gain access to other accounts or to disrupt the service.</>,
            <>অন্যের অ্যাকাউন্টে ঢোকার বা সেবায় বিঘ্ন ঘটানোর চেষ্টা করা।</>
          )}
        </li>
        <li>
          {pick(
            <>Scrape the catalogue or use it to build a competing listing service.</>,
            <>স্বয়ংক্রিয়ভাবে বইয়ের তালিকা সংগ্রহ (স্ক্র্যাপ) করা, বা তা দিয়ে প্রতিযোগী কোনো লিস্টিং সেবা
              তৈরি করা।</>
          )}
        </li>
      </ul>

      <h2>{t('Content you post', 'আপনার পোস্ট করা কনটেন্ট')}</h2>
      <p>
        {pick(
          <>You keep ownership of your listings, photographs and messages. You give
            us permission to display them on the service so the marketplace can work.
            We may remove content that breaks these terms.</>,
          <>আপনার লিস্টিং, ছবি ও মেসেজের মালিকানা আপনারই থাকে। মার্কেটপ্লেসটি চালানোর জন্য সেগুলো সেবায় দেখানোর
            অনুমতি আপনি আমাদের দিচ্ছেন। এই শর্তাবলি ভাঙে এমন কনটেন্ট আমরা সরিয়ে দিতে পারি।</>
        )}
      </p>

      <h2>{t('Availability', 'সেবার প্রাপ্যতা')}</h2>
      <p>
        {pick(
          <>We aim to keep the service running but do not guarantee it will be
            uninterrupted. Features may change.</>,
          <>আমরা সেবাটি চালু রাখার চেষ্টা করি, তবে তা কখনো বিঘ্নিত হবে না, এমন নিশ্চয়তা দিই না। সুবিধাগুলো বদলাতে
            পারে।</>
        )}
      </p>

      <h2>{t('Liability', 'দায়')}</h2>
      <p>
        {pick(
          <>We are responsible for running the marketplace, delivering orders and
            handling returns as these terms describe. A book's description is the
            seller's; if it arrives not as described, the returns policy is the
            remedy. Nothing here limits liability that cannot be limited by law.</>,
          <>এই শর্তাবলিতে যেমন বলা আছে, সেভাবে মার্কেটপ্লেস চালানো, অর্ডার পৌঁছে দেওয়া এবং রিটার্ন সামলানোর দায়
            আমাদের। বইয়ের বর্ণনা বিক্রেতার; বই বর্ণনার সঙ্গে না মিললে তার প্রতিকার রিটার্ন নীতি। আইন অনুযায়ী যে
            দায় সীমিত করা যায় না, এখানে কিছুই তা সীমিত করে না।</>
        )}
      </p>

      <h2>{t('Ending your account', 'আপনার অ্যাকাউন্ট বন্ধ করা')}</h2>
      <p>
        {pick(
          <>You can delete your account yourself, under <strong>Your
            data</strong> on your profile page, or ask us to by e-mailing
            <a href={`mailto:${site.email}`}> {site.email}</a>. Orders not yet
            started are cancelled for you; an order on its way, a return being
            decided, or a sale still to be paid out to you is finished first. We may
            suspend an account that breaks these terms.</>,
          <>আপনার প্রোফাইল পাতার <strong>আপনার তথ্য</strong> অংশ থেকে আপনি নিজেই অ্যাকাউন্ট মুছে ফেলতে পারেন,
            অথবা <a href={`mailto:${site.email}`}>{site.email}</a> ঠিকানায় ই-মেইল করে আমাদের মুছে দিতে বলতে
            পারেন। যে অর্ডারের কাজ এখনো শুরু হয়নি, সেগুলো আপনার হয়ে বাতিল করা হয়; পথে থাকা অর্ডার,
            সিদ্ধান্তের অপেক্ষায় থাকা রিটার্ন, বা আপনাকে টাকা দেওয়া বাকি এমন বিক্রি আগে শেষ করা হয়। এই শর্তাবলি
            ভাঙে এমন অ্যাকাউন্ট আমরা স্থগিত করতে পারি।</>
        )}
      </p>

      <h2>{t('Changes', 'পরিবর্তন')}</h2>
      <p>
        {t(
          'If these terms change materially we will say so on this page and update the date above.',
          'এই শর্তাবলিতে উল্লেখযোগ্য কোনো পরিবর্তন হলে আমরা এই পাতায় তা জানাব এবং ওপরের তারিখটি হালনাগাদ করব।'
        )}
      </p>

      <h2>{t('Governing law', 'প্রযোজ্য আইন')}</h2>
      <p>{t('These terms are governed by the laws of Bangladesh.', 'এই শর্তাবলি বাংলাদেশের আইন অনুযায়ী পরিচালিত হবে।')}</p>
    </LegalPage>
  );
}
