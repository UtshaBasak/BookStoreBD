import { Link } from 'react-router-dom';

import { site, sitePoliciesUpdated } from '../../config/site.js';
import { formatNumber, pick, t } from '../../utils/language.js';
import LegalPage from './LegalPage.js';

const { returns } = site;

/**
 * Describes the return flow the application actually implements: a window
 * that opens on delivery, a request naming the order line with a description
 * and a bKash number, and an administrator's decision. The API enforces the
 * window, so what this page promises is what the server allows.
 */
export default function Returns() {
  const n = formatNumber;
  return (
    <LegalPage
      title={t('Returns and refunds', 'রিটার্ন ও টাকা ফেরত')}
      intro={t(
        'When a book can be sent back, and how you are refunded.',
        'কখন বই ফেরত পাঠানো যায়, আর কীভাবে আপনার টাকা ফেরত দেওয়া হয়।'
      )}
      updated={sitePoliciesUpdated()}
    >
      <h2>{t('The window', 'সময়সীমা')}</h2>
      <p>
        {pick(
          <>You can ask for a return within <strong>{returns.windowDays} days of
            delivery</strong>. The days count from when the order is marked
            delivered, not from when you placed it, so a parcel that takes longer to
            reach you does not cost you any of them. Your orders page shows the last
            day for each book.</>,
          <>আপনি <strong>ডেলিভারির {n(returns.windowDays)} দিনের মধ্যে</strong> রিটার্নের অনুরোধ করতে পারেন।
            দিন গোনা শুরু হয় অর্ডারটি ডেলিভারি হয়েছে বলে চিহ্নিত হওয়ার সময় থেকে, অর্ডার দেওয়ার সময় থেকে নয়;
            তাই পার্সেল পৌঁছাতে দেরি হলেও আপনার একটি দিনও কমে না। আপনার অর্ডারের পাতায় প্রতিটি বইয়ের শেষ দিন
            দেখানো থাকে।</>
        )}
      </p>

      <h2>{t('What qualifies', 'কোন ক্ষেত্রে ফেরত দেওয়া যায়')}</h2>
      <p>
        {pick(
          <>Second-hand books are sold in the condition the seller describes, so
            ordinary wear consistent with the stated condition is not a fault. A
            return is appropriate when:</>,
          <>পুরোনো বই বিক্রেতার বর্ণনা করা অবস্থাতেই বিক্রি হয়, তাই উল্লেখ করা অবস্থার সঙ্গে মেলে এমন সাধারণ
            ব্যবহারের ছাপ কোনো ত্রুটি নয়। রিটার্ন উপযুক্ত যখন:</>
        )}
      </p>
      <ul>
        <li>
          {t(
            'the book is damaged beyond the condition described;',
            'বইটি বর্ণনা করা অবস্থার চেয়ে বেশি ক্ষতিগ্রস্ত;'
          )}
        </li>
        <li>{t('pages are missing, or the copy is incomplete;', 'পাতা নেই, বা কপিটি অসম্পূর্ণ;')}</li>
        <li>
          {t(
            'the wrong title, edition or format arrived.',
            'ভুল বই, ভুল সংস্করণ বা ভুল ধরনের (ফরম্যাট) কপি এসেছে।'
          )}
        </li>
      </ul>
      <p>
        {pick(
          <>If your order has not arrived at all, that is not a return: e-mail us
            at <a href={`mailto:${site.email}`}>{site.email}</a> with the order
            number and we will chase it.</>,
          <>আপনার অর্ডার একেবারেই না পৌঁছালে সেটি রিটার্ন নয়: অর্ডার নম্বরসহ{' '}
            <a href={`mailto:${site.email}`}>{site.email}</a> ঠিকানায় আমাদের ই-মেইল করুন, আমরা খোঁজ নেব।</>
        )}
      </p>

      <h2>{t('How to ask for one', 'কীভাবে অনুরোধ করবেন')}</h2>
      <ul>
        <li>
          {pick(
            <>Open <strong>My orders</strong> from your profile.</>,
            <>আপনার প্রোফাইল থেকে <strong>আমার অর্ডার</strong> খুলুন।</>
          )}
        </li>
        <li>
          {pick(
            <>Choose <strong>Return</strong> on the book in question.</>,
            <>সংশ্লিষ্ট বইয়ে <strong>ফেরত দিন</strong> বেছে নিন।</>
          )}
        </li>
        <li>
          {pick(
            <>Describe the problem, and add at least one photograph of it (up to
              ten). Returns are decided on the photographs.</>,
            <>সমস্যাটি বর্ণনা করুন, এবং তার অন্তত একটি ছবি যোগ করুন (সর্বোচ্চ {n(10)}টি)। রিটার্নের সিদ্ধান্ত
              ছবি দেখেই নেওয়া হয়।</>
          )}
        </li>
        <li>
          {t(
            'Give the bKash number the refund should go to.',
            'যে বিকাশ নম্বরে টাকা ফেরত যাবে, সেটি দিন।'
          )}
        </li>
      </ul>
      <p>
        {pick(
          <>Your request is marked <em>pending</em> until it is reviewed, and then
            <em> approved</em> or <em>rejected</em>. You can see the status on the
            same page. A book you have asked to return counts as sold until the
            return is approved.</>,
          <>যাচাই না হওয়া পর্যন্ত আপনার অনুরোধটি <em>অপেক্ষমাণ</em> থাকে, তারপর <em>অনুমোদিত</em> বা{' '}
            <em>প্রত্যাখ্যাত</em> হয়। একই পাতায় অবস্থাটি দেখতে পাবেন। যে বই ফেরতের অনুরোধ করেছেন, রিটার্ন
            অনুমোদিত না হওয়া পর্যন্ত সেটি বিক্রি হওয়া বলেই গণ্য হয়।</>
        )}
      </p>

      <h2>{t('Sending the book back', 'বই ফেরত পাঠানো')}</h2>
      <p>
        {pick(
          <>When a return is approved, we e-mail you the address of our office in
            Dhaka. Send the book there by courier. <strong>We pay the courier charge
            for sending it back.</strong></>,
          <>রিটার্ন অনুমোদিত হলে আমরা আপনাকে ঢাকায় আমাদের অফিসের ঠিকানা ই-মেইল করি। কুরিয়ারে বইটি সেখানে
            পাঠান। <strong>ফেরত পাঠানোর কুরিয়ার খরচ আমরা দিই।</strong></>
        )}
      </p>

      <h2>{t('Refunds', 'টাকা ফেরত')}</h2>
      <p>
        {pick(
          <>We refund the price you paid for the book to the bKash number you gave,
            within <strong>{returns.refundWorkingDays} working days of the book
            reaching us</strong>.</>,
          <>বইটির জন্য আপনি যে দাম দিয়েছিলেন, তা আমরা আপনার দেওয়া বিকাশ নম্বরে ফেরত দিই,{' '}
            <strong>বইটি আমাদের কাছে পৌঁছানোর {n(returns.refundWorkingDays)} কর্মদিবসের মধ্যে</strong>।</>
        )}
      </p>
      <p>
        {t(
          'The delivery charge you paid on the original order is not refunded.',
          'মূল অর্ডারে আপনি যে ডেলিভারি চার্জ দিয়েছিলেন, তা ফেরত দেওয়া হয় না।'
        )}
      </p>

      <h2>{t('If a decision seems wrong', 'সিদ্ধান্ত ভুল মনে হলে')}</h2>
      <p>
        {pick(
          <>A decision is final on the site, so you are not sent one answer and then
            another. If it seems wrong, e-mail us at <a href={`mailto:${site.email}`}>{site.email}</a> with
            the order number and we will look at it again.</>,
          <>সাইটে সিদ্ধান্তটিই চূড়ান্ত, যাতে আপনাকে একবার এক উত্তর, পরে আরেক উত্তর পাঠানো না হয়। সিদ্ধান্ত ভুল
            মনে হলে অর্ডার নম্বরসহ <a href={`mailto:${site.email}`}>{site.email}</a> ঠিকানায় আমাদের ই-মেইল
            করুন, আমরা আবার দেখব।</>
        )}
      </p>

      <p>
        {pick(
          <>See also the <Link to="/terms">terms of service</Link>.</>,
          <>আরও দেখুন: <Link to="/terms">সেবার শর্তাবলি</Link>।</>
        )}
      </p>
    </LegalPage>
  );
}
