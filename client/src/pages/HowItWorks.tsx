import { useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { FaArrowLeft, FaArrowRight, FaChevronDown } from 'react-icons/fa';

import Logo from '../components/Logo.js';
import Footer from '../components/Footer.js';
import { ThemeToggle } from '../components/ThemeToggle.js';
import { site } from '../config/site.js';
import { useSeo } from '../hooks/useSeo.js';
import { isAuthenticated } from '../utils/auth.js';
import './Homepage.css';
import './HowItWorks.css';

interface Step {
  icon: string;
  title: string;
  text: string;
  tips: readonly string[];
  action?: { label: string; to: string };
}

const BUYING: readonly Step[] = [
  {
    icon: '🔎',
    title: 'Find your book',
    text: 'Search by title, author or ISBN, in Bangla or English - "pather panchali" finds পথের পাঁচালী. Suggestions appear as you type, or tap the microphone and say it.',
    tips: [
      'Filter by category, new or second-hand, condition, price, rating and stock',
      'Quick deals shows every discount, the biggest first',
      'Nobody selling it yet? Ask for it on the Wanted board and hear when it is listed',
    ],
    action: { label: 'Browse books', to: '/filter' },
  },
  {
    icon: '📖',
    title: 'Check it out',
    text: 'Every book page shows the photos, the condition in the seller’s words, the price and how many are left.',
    tips: [
      'Reviews come only from people who bought the book',
      'See the seller’s rating, and visit their shop',
      'Views and wishlists show how wanted a book is',
      'Questions? Chat with the seller before you buy',
    ],
  },
  {
    icon: '🛒',
    title: 'Order, pay on delivery',
    text: `Add books to your cart and check out with your address and phone number. You see the delivery charge before you order: ${site.delivery.insideDhaka} Tk in Dhaka, ${site.delivery.outsideDhaka} Tk elsewhere.`,
    tips: [
      `${site.payment}: you pay the courier when it arrives`,
      `${site.promotions.firstOrder.code} gives ${site.promotions.firstOrder.description}`,
      `${site.promotions.freeDelivery.description} with ${site.promotions.freeDelivery.code}`,
      'Leave the seller a note, such as a good time to deliver',
    ],
    action: { label: 'Go to your cart', to: '/cart' },
  },
  {
    icon: '🚚',
    title: 'Follow it to your door',
    text: `It arrives within ${site.delivery.daysInsideDhaka} working days in Dhaka and ${site.delivery.daysOutsideDhaka} elsewhere. Every step - confirmed, processing, shipped, out for delivery, delivered - shows on the order and in your notifications.`,
    tips: ['Download any order as a PDF', 'Changed your mind before it ships? Cancel it in one tap'],
    action: { label: 'Your orders', to: '/buyer/orders' },
  },
  {
    icon: '⭐',
    title: 'Enjoy it, or return it',
    text: `Something not as described? Ask for a return within ${site.returns.windowDays} days of delivery, with a photo, and the refund goes to your bKash.`,
    tips: ['Review the book and rate the seller, to help the next reader', 'Invite a friend who loves books'],
    action: { label: 'Returns policy', to: '/returns' },
  },
];

const SELLING: readonly Step[] = [
  {
    icon: '🪪',
    title: 'Get ready to be paid',
    text: 'Switch your profile to Seller and add your bKash merchant number. That is where your sales are paid.',
    tips: ['Add a seller banner and picture, so your shop looks like yours', 'Turn on two-step sign-in to protect your earnings'],
    action: { label: 'Add your bKash number', to: '/update-profile?mode=seller#bkash' },
  },
  {
    icon: '📸',
    title: 'List a book in minutes',
    text: 'Add photos, the title, author and an honest condition. You set the price and how many you have.',
    tips: ['Listing is free', 'Add a discount any time - it puts the book in Quick deals', 'Check the Wanted board for books buyers are already asking for'],
    action: { label: 'List a book', to: '/add-book' },
  },
  {
    icon: '📬',
    title: 'Get an order',
    text: 'You hear about it straight away, in the app and by e-mail. The copy is reserved for the buyer, so it cannot be sold twice.',
    tips: ['Prepare it, then mark it shipped', 'The courier and the shop take care of delivery', 'Reply to the buyer in chat'],
    action: { label: 'Your orders', to: '/seller-orders' },
  },
  {
    icon: '💸',
    title: 'Get paid by bKash',
    text: `Once the ${site.returns.windowDays}-day return window has closed, we send the book total, less ${site.sellerFeePercent}%, to your bKash with the transaction ID.`,
    tips: ['Track what is due and paid from your orders', 'No monthly fees, no listing fees'],
  },
  {
    icon: '🚀',
    title: 'Grow your shop',
    text: 'Your shop page shows your books, sales and rating. Good service earns good ratings, and good ratings bring buyers back.',
    tips: ['Reply to reviews and ratings', 'Restock sold-out books people have asked for', 'Share your books on Facebook and WhatsApp'],
    action: { label: 'See the Wanted board', to: '/wanted' },
  },
];

const FAQ: readonly { q: string; a: string }[] = [
  { q: 'How do I pay?', a: `${site.payment}. You pay the courier in cash when your books arrive - nothing is paid online.` },
  {
    q: 'What does delivery cost, and how long does it take?',
    a: `${site.delivery.insideDhaka} Tk inside Dhaka, ${site.delivery.daysInsideDhaka} working days; ${site.delivery.outsideDhaka} Tk elsewhere, ${site.delivery.daysOutsideDhaka} working days. Free with ${site.promotions.freeDelivery.code} on ${site.promotions.freeDelivery.minBooksTotal} Tk or more of books.`,
  },
  {
    q: 'What if the book is not as described?',
    a: `Ask for a return within ${site.returns.windowDays} days of delivery from your orders, with a photo. Once it reaches us, the refund goes to your bKash within ${site.returns.refundWorkingDays} working days.`,
  },
  {
    q: 'Can I trust a seller?',
    a: 'Every seller has a rating from people who actually bought from them, and every book review comes from a real buyer. You can also chat with a seller before you buy.',
  },
  {
    q: 'How do I keep my account safe?',
    a: 'Use a strong password, and turn on two-step sign-in in your profile: after your password, we e-mail you a code to finish signing in.',
  },
  {
    q: 'Can I choose what I am notified about?',
    a: 'Yes. In your profile, switch each kind of notification on or off, in the app and by e-mail.',
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
      <ol className="hw-steps" aria-label={`${name}, step by step`} onKeyDown={onKey}>
        {steps.map((item, index) => (
          <li key={item.title} className={index < current ? 'is-past' : index === current ? 'is-current' : ''}>
            {/* Named in full: on a phone only the number shows. */}
            <button
              type="button"
              onClick={() => go(index)}
              aria-current={index === current ? 'step' : undefined}
              aria-label={`Step ${index + 1}: ${item.title}`}
            >
              <span className="hw-dot" aria-hidden="true">
                {index < current ? '✓' : index + 1}
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
            Step {current + 1} of {steps.length}
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
              <FaArrowLeft aria-hidden="true" /> Back
            </button>
            {current < steps.length - 1 ? (
              <button type="button" className="btn btn-primary" onClick={() => go(current + 1)}>
                Next <FaArrowRight aria-hidden="true" />
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
    title: 'How it works',
    description: `How buying and selling works on ${site.name}: find a book, pay on delivery, track it, return it within ${site.returns.windowDays} days, or list your own and get paid by bKash.`,
  });
  const [tab, setTab] = useState<'buy' | 'sell'>('buy');
  const [open, setOpen] = useState<number | null>(0);
  const signedIn = isAuthenticated();

  return (
    <div className="hw-page">
      <header className="header">
        <Link to="/" className="logo-button" aria-label={`${site.name} home`}>
          <Logo size={38} />
        </Link>
        <div className="user-options">
          <ThemeToggle />
          {!signedIn && (
            <Link to="/sign-in" className="btn btn-primary" style={{ minHeight: 40, padding: '0 1.1rem' }}>
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="hw-main">
        <section className="hw-hero">
          <p className="hw-kicker">👋 Welcome to {site.name}</p>
          <h1>How it works</h1>
          <p>New and second-hand books, bought and sold by readers across Bangladesh. Here is everything in a few taps.</p>
          <div className="hw-tabs" role="tablist" aria-label="Choose a guide">
            <button type="button" role="tab" aria-selected={tab === 'buy'} onClick={() => setTab('buy')}>
              🛍️ I want to buy
            </button>
            <button type="button" role="tab" aria-selected={tab === 'sell'} onClick={() => setTab('sell')}>
              🏪 I want to sell
            </button>
          </div>
        </section>

        <section role="tabpanel" aria-label={tab === 'buy' ? 'Buying' : 'Selling'}>
          {tab === 'buy' ? <Journey key="buy" steps={BUYING} name="Buying" /> : <Journey key="sell" steps={SELLING} name="Selling" />}
        </section>

        <section className="hw-faq" aria-labelledby="hw-faq-title">
          <h2 id="hw-faq-title">Good to know</h2>
          {FAQ.map((item, index) => (
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
          <h2>Ready when you are</h2>
          <div className="hw-actions">
            <Link to="/filter" className="btn btn-primary">
              Start browsing
            </Link>
            {signedIn ? (
              <Link to="/profile#setup" className="btn btn-ghost">
                Finish your profile
              </Link>
            ) : (
              <Link to="/sign-up" className="btn btn-ghost">
                Create a free account
              </Link>
            )}
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
