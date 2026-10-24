import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaArrowRight, FaChevronDown } from 'react-icons/fa';

import Logo from '../components/Logo.js';
import Footer from '../components/Footer.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { LanguageToggle } from '../components/LanguageToggle.js';
import { promotionDescription, site, sitePayment } from '../config/site.js';
import { useSeo } from '../hooks/useSeo.js';
import { isAuthenticated } from '../utils/auth.js';
import { formatNumber, t } from '../utils/language.js';
import './Homepage.css';
import './HowItWorks.css';

interface Step {
  icon: string;
  title: string;
  text: string;
  tips: readonly string[];
  action?: { label: string; to: string };
}

const n = formatNumber;
const { delivery, returns, promotions } = site;

/*
 * Functions rather than constants: `t` reads the language when it is called,
 * and a constant would keep the language of the first load.
 */
const buying = (): readonly Step[] => [
  {
    icon: '🔎',
    title: t('Find your book', 'আপনার বই খুঁজুন'),
    text: t(
      'Search by title, author or ISBN, in Bangla or English - "pather panchali" finds পথের পাঁচালী. Suggestions appear as you type, or tap the microphone and say it.',
      'বইয়ের নাম, লেখক বা ISBN দিয়ে খুঁজুন, বাংলায় বা ইংরেজিতে — "pather panchali" লিখলেও পথের পাঁচালী পাওয়া যায়। লেখার সময়েই পরামর্শ দেখা যায়, অথবা মাইক্রোফোনে ট্যাপ করে বলুন।'
    ),
    tips: [
      t(
        'Filter by category, new or second-hand, condition, price, rating and stock',
        'ধরন, নতুন না পুরোনো, অবস্থা, দাম, রেটিং ও স্টক দিয়ে ছাঁকুন'
      ),
      t('Quick deals shows every discount, the biggest first', 'চটজলদি ছাড়-এ সব ছাড় দেখা যায়, সবচেয়ে বড়টি আগে'),
      t(
        'Nobody selling it yet? Ask for it on the Wanted board and hear when it is listed',
        'এখনো কেউ বিক্রি করছেন না? চাহিদার বোর্ডে বইটি চান, তালিকায় এলেই খবর পাবেন'
      ),
    ],
    action: { label: t('Browse books', 'বই দেখুন'), to: '/filter' },
  },
  {
    icon: '📖',
    title: t('Check it out', 'ভালো করে দেখে নিন'),
    text: t(
      'Every book page shows the photos, the condition in the seller’s words, the price and how many are left.',
      'প্রতিটি বইয়ের পাতায় ছবি, বিক্রেতার নিজের ভাষায় বইয়ের অবস্থা, দাম এবং কয়টি বাকি আছে তা দেখা যায়।'
    ),
    tips: [
      t('Reviews come only from people who received the book', 'রিভিউ আসে শুধু তাঁদের কাছ থেকে, যাঁরা বইটি হাতে পেয়েছেন'),
      t('See the seller’s rating, and visit their shop', 'বিক্রেতার রেটিং দেখুন, তাঁর শপ ঘুরে আসুন'),
      t(
        'Views and wishlists show how wanted a book is',
        'কতবার দেখা হয়েছে আর কতজন উইশলিস্টে রেখেছেন, তা থেকে বোঝা যায় বইটির চাহিদা কেমন'
      ),
      t('Questions? Chat with the seller before you buy', 'কোনো প্রশ্ন? কেনার আগে বিক্রেতার সঙ্গে চ্যাট করুন'),
    ],
  },
  {
    icon: '🛒',
    title: t('Order, pay on delivery', 'অর্ডার দিন, টাকা দিন ডেলিভারিতে'),
    text: t(
      `Add books to your cart and check out with your address and phone number. You see the delivery charge before you order: ${delivery.insideDhaka} Tk in Dhaka, ${delivery.outsideDhaka} Tk elsewhere.`,
      `বই কার্টে যোগ করুন, তারপর ঠিকানা ও ফোন নম্বর দিয়ে চেকআউট করুন। অর্ডারের আগেই ডেলিভারি চার্জ দেখতে পাবেন: ঢাকায় ${n(delivery.insideDhaka)} টাকা, অন্যত্র ${n(delivery.outsideDhaka)} টাকা।`
    ),
    tips: [
      t(`${site.payment}: you pay the courier when it arrives`, `${sitePayment()}: বই পৌঁছালে কুরিয়ারকে টাকা দেন`),
      t(
        `${promotions.firstOrder.code} gives ${promotions.firstOrder.description}`,
        `${promotions.firstOrder.code} কোডে ${promotionDescription(promotions.firstOrder)}`
      ),
      t(
        `${promotions.freeDelivery.description} with ${promotions.freeDelivery.code}`,
        `${promotions.freeDelivery.code} কোডে ${promotionDescription(promotions.freeDelivery)}`
      ),
      t(
        'Leave the seller a note, such as a good time to deliver',
        'বিক্রেতার জন্য একটি নোট রাখুন, যেমন ডেলিভারির সুবিধাজনক সময়'
      ),
    ],
    action: { label: t('Go to your cart', 'কার্টে যান'), to: '/cart' },
  },
  {
    icon: '🚚',
    title: t('Follow it to your door', 'দরজা পর্যন্ত খবর রাখুন'),
    text: t(
      `It arrives within ${delivery.daysInsideDhaka} working days in Dhaka and ${delivery.daysOutsideDhaka} elsewhere. Every step - confirmed, processing, shipped, out for delivery, delivered - shows on the order and in your notifications.`,
      `ঢাকায় ${n(delivery.daysInsideDhaka)} কর্মদিবসে, অন্যত্র ${n(delivery.daysOutsideDhaka)} কর্মদিবসে পৌঁছায়। প্রতিটি ধাপ — নিশ্চিত, প্রস্তুত হচ্ছে, পাঠানো হয়েছে, ডেলিভারির পথে, ডেলিভারি হয়েছে — অর্ডারে ও আপনার নোটিফিকেশনে দেখা যায়।`
    ),
    tips: [
      t('Download any order as a PDF', 'যেকোনো অর্ডার PDF হিসেবে ডাউনলোড করুন'),
      t(
        'Changed your mind? Cancel from your orders before the seller starts on it',
        'মত বদলেছেন? বিক্রেতা কাজ শুরু করার আগে আপনার অর্ডার থেকে বাতিল করুন'
      ),
    ],
    action: { label: t('Your orders', 'আপনার অর্ডার'), to: '/buyer/orders' },
  },
  {
    icon: '⭐',
    title: t('Enjoy it, or return it', 'উপভোগ করুন, নয়তো ফেরত দিন'),
    text: t(
      `Something not as described? Ask for a return within ${returns.windowDays} days of delivery, with a photo, and the refund goes to your bKash.`,
      `বর্ণনার সঙ্গে মেলেনি? ডেলিভারির ${n(returns.windowDays)} দিনের মধ্যে ছবিসহ রিটার্নের অনুরোধ করুন, টাকা ফেরত যাবে আপনার বিকাশে।`
    ),
    tips: [
      t(
        'Review the book and rate the seller, to help the next reader',
        'পরের পাঠকের সুবিধার জন্য বইয়ের রিভিউ দিন ও বিক্রেতাকে রেটিং দিন'
      ),
      t('Invite a friend who loves books', 'বই ভালোবাসেন এমন বন্ধুকে আমন্ত্রণ জানান'),
    ],
    action: { label: t('Returns policy', 'ফেরত নীতি'), to: '/returns' },
  },
];

const selling = (): readonly Step[] => [
  {
    icon: '🪪',
    title: t('Get ready to be paid', 'টাকা পাওয়ার প্রস্তুতি নিন'),
    text: t(
      'Switch your profile to Seller and add your bKash merchant number. That is where your sales are paid.',
      'আপনার প্রোফাইল "বিক্রেতা"-তে বদলান এবং আপনার বিকাশ মার্চেন্ট নম্বর যোগ করুন। আপনার বিক্রির টাকা সেখানেই পাঠানো হয়।'
    ),
    tips: [
      t(
        'Add a seller banner and picture, so your shop looks like yours',
        'বিক্রেতার ব্যানার ও ছবি যোগ করুন, যাতে আপনার শপ দেখতে আপনার মতোই হয়'
      ),
      t('Turn on two-step sign-in to protect your earnings', 'আপনার আয় সুরক্ষিত রাখতে দুই ধাপের সাইন-ইন চালু করুন'),
    ],
    action: { label: t('Add your bKash number', 'আপনার বিকাশ নম্বর যোগ করুন'), to: '/update-profile?mode=seller#bkash' },
  },
  {
    icon: '📸',
    title: t('List a book in minutes', 'কয়েক মিনিটে বই তালিকাভুক্ত করুন'),
    text: t(
      'Add photos, the title and author, and for a second-hand copy an honest condition. You set the price; a listing starts with one copy, and you can change the stock any time from your Book List.',
      'ছবি, বইয়ের নাম ও লেখক যোগ করুন, আর পুরোনো কপি হলে সৎভাবে তার অবস্থা লিখুন। দাম আপনিই ঠিক করেন; একটি লিস্টিং এক কপি দিয়ে শুরু হয়, আর আপনার বইয়ের তালিকা থেকে যেকোনো সময় স্টক বদলাতে পারেন।'
    ),
    tips: [
      t('Listing is free', 'তালিকাভুক্ত করা বিনামূল্যে'),
      t('Add a discount any time - it puts the book in Quick deals', 'যেকোনো সময় ছাড় দিন — তাতে বইটি চটজলদি ছাড়-এ চলে আসে'),
      t(
        'Check the Wanted board for books buyers are already asking for',
        'ক্রেতারা কোন বই আগে থেকেই চাইছেন, চাহিদার বোর্ডে দেখে নিন'
      ),
    ],
    action: { label: t('List a book', 'বই তালিকাভুক্ত করুন'), to: '/add-book' },
  },
  {
    icon: '📬',
    title: t('Get an order', 'অর্ডার পান'),
    text: t(
      'You hear about it straight away, in the app and by e-mail. The copy is reserved for the buyer, so it cannot be sold twice.',
      'সঙ্গে সঙ্গে খবর পাবেন, অ্যাপে ও ই-মেইলে। কপিটি ক্রেতার জন্য সংরক্ষিত থাকে, তাই দুবার বিক্রি হতে পারে না।'
    ),
    tips: [
      t('Prepare it, then mark it shipped', 'বইটি প্রস্তুত করুন, তারপর "পাঠানো হয়েছে" চিহ্নিত করুন'),
      t('The courier and the shop take care of delivery', 'ডেলিভারির দায়িত্ব কুরিয়ার ও শপের'),
      t('Reply to the buyer in chat', 'চ্যাটে ক্রেতার উত্তর দিন'),
    ],
    action: { label: t('Your orders', 'আপনার অর্ডার'), to: '/seller-orders' },
  },
  {
    icon: '💸',
    title: t('Get paid by bKash', 'বিকাশে টাকা পান'),
    text: t(
      `Once the ${returns.windowDays}-day return window has closed, we send the book total, less ${site.sellerFeePercent}%, to your bKash with the transaction ID.`,
      `${n(returns.windowDays)} দিনের ফেরতের সময়সীমা শেষ হলে আমরা বইয়ের মোট দাম থেকে ${n(site.sellerFeePercent)}% বাদ দিয়ে বাকিটা ট্রানজ্যাকশন আইডিসহ আপনার বিকাশে পাঠাই।`
    ),
    tips: [
      t('Track what is due and paid from your orders', 'কত পাওনা আর কত পেয়েছেন, আপনার অর্ডার থেকে দেখুন'),
      t('No monthly fees, no listing fees', 'কোনো মাসিক ফি নেই, তালিকাভুক্ত করার ফিও নেই'),
    ],
  },
  {
    icon: '🚀',
    title: t('Grow your shop', 'আপনার শপ বড় করুন'),
    text: t(
      'Your shop page shows your books, sales and rating. Good service earns good ratings, and good ratings bring buyers back.',
      'আপনার শপের পাতায় আপনার বই, বিক্রি ও রেটিং দেখা যায়। ভালো সেবায় ভালো রেটিং আসে, আর ভালো রেটিং ক্রেতাদের আবার ফিরিয়ে আনে।'
    ),
    tips: [
      t('Reply to reviews and ratings', 'রিভিউ ও রেটিংয়ের উত্তর দিন'),
      t('Restock sold-out books people have asked for', 'শেষ হয়ে যাওয়া যেসব বই মানুষ চেয়েছেন, সেগুলো আবার স্টকে আনুন'),
      t('Share your books on Facebook and WhatsApp', 'Facebook ও WhatsApp-এ আপনার বই শেয়ার করুন'),
    ],
    action: { label: t('See the Wanted board', 'চাহিদার বোর্ড দেখুন'), to: '/wanted' },
  },
];

const faq = (): readonly { q: string; a: string }[] => [
  {
    q: t('How do I pay?', 'কীভাবে টাকা দেব?'),
    a: t(
      `${site.payment}. You pay the courier in cash when your books arrive - nothing is paid online.`,
      `${sitePayment()}। বই পৌঁছালে কুরিয়ারকে নগদে টাকা দেন — অনলাইনে কিছুই দিতে হয় না।`
    ),
  },
  {
    q: t('What does delivery cost, and how long does it take?', 'ডেলিভারিতে কত খরচ, আর কত দিন লাগে?'),
    a: t(
      `${delivery.insideDhaka} Tk inside Dhaka, ${delivery.daysInsideDhaka} working days; ${delivery.outsideDhaka} Tk elsewhere, ${delivery.daysOutsideDhaka} working days. Free with ${promotions.freeDelivery.code} on ${promotions.freeDelivery.minBooksTotal} Tk or more of books.`,
      `ঢাকার ভেতরে ${n(delivery.insideDhaka)} টাকা, ${n(delivery.daysInsideDhaka)} কর্মদিবস; অন্যত্র ${n(delivery.outsideDhaka)} টাকা, ${n(delivery.daysOutsideDhaka)} কর্মদিবস। ${n(promotions.freeDelivery.minBooksTotal)} টাকা বা তার বেশি দামের বইয়ে ${promotions.freeDelivery.code} কোড দিলে ফ্রি।`
    ),
  },
  {
    q: t('What if the book is not as described?', 'বই বর্ণনার সঙ্গে না মিললে?'),
    a: t(
      `Ask for a return within ${returns.windowDays} days of delivery from your orders, with a photo. Once it reaches us, the refund goes to your bKash within ${returns.refundWorkingDays} working days.`,
      `ডেলিভারির ${n(returns.windowDays)} দিনের মধ্যে আপনার অর্ডার থেকে ছবিসহ রিটার্নের অনুরোধ করুন। বইটি আমাদের কাছে পৌঁছানোর পর ${n(returns.refundWorkingDays)} কর্মদিবসের মধ্যে টাকা আপনার বিকাশে ফেরত যায়।`
    ),
  },
  {
    q: t('Can I trust a seller?', 'বিক্রেতাকে কি বিশ্বাস করা যায়?'),
    a: t(
      'Every seller is rated by people whose orders from them were delivered, and every book review comes from a buyer who received the book. You can also chat with a seller before you buy.',
      'প্রতিটি বিক্রেতাকে রেটিং দেন তাঁরা, যাঁদের অর্ডার ওই বিক্রেতার কাছ থেকে ডেলিভারি হয়েছে, আর প্রতিটি বইয়ের রিভিউ আসে এমন ক্রেতার কাছ থেকে, যিনি বইটি হাতে পেয়েছেন। কেনার আগে বিক্রেতার সঙ্গে চ্যাটও করতে পারেন।'
    ),
  },
  {
    q: t('How do I keep my account safe?', 'কীভাবে আমার অ্যাকাউন্ট নিরাপদ রাখব?'),
    a: t(
      'Use a strong password, and turn on two-step sign-in in your profile: after your password, we e-mail you a code to finish signing in.',
      'শক্ত পাসওয়ার্ড ব্যবহার করুন, এবং প্রোফাইলে দুই ধাপের সাইন-ইন চালু করুন: পাসওয়ার্ডের পরে সাইন ইন শেষ করতে আমরা আপনাকে ই-মেইলে একটি কোড পাঠাব।'
    ),
  },
  {
    q: t('Can I choose what I am notified about?', 'কোন বিষয়ে নোটিফিকেশন পাব, তা কি বেছে নিতে পারি?'),
    a: t(
      'Yes. In your profile, switch each kind of notification on or off, in the app and by e-mail.',
      'হ্যাঁ। প্রোফাইলে প্রতিটি ধরনের নোটিফিকেশন চালু বা বন্ধ করুন, অ্যাপে ও ই-মেইলে।'
    ),
  },
];

function Journey({ steps, name }: { steps: readonly Step[]; name: string }) {
  const [current, setCurrent] = useState(0);
  const step = steps[current];
  const go = (index: number) => setCurrent(Math.max(0, Math.min(steps.length - 1, index)));
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight') go(current + 1);
    if (event.key === 'ArrowLeft') go(current - 1);
  };

  return (
    <div className="hw-journey">
      <ol className="hw-steps" aria-label={t(`${name}, step by step`, `${name}, ধাপে ধাপে`)} onKeyDown={onKey}>
        {steps.map((item, index) => (
          <li key={item.title} className={index < current ? 'is-past' : index === current ? 'is-current' : ''}>
            {/* Named in full: on a phone only the number shows. */}
            <button
              type="button"
              onClick={() => go(index)}
              aria-current={index === current ? 'step' : undefined}
              aria-label={t(`Step ${index + 1}: ${item.title}`, `ধাপ ${n(index + 1)}: ${item.title}`)}
            >
              <span className="hw-dot" aria-hidden="true">
                {index < current ? '✓' : n(index + 1)}
              </span>
              <span className="hw-step-name">{item.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <article key={step.title} className="card hw-panel" aria-live="polite">
        <span className="hw-icon" aria-hidden="true">
          {step.icon}
        </span>
        <div className="hw-panel-body">
          <p className="hw-count">
            {t(`Step ${current + 1} of ${steps.length}`, `ধাপ ${n(current + 1)}/${n(steps.length)}`)}
          </p>
          <h2>{step.title}</h2>
          <p>{step.text}</p>
          <ul>
            {step.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <div className="hw-actions">
            <button type="button" className="btn btn-ghost" onClick={() => go(current - 1)} disabled={current === 0}>
              <FaArrowLeft aria-hidden="true" /> {t('Back', 'পেছনে')}
            </button>
            {current < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => go(current + 1)}>
                {t('Next', 'পরের ধাপ')} <FaArrowRight aria-hidden="true" />
              </button>
            ) : null}
            {step.action && (
              <Link to={step.action.to} className="btn btn-accent">
                {step.action.label}
              </Link>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}

/**
 * How the shop works, as two guided journeys - buying and selling - a step
 * at a time, and the questions people ask first. Linked from the welcome
 * notification and e-mail, and the footer.
 */
export default function HowItWorks() {
  useSeo({
    title: t('How it works', 'যেভাবে কাজ করে'),
    description: t(
      `How buying and selling works on ${site.name}: find a book, pay on delivery, track it, return it within ${site.returns.windowDays} days, or list your own and get paid by bKash.`,
      `${site.name}-এ কেনা-বেচা যেভাবে হয়: বই খুঁজুন, ডেলিভারিতে টাকা দিন, অর্ডারের খবর রাখুন, ${n(site.returns.windowDays)} দিনের মধ্যে ফেরত দিন, অথবা নিজের বই তালিকাভুক্ত করে বিকাশে টাকা পান।`
    ),
  });
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [open, setOpen] = useState<number | null>(0);
  const signedIn = isAuthenticated();

  return (
    <div className="hw-page">
      <header className="header">
        <Link to="/" className="logo-button" aria-label={t(`${site.name} home`, `${site.name} হোম`)}>
          <Logo size={38} />
        </Link>
        <div className="user-options">
          <LanguageToggle />
          <ThemeToggle />
          {!signedIn && (
            <Link to="/sign-in" className="btn btn-primary" style={{ minHeight: 40, padding: '0 1.1rem' }}>
              {t('Sign in', 'সাইন ইন')}
            </Link>
          )}
        </div>
      </header>

      <main className="hw-main">
        <section className="hw-hero">
          <p className="hw-kicker">{t(`👋 Welcome to ${site.name}`, `👋 ${site.name}-এ স্বাগতম`)}</p>
          <h1>{t('How it works', 'যেভাবে কাজ করে')}</h1>
          <p>
            {t(
              'New and second-hand books, bought and sold by readers across Bangladesh. Here is everything in a few taps.',
              'নতুন ও পুরোনো বই, সারা বাংলাদেশের পাঠকেরা কেনেন ও বেচেন। কয়েকটি ট্যাপেই সব জেনে নিন।'
            )}
          </p>
          <div className="hw-tabs" role="tablist" aria-label={t('Choose a guide', 'একটি গাইড বেছে নিন')}>
            <button type="button" role="tab" aria-selected={tab === 'buy'} onClick={() => setTab('buy')}>
              {t('🛍️ I want to buy', '🛍️ আমি কিনতে চাই')}
            </button>
            <button type="button" role="tab" aria-selected={tab === 'sell'} onClick={() => setTab('sell')}>
              {t('🏪 I want to sell', '🏪 আমি বিক্রি করতে চাই')}
            </button>
          </div>
        </section>

        <section role="tabpanel" aria-label={tab === 'buy' ? t('Buying', 'কেনা') : t('Selling', 'বিক্রি')}>
          {tab === 'buy' ? (
            <Journey key="buy" steps={buying()} name={t('Buying', 'কেনা')} />
          ) : (
            <Journey key="sell" steps={selling()} name={t('Selling', 'বিক্রি')} />
          )}
        </section>

        <section className="hw-faq" aria-labelledby="hw-faq-title">
          <h2 id="hw-faq-title">{t('Good to know', 'জেনে রাখুন')}</h2>
          {faq().map((item, index) => (
            <div key={item.q} className={`card hw-question${open === index ? ' is-open' : ''}`}>
              <h3>
                <button type="button" aria-expanded={open === index} onClick={() => setOpen(open === index ? null : index)}>
                  {item.q}
                  <FaChevronDown aria-hidden="true" />
                </button>
              </h3>
              {open === index && <p>{item.a}</p>}
            </div>
          ))}
        </section>

        <section className="hw-cta">
          <h2>{t('Ready when you are', 'আপনি প্রস্তুত হলেই শুরু')}</h2>
          <div className="hw-actions">
            <Link to="/filter" className="btn btn-primary">
              {t('Start browsing', 'বই দেখা শুরু করুন')}
            </Link>
            {signedIn ? (
              <Link to="/profile#setup" className="btn btn-ghost">
                {t('Finish your profile', 'প্রোফাইল সম্পূর্ণ করুন')}
              </Link>
            ) : (
              <Link to="/sign-up" className="btn btn-ghost">
                {t('Create a free account', 'বিনামূল্যে অ্যাকাউন্ট খুলুন')}
              </Link>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
