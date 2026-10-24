import { Link } from 'react-router-dom';

import { site, siteLocation } from '../../config/site.js';
import { pick, t } from '../../utils/language.js';
import LegalPage from './LegalPage.js';

export default function Contact() {
  return (
    <LegalPage
      title={t('Contact us', 'যোগাযোগ করুন')}
      intro={t(
        `${site.name} is run by ${site.owner} in ${site.location}. E-mail is the way to reach us.`,
        `${site.name} পরিচালনা করেন ${site.owner}, ${siteLocation()} থেকে। আমাদের কাছে পৌঁছানোর উপায় ই-মেইল।`
      )}
    >
      <h2>{t('By e-mail', 'ই-মেইলে')}</h2>
      <p>
        <a href={`mailto:${site.email}`}>{site.email}</a>
      </p>
      <p>
        {pick(
          <>Anything to do with an order, include the order number - it is on your
            orders page and in the order's tracking link - and we can look it up
            straight away.</>,
          <>কোনো অর্ডার নিয়ে লিখলে অর্ডার নম্বরটি দিন — এটি আপনার অর্ডারের পাতায় এবং অর্ডারের ট্র্যাকিং লিংকে
            আছে — তাহলে আমরা সঙ্গে সঙ্গে খুঁজে দেখতে পারব।</>
        )}
      </p>

      <h2>{t('About a specific book', 'নির্দিষ্ট কোনো বই নিয়ে')}</h2>
      <p>
        {pick(
          <>If the question is about a listing, message the seller directly from the
            book's page - they will know the condition of their copy better than we
            will. Anything that cannot be settled that way, bring to us.</>,
          <>প্রশ্নটি কোনো লিস্টিং নিয়ে হলে বইয়ের পাতা থেকে সরাসরি বিক্রেতাকে মেসেজ দিন — নিজের কপির অবস্থা তিনি
            আমাদের চেয়ে ভালো জানবেন। এভাবে মীমাংসা না হলে আমাদের জানান।</>
        )}
      </p>

      <h2>{t('Before you write', 'লেখার আগে')}</h2>
      <ul>
        <li>
          {pick(
            <>Delivery times and charges: see the <Link to="/terms#delivery">terms of service</Link>.</>,
            <>ডেলিভারির সময় ও চার্জ: <Link to="/terms#delivery">সেবার শর্তাবলি</Link> দেখুন।</>
          )}
        </li>
        <li>
          {pick(
            <>Sending a book back: see <Link to="/returns">returns and refunds</Link>.</>,
            <>বই ফেরত পাঠানো: <Link to="/returns">রিটার্ন ও টাকা ফেরত</Link> দেখুন।</>
          )}
        </li>
        <li>
          {pick(
            <>Your data: see the <Link to="/privacy">privacy policy</Link>.</>,
            <>আপনার তথ্য: <Link to="/privacy">গোপনীয়তা নীতি</Link> দেখুন।</>
          )}
        </li>
      </ul>
    </LegalPage>
  );
}
