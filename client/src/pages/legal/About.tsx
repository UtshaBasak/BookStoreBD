import { Link } from 'react-router-dom';

import { promotionDescription, site, siteTagline } from '../../config/site.js';
import { formatNumber, pick, t } from '../../utils/language.js';
import LegalPage from './LegalPage.js';

export default function About() {
  const n = formatNumber;
  const { delivery, promotions } = site;
  return (
    <LegalPage
      title={t(`About ${site.name}`, `${site.name} সম্পর্কে`)}
      intro={siteTagline()}
    >
      <p>
        {pick(
          <>{site.name} is a marketplace for new and second-hand books in
            Bangladesh. Anyone with an account can buy, and anyone with books to
            part with can list them.</>,
          <>{site.name} বাংলাদেশে নতুন ও পুরোনো বইয়ের একটি মার্কেটপ্লেস। অ্যাকাউন্ট থাকলে যে কেউ কিনতে পারেন,
            আর যাঁর কাছে হাতছাড়া করার মতো বই আছে, তিনি সেগুলো তালিকাভুক্ত করতে পারেন।</>
        )}
      </p>

      <h2 id="how-it-works">{t('How it works', 'যেভাবে কাজ করে')}</h2>
      <p>
        {pick(
          <><strong>Buying.</strong> Browse or search the catalogue, filter by
            category, condition or price, and add what you want to your cart. At
            checkout you give a delivery address and a contact number, and see the
            delivery charge before you order: {site.delivery.insideDhaka} Tk inside
            Dhaka, {site.delivery.outsideDhaka} Tk elsewhere, or free on orders of
            {' '}{site.promotions.freeDelivery.minBooksTotal} Tk or more with the code
            {' '}<strong>{site.promotions.freeDelivery.code}</strong>. The code
            {' '}<strong>{site.promotions.firstOrder.code}</strong> gives {site.promotions.firstOrder.description}.
            It arrives by courier within
            {' '}{site.delivery.daysInsideDhaka} working days in Dhaka and
            {' '}{site.delivery.daysOutsideDhaka} elsewhere, and you pay the courier
            cash on delivery. You can follow the order from your profile, and
            message the seller directly if something needs clarifying.</>,
          <><strong>কেনা।</strong> বইয়ের তালিকা ঘুরে দেখুন বা খুঁজুন, ধরন, অবস্থা বা দাম দিয়ে ছাঁকুন, আর যা চান
            তা কার্টে যোগ করুন। চেকআউটে আপনি ডেলিভারির ঠিকানা ও যোগাযোগের নম্বর দেন, এবং অর্ডারের আগেই ডেলিভারি
            চার্জ দেখতে পান: ঢাকার ভেতরে {n(delivery.insideDhaka)} টাকা, অন্যত্র {n(delivery.outsideDhaka)}{' '}
            টাকা, অথবা {n(promotions.freeDelivery.minBooksTotal)} টাকা বা তার বেশি অর্ডারে{' '}
            <strong>{promotions.freeDelivery.code}</strong> কোড দিলে ফ্রি।{' '}
            <strong>{promotions.firstOrder.code}</strong> কোড দিলে {promotionDescription(promotions.firstOrder)} পাবেন। বই
            কুরিয়ারে পৌঁছায় — ঢাকায় {n(delivery.daysInsideDhaka)} কর্মদিবসে, অন্যত্র{' '}
            {n(delivery.daysOutsideDhaka)} কর্মদিবসে — এবং বই হাতে পেয়ে কুরিয়ারকে নগদে টাকা দেন। প্রোফাইল থেকে
            অর্ডারের খবর রাখতে পারেন, আর কিছু জানার থাকলে সরাসরি বিক্রেতাকে মেসেজ দিতে পারেন।</>
        )}
      </p>
      <p>
        {pick(
          <><strong>Selling.</strong> Add a listing with photographs, a description
            and an honest condition. You set the price and the stock count. When
            somebody orders, the stock is reserved immediately so the same copy
            cannot be sold twice, and you get the delivery details you need to post
            it. Listing is free; when a book sells we keep {site.sellerFeePercent}% of
            its price, and the rest is yours.</>,
          <><strong>বিক্রি।</strong> ছবি, বর্ণনা ও সৎভাবে বইয়ের অবস্থা দিয়ে একটি লিস্টিং যোগ করুন। দাম ও
            স্টকের সংখ্যা আপনিই ঠিক করেন। কেউ অর্ডার দিলে সঙ্গে সঙ্গে স্টক সংরক্ষিত হয়, যাতে একই কপি দুবার বিক্রি
            না হয়, এবং বই পাঠাতে যে ডেলিভারির তথ্য লাগে তা আপনি পান। তালিকাভুক্ত করা বিনামূল্যে; বই বিক্রি হলে
            আমরা দামের {n(site.sellerFeePercent)}% রাখি, বাকিটা আপনার।</>
        )}
      </p>

      <h2>{t('Second-hand, described honestly', 'পুরোনো বই, সৎ বর্ণনায়')}</h2>
      <p>
        {pick(
          <>Most of the catalogue is used books, so condition matters more than it
            would in a new-book shop. Sellers state a condition and add details, and
            buyers can ask for a return within {site.returns.windowDays} days of
            delivery if what arrived does not match. See the <Link to="/returns">returns policy</Link>.</>,
          <>তালিকার বেশির ভাগই ব্যবহৃত বই, তাই নতুন বইয়ের দোকানের চেয়ে এখানে অবস্থা বেশি গুরুত্বপূর্ণ।
            বিক্রেতারা বইয়ের অবস্থা জানান ও বিস্তারিত যোগ করেন, আর যা পৌঁছেছে তা না মিললে ক্রেতারা ডেলিভারির{' '}
            {n(site.returns.windowDays)} দিনের মধ্যে রিটার্নের অনুরোধ করতে পারেন। দেখুন{' '}
            <Link to="/returns">ফেরত নীতি</Link>।</>
        )}
      </p>

      <h2>{t('Why it exists', 'কেন এই উদ্যোগ')}</h2>
      <p>
        {pick(
          <>Textbooks and novels tend to be read once and then sit on a shelf.
            Moving them to somebody who wants them is cheaper for the buyer, useful
            for the seller, and better than a landfill.</>,
          <>পাঠ্যবই আর উপন্যাস সাধারণত একবার পড়ার পর তাকে পড়ে থাকে। যিনি চান তাঁর হাতে সেগুলো পৌঁছে দিলে
            ক্রেতার খরচ কমে, বিক্রেতারও কাজে লাগে, আর ভাগাড়ে ফেলার চেয়ে তা অনেক ভালো।</>
        )}
      </p>

      <h2>{t('Talk to us', 'আমাদের সঙ্গে কথা বলুন')}</h2>
      <p>
        {pick(
          <>Questions, problems or ideas: <Link to="/contact">get in touch</Link>.</>,
          <>প্রশ্ন, সমস্যা বা কোনো ভাবনা থাকলে: <Link to="/contact">যোগাযোগ করুন</Link>।</>
        )}
      </p>
    </LegalPage>
  );
}
