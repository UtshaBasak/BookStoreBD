/**
 * What the shopping assistant knows about the shop: its public rules and how
 * the site works, in English and Bangla.
 *
 * Every figure is read from the config the site enforces (commerce.ts,
 * promotions.ts, contact.ts, pricing.ts), so it cannot drift from what checkout
 * does. Only public information belongs here - nothing private, nothing only an
 * administrator does, nothing about how the code works. The wording follows the
 * policy pages in client/src/pages.
 */

import {
  CANCELLED,
  DELIVERY,
  DELIVERY_DAYS,
  ORDER_STAGES,
  PAYMENT_METHODS,
  REFUND_WORKING_DAYS,
  RETURN_WINDOW_DAYS,
  SELLER_FEE_PERCENT,
  SELLER_LAST_STAGE,
  canCancel,
  type OrderStage,
} from '../../config/commerce.js';
import { MINIMUM_AGE, SHOP_LOCATION, SUPPORT_EMAIL } from '../../config/contact.js';
import { MAX_DISCOUNT_PERCENT } from '../../config/pricing.js';
import { PROMOTIONS } from '../../config/promotions.js';
import { bnDigits } from '../language.js';

export interface KnowledgeChunk {
  /** Kebab-case, unique. */
  id: string;
  topic:
    | 'delivery'
    | 'payment'
    | 'returns'
    | 'cancelling'
    | 'orders'
    | 'promotions'
    | 'selling'
    | 'payouts'
    | 'reviews'
    | 'wanted'
    | 'account'
    | 'privacy'
    | 'contact'
    | 'shopping'
    | 'about'
    | 'assistant';
  title: { en: string; bn: string };
  /** One to four short factual sentences, plain text. */
  text: { en: string; bn: string };
  /** A relative site path, optionally with an anchor. */
  link: string;
  /** Lowercase search terms: English, Bangla script and romanised Bangla. */
  keywords: string[];
}

/** The pages the assistant may link to, with their names. */
export const SITE_PAGES: readonly { path: string; en: string; bn: string }[] = [
  { path: '/', en: 'Home', bn: 'হোম' },
  { path: '/filter', en: 'All books', bn: 'সব বই' },
  { path: '/wanted', en: 'Wanted board', bn: 'চাহিদার বোর্ড' },
  { path: '/how-it-works', en: 'How it works', bn: 'যেভাবে কাজ করে' },
  { path: '/about', en: 'About', bn: 'আমাদের সম্পর্কে' },
  { path: '/contact', en: 'Contact', bn: 'যোগাযোগ' },
  { path: '/returns', en: 'Returns and refunds', bn: 'রিটার্ন ও টাকা ফেরত' },
  { path: '/terms', en: 'Terms of service', bn: 'সেবার শর্তাবলি' },
  { path: '/privacy', en: 'Privacy policy', bn: 'গোপনীয়তা নীতি' },
  { path: '/sign-in', en: 'Sign in', bn: 'সাইন ইন' },
  { path: '/sign-up', en: 'Create an account', bn: 'অ্যাকাউন্ট খুলুন' },
  { path: '/cart', en: 'Cart', bn: 'কার্ট' },
  { path: '/wishlist', en: 'Wishlist', bn: 'উইশলিস্ট' },
  { path: '/chat', en: 'Chat', bn: 'চ্যাট' },
  { path: '/notifications', en: 'Notifications', bn: 'নোটিফিকেশন' },
  { path: '/profile', en: 'Profile', bn: 'প্রোফাইল' },
  { path: '/update-profile', en: 'Edit profile', bn: 'প্রোফাইল সম্পাদনা' },
  { path: '/buyer/orders', en: 'My orders', bn: 'আমার অর্ডার' },
  { path: '/add-book', en: 'List a book', bn: 'বই তালিকাভুক্ত করুন' },
  { path: '/seller-books', en: 'My book list', bn: 'আমার বইয়ের তালিকা' },
  { path: '/seller-orders', en: 'Orders for my books', bn: 'আমার বইয়ের অর্ডার' },
];

/** The order stages in plain words, in the two languages. */
const STAGE_WORDS: Record<OrderStage, { en: string; bn: string; meaning: { en: string; bn: string } }> = {
  'Order Confirmed': {
    en: 'Order Confirmed',
    bn: 'অর্ডার নিশ্চিত',
    meaning: { en: 'your order is in and the seller has not started on it', bn: 'অর্ডার জমা হয়েছে, বিক্রেতা এখনো শুরু করেননি' },
  },
  Processing: {
    en: 'Processing',
    bn: 'প্রস্তুত হচ্ছে',
    meaning: { en: 'the seller is preparing the book', bn: 'বিক্রেতা বইটি প্রস্তুত করছেন' },
  },
  Shipped: {
    en: 'Shipped',
    bn: 'পাঠানো হয়েছে',
    meaning: { en: 'the seller has handed it to the courier', bn: 'বিক্রেতা বইটি কুরিয়ারের হাতে দিয়েছেন' },
  },
  'Out for Delivery': {
    en: 'Out for Delivery',
    bn: 'ডেলিভারির পথে',
    meaning: { en: 'the courier is bringing it to you', bn: 'কুরিয়ার বইটি আপনার কাছে আনছে' },
  },
  Delivered: {
    en: 'Delivered',
    bn: 'ডেলিভারি হয়েছে',
    meaning: { en: 'it has reached you', bn: 'বই আপনার কাছে পৌঁছেছে' },
  },
};

const bnList = (items: string[]): string => items.join('، ');

/** The stages a person may cancel in, per the shop's own rule. */
const cancellable = (who: 'buyer' | 'seller' | 'admin'): OrderStage[] =>
  ORDER_STAGES.filter((stage) => canCancel(who, stage));

/** Whether a promotion is running now. */
const running = (promo: { startsAt?: Date; endsAt?: Date }, now: Date): boolean =>
  (!promo.startsAt || now >= promo.startsAt) && (!promo.endsAt || now <= promo.endsAt);

/** Built when called, from the shop's own config, so the figures always match what the site enforces. */
export const knowledgeBase = (): KnowledgeChunk[] => {
  const d = DELIVERY;
  const days = DELIVERY_DAYS;
  const b = bnDigits;
  const payment = PAYMENT_METHODS[0];
  const buyerStages = cancellable('buyer');
  const sellerStages = cancellable('seller');
  const adminStages = cancellable('admin');
  const lastSellerStage = STAGE_WORDS[SELLER_LAST_STAGE];
  const lastAdminStage = STAGE_WORDS[adminStages[adminStages.length - 1] ?? 'Delivered'];
  const now = new Date();
  const freeDeliveryPromo = PROMOTIONS.find((promo) => promo.discount.kind === 'free-delivery' && running(promo, now));

  const promoChunks: KnowledgeChunk[] = PROMOTIONS.filter((promo) => running(promo, now)).map((promo) => {
    const minEn = promo.minBooksTotal ? ` It needs books worth at least ${promo.minBooksTotal} Tk.` : '';
    const minBn = promo.minBooksTotal ? ` অন্তত ${b(promo.minBooksTotal)} টাকার বই লাগবে।` : '';
    const firstEn = promo.firstOrderOnly ? ' It works on your first order only.' : '';
    const firstBn = promo.firstOrderOnly ? ' এটি শুধু প্রথম অর্ডারে কাজ করে।' : '';
    return {
      id: `promo-${promo.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      topic: 'promotions',
      title: { en: `Promo code ${promo.code}`, bn: `প্রোমো কোড ${promo.code}` },
      text: {
        en: `Code ${promo.code}: ${promo.description}.${minEn}${firstEn} Enter it at checkout.`,
        bn: `কোড ${promo.code}: ${promo.descriptionBn ?? promo.description}।${minBn}${firstBn} চেকআউটে কোডটি দিন।`,
      },
      link: '/terms#promo-codes',
      keywords: [
        promo.code.toLowerCase(),
        'promo code',
        'coupon',
        'voucher',
        'discount code',
        'প্রোমো কোড',
        'কোড',
        'ছাড়',
        'কুপন',
        'code koto',
        'chhar',
        ...(promo.firstOrderOnly ? ['first order', 'প্রথম অর্ডার', 'prothom order'] : []),
        ...(promo.discount.kind === 'free-delivery' ? ['free delivery', 'ফ্রি ডেলিভারি', 'free delivery code'] : []),
      ],
    };
  });

  return [
    // ------------------------------------------------------------ delivery
    {
      id: 'delivery-charge',
      topic: 'delivery',
      title: { en: 'Delivery charge', bn: 'ডেলিভারি চার্জ' },
      text: {
        en: `Delivery costs ${d.insideDhaka} Tk inside Dhaka and ${d.outsideDhaka} Tk everywhere else in Bangladesh. You see the charge at checkout before you order.`,
        bn: `ডেলিভারি চার্জ ঢাকার ভেতরে ${b(d.insideDhaka)} টাকা, আর বাংলাদেশের অন্য সব জায়গায় ${b(d.outsideDhaka)} টাকা। অর্ডারের আগে চেকআউটেই চার্জ দেখতে পাবেন।`,
      },
      link: '/terms#delivery',
      keywords: [
        'delivery charge', 'delivery cost', 'shipping cost', 'shipping fee', 'delivery fee', 'ডেলিভারি চার্জ',
        'ডেলিভারি খরচ', 'delivery koto', 'delivery charge koto', 'courier charge', 'taka',
      ],
    },
    {
      id: 'delivery-time',
      topic: 'delivery',
      title: { en: 'How long delivery takes', bn: 'ডেলিভারিতে কত দিন লাগে' },
      text: {
        en: `Orders arrive within ${days.insideDhaka} working days inside Dhaka and ${days.outsideDhaka} working days elsewhere, counted from the order. Orders are sent by courier.`,
        bn: `অর্ডার করার পর ঢাকার ভেতরে ${b(days.insideDhaka)} কর্মদিবসে এবং অন্যত্র ${b(days.outsideDhaka)} কর্মদিবসে বই পৌঁছায়। অর্ডার কুরিয়ারে পাঠানো হয়।`,
      },
      link: '/terms#delivery',
      keywords: [
        'delivery time', 'how long', 'when will it arrive', 'working days', 'delivery days', 'কত দিন', 'কর্মদিবস',
        'কবে পাব', 'koto din', 'kobe pabo', 'delivery koto din', 'courier', 'কুরিয়ার',
      ],
    },
    {
      id: 'delivery-inside-outside-dhaka',
      topic: 'delivery',
      title: { en: 'Inside and outside Dhaka', bn: 'ঢাকার ভেতরে ও বাইরে' },
      text: {
        en: `"Inside Dhaka" means Dhaka district, not the whole division. An address in Dhaka district pays ${d.insideDhaka} Tk; any other district pays ${d.outsideDhaka} Tk.`,
        bn: `"ঢাকার ভেতরে" বলতে ঢাকা জেলা বোঝায়, পুরো বিভাগ নয়। ঢাকা জেলার ঠিকানায় ${b(d.insideDhaka)} টাকা, অন্য যেকোনো জেলায় ${b(d.outsideDhaka)} টাকা।`,
      },
      link: '/terms#delivery',
      keywords: [
        'inside dhaka', 'outside dhaka', 'dhaka district', 'dhaka division', 'ঢাকার ভেতরে', 'ঢাকার বাইরে', 'ঢাকা জেলা',
        'dhakar bhitore', 'dhakar baire', 'gazipur', 'district',
      ],
    },
    {
      id: 'delivery-free',
      topic: 'delivery',
      title: { en: 'Free delivery', bn: 'ফ্রি ডেলিভারি' },
      text: freeDeliveryPromo
        ? {
            en: `${freeDeliveryPromo.description} with the code ${freeDeliveryPromo.code}. Delivery is otherwise ${d.insideDhaka} Tk inside Dhaka and ${d.outsideDhaka} Tk elsewhere.`,
            bn: `${freeDeliveryPromo.code} কোড দিলে ${freeDeliveryPromo.descriptionBn ?? freeDeliveryPromo.description}। না হলে ডেলিভারি ঢাকার ভেতরে ${b(d.insideDhaka)} টাকা, অন্যত্র ${b(d.outsideDhaka)} টাকা।`,
          }
        : {
            en: `Delivery is not free right now: it costs ${d.insideDhaka} Tk inside Dhaka and ${d.outsideDhaka} Tk elsewhere.`,
            bn: `এখন ডেলিভারি ফ্রি নয়: ঢাকার ভেতরে ${b(d.insideDhaka)} টাকা, অন্যত্র ${b(d.outsideDhaka)} টাকা।`,
          },
      link: '/terms#promo-codes',
      keywords: [
        'free delivery', 'free shipping', 'delivery free', 'ফ্রি ডেলিভারি', 'free delivery code', 'free delivery kobe',
        'delivery free hobe', 'ডেলিভারি ফ্রি',
      ],
    },

    // ------------------------------------------------------------- payment
    {
      id: 'payment-cash-on-delivery',
      topic: 'payment',
      title: { en: 'How to pay', bn: 'কীভাবে টাকা দেবেন' },
      text: {
        en: `${payment} is the only way to pay: you give the courier cash when your books arrive. Nothing is paid online, and the price you see at checkout includes delivery.`,
        bn: `টাকা দেওয়ার একমাত্র উপায় ক্যাশ অন ডেলিভারি: বই পৌঁছালে কুরিয়ারকে নগদে টাকা দেন। অনলাইনে কিছুই দিতে হয় না, আর চেকআউটের দামে ডেলিভারি চার্জও ধরা থাকে।`,
      },
      link: '/how-it-works',
      keywords: [
        'payment', 'pay', 'cash on delivery', 'cod', 'bkash payment', 'card', 'online payment', 'পেমেন্ট',
        'ক্যাশ অন ডেলিভারি', 'টাকা দেব', 'taka kivabe debo', 'payment method', 'nogod', 'নগদ',
      ],
    },

    // ---------------------------------------------------------- promotions
    ...promoChunks,
    {
      id: 'promo-how-to-apply',
      topic: 'promotions',
      title: { en: 'Using a promo code', bn: 'প্রোমো কোড ব্যবহার' },
      text: {
        en: 'Type the code in the promo box at checkout. You can use one code per order, and the discount is shown before you confirm. If a code does not fit your order, you are told why.',
        bn: 'চেকআউটে প্রোমো বক্সে কোডটি লিখুন। প্রতি অর্ডারে একটি কোড ব্যবহার করা যায়, আর নিশ্চিত করার আগেই ছাড় দেখানো হয়। কোড অর্ডারের সঙ্গে না মিললে কারণ জানানো হয়।',
      },
      link: '/terms#promo-codes',
      keywords: [
        'apply code', 'promo code', 'coupon', 'one code per order', 'code not working', 'প্রোমো কোড', 'কোড কাজ করছে না',
        'code kothay debo', 'কোড কোথায় দেব', 'discount', 'ছাড়',
      ],
    },
    {
      id: 'promo-seller-discounts',
      topic: 'promotions',
      title: { en: 'Quick deals', bn: 'চটজলদি ছাড়' },
      text: {
        en: `Sellers can discount their own books, up to ${MAX_DISCOUNT_PERCENT}% off. Quick deals lists every discounted book, the biggest share off first.`,
        bn: `বিক্রেতারা নিজের বইয়ে ${b(MAX_DISCOUNT_PERCENT)}% পর্যন্ত ছাড় দিতে পারেন। চটজলদি ছাড়-এ ছাড় পাওয়া সব বই দেখা যায়, সবচেয়ে বড় ছাড় আগে।`,
      },
      link: '/filter?deals=1&sort=dealPercent',
      keywords: [
        'quick deals', 'deals', 'discount', 'offer', 'sale', 'cheap books', 'চটজলদি ছাড়', 'ছাড়', 'অফার',
        'chhar', 'offer ache', 'discount book', 'max discount', 'maximum discount', 'seller discount',
        'discount limit', 'how much discount', 'set a discount', 'সর্বোচ্চ ছাড়', 'কত ছাড়', 'ছাড় দিতে', 'koto chhar',
      ],
    },

    // -------------------------------------------------------------- orders
    {
      id: 'order-stages',
      topic: 'orders',
      title: { en: 'Order stages', bn: 'অর্ডারের ধাপ' },
      text: {
        en: `An order moves through: ${ORDER_STAGES.map((s) => `${STAGE_WORDS[s].en} (${STAGE_WORDS[s].meaning.en})`).join('; ')}. A called-off order shows as ${CANCELLED}.`,
        bn: `অর্ডার এই ধাপগুলো পার হয়: ${ORDER_STAGES.map((s) => `${STAGE_WORDS[s].bn} (${STAGE_WORDS[s].meaning.bn})`).join('; ')}। বাতিল অর্ডার "বাতিল" দেখায়।`,
      },
      link: '/buyer/orders',
      keywords: [
        'order status', 'order stages', 'order confirmed', 'processing', 'shipped', 'out for delivery', 'delivered',
        'অর্ডারের অবস্থা', 'অর্ডার স্ট্যাটাস', 'order status ki', 'order kothay',
      ],
    },
    {
      id: 'order-tracking',
      topic: 'orders',
      title: { en: 'Tracking an order', bn: 'অর্ডারের খবর রাখা' },
      text: {
        en: 'Sign in and open My orders to see where each order has got to. Every step also shows in your notifications, and you can download an order as a PDF.',
        bn: 'সাইন ইন করে আমার অর্ডার খুললে প্রতিটি অর্ডার কোন ধাপে আছে দেখা যায়। প্রতিটি ধাপ নোটিফিকেশনেও আসে, আর অর্ডার PDF হিসেবে ডাউনলোড করা যায়।',
      },
      link: '/buyer/orders',
      keywords: [
        'track order', 'order tracking', 'where is my order', 'my orders', 'order status', 'অর্ডার ট্র্যাক', 'আমার অর্ডার',
        'order track korbo', 'amar order kothay', 'order pdf', 'invoice', 'অর্ডার কোথায়',
      ],
    },

    // ----------------------------------------------------------- cancelling
    {
      id: 'cancelling-buyer',
      topic: 'cancelling',
      title: { en: 'Cancelling your order', bn: 'অর্ডার বাতিল করা' },
      text: {
        en: `You can cancel from My orders only while the order is "${buyerStages.map((s) => STAGE_WORDS[s].en).join('" or "')}", before a seller starts on it. After that, message the seller, or ask for a return once it arrives.`,
        bn: `আমার অর্ডার থেকে আপনি শুধু তখনই বাতিল করতে পারেন, যখন অর্ডার "${bnList(buyerStages.map((s) => STAGE_WORDS[s].bn))}" অবস্থায়, অর্থাৎ বিক্রেতা শুরু করার আগে। এরপর বিক্রেতাকে মেসেজ দিন, অথবা বই পৌঁছালে রিটার্নের অনুরোধ করুন।`,
      },
      link: '/terms#cancelling',
      keywords: [
        'cancel order', 'cancel', 'cancellation', 'cancel my order', 'অর্ডার বাতিল', 'বাতিল', 'cancel korbo',
        'order cancel korbo', 'batil', 'change my mind',
      ],
    },
    {
      id: 'cancelling-who-and-when',
      topic: 'cancelling',
      title: { en: 'Who can cancel, and until when', bn: 'কে কখন পর্যন্ত বাতিল করতে পারে' },
      text: {
        en: `A buyer can cancel while the order is ${STAGE_WORDS[buyerStages[buyerStages.length - 1] ?? 'Order Confirmed'].en}. A seller can cancel their books until they are ${lastSellerStage.en} (that is, while ${sellerStages.map((s) => STAGE_WORDS[s].en).join(', ')}). The shop can cancel until the order is ${lastAdminStage.en}. If a seller cancels part of an order, you pay only for the books left.`,
        bn: `ক্রেতা বাতিল করতে পারেন অর্ডার "${STAGE_WORDS[buyerStages[buyerStages.length - 1] ?? 'Order Confirmed'].bn}" থাকা পর্যন্ত। বিক্রেতা তাঁর বই "${lastSellerStage.bn}" হওয়ার আগ পর্যন্ত বাতিল করতে পারেন (অর্থাৎ ${bnList(sellerStages.map((s) => STAGE_WORDS[s].bn))} থাকা পর্যন্ত)। শপ অর্ডার "${lastAdminStage.bn}" হওয়ার আগ পর্যন্ত বাতিল করতে পারে। বিক্রেতা অর্ডারের একটি অংশ বাতিল করলে আপনি শুধু বাকি বইয়ের দাম দেন।`,
      },
      link: '/terms#cancelling',
      keywords: [
        'who can cancel', 'seller cancel', 'seller cancelled my order', 'partial cancel', 'cancel after shipped',
        'কে বাতিল করতে পারে', 'বিক্রেতা বাতিল', 'cancel kokhon', 'shipped hoye gele cancel', 'after shipped',
      ],
    },

    // ------------------------------------------------------------- returns
    {
      id: 'returns-window',
      topic: 'returns',
      title: { en: 'Return window', bn: 'রিটার্নের সময়সীমা' },
      text: {
        en: `You can ask for a return within ${RETURN_WINDOW_DAYS} days of delivery. The days count from when the order is marked delivered, not from when you ordered, and My orders shows the last day for each book.`,
        bn: `ডেলিভারির ${b(RETURN_WINDOW_DAYS)} দিনের মধ্যে রিটার্নের অনুরোধ করা যায়। দিন গোনা শুরু হয় অর্ডার ডেলিভারি হয়েছে বলে চিহ্নিত হওয়ার সময় থেকে, অর্ডার দেওয়ার সময় থেকে নয়; আমার অর্ডারে প্রতিটি বইয়ের শেষ দিন দেখানো থাকে।`,
      },
      link: '/returns',
      keywords: [
        'return window', 'return policy', 'how many days to return', 'return', 'returns', 'রিটার্ন', 'ফেরত',
        'ferot', 'ferot dite parbo', 'koto din e ferot', 'ফেরত দেওয়া', 'send back',
      ],
    },
    {
      id: 'returns-how-to',
      topic: 'returns',
      title: { en: 'How to ask for a return', bn: 'কীভাবে রিটার্নের অনুরোধ করবেন' },
      text: {
        en: 'Open My orders and choose Return on the book. Describe the problem, add at least one photo (up to ten), and give the bKash number for the refund. Your request stays pending until it is reviewed, then it is approved or rejected.',
        bn: 'আমার অর্ডার খুলে সংশ্লিষ্ট বইয়ে "ফেরত দিন" বেছে নিন। সমস্যাটি বর্ণনা করুন, অন্তত একটি ছবি দিন (সর্বোচ্চ ১০টি), আর টাকা ফেরতের জন্য বিকাশ নম্বর দিন। যাচাই না হওয়া পর্যন্ত অনুরোধ অপেক্ষমাণ থাকে, তারপর অনুমোদিত বা প্রত্যাখ্যাত হয়।',
      },
      link: '/returns',
      keywords: [
        'request a return', 'how to return', 'return a book', 'return request', 'return photo', 'রিটার্নের অনুরোধ',
        'কীভাবে ফেরত', 'ferot korbo', 'return korbo', 'book ferot', 'ferot kivabe', 'রিটার্ন করতে', 'রিটার্ন',
        'ফেরত দিতে', 'কী লাগবে', 'what do i need to return', 'return korte', 'return er jonno',
      ],
    },
    {
      id: 'returns-refund',
      topic: 'returns',
      title: { en: 'Refunds', bn: 'টাকা ফেরত' },
      text: {
        en: `An approved return is refunded to your bKash number within ${REFUND_WORKING_DAYS} working days of the book reaching the shop. The delivery charge you paid on the original order is not refunded; the shop pays the courier for sending the book back.`,
        bn: `অনুমোদিত রিটার্নের টাকা বইটি শপে পৌঁছানোর ${b(REFUND_WORKING_DAYS)} কর্মদিবসের মধ্যে আপনার বিকাশ নম্বরে ফেরত যায়। মূল অর্ডারে দেওয়া ডেলিভারি চার্জ ফেরত হয় না; বই ফেরত পাঠানোর কুরিয়ার খরচ শপ দেয়।`,
      },
      link: '/returns',
      keywords: [
        'refund', 'money back', 'refund bkash', 'refund time', 'delivery charge refund', 'টাকা ফেরত', 'রিফান্ড',
        'refund koto din', 'taka ferot', 'bkash e taka ferot', 'টাকা কবে ফেরত',
      ],
    },
    {
      id: 'returns-what-qualifies',
      topic: 'returns',
      title: { en: 'When a return is fair', bn: 'কখন রিটার্ন করা যায়' },
      text: {
        en: 'A return is fitting when the book is damaged beyond the condition described, has missing pages, or is the wrong title, edition or format. Ordinary wear that matches the stated condition of a second-hand book is not a fault.',
        bn: 'বই বর্ণনার চেয়ে বেশি ক্ষতিগ্রস্ত হলে, পাতা না থাকলে, বা ভুল বই, সংস্করণ বা ফরম্যাট এলে রিটার্ন উপযুক্ত। পুরোনো বইয়ের উল্লেখ করা অবস্থার সঙ্গে মেলে এমন সাধারণ ব্যবহারের ছাপ কোনো ত্রুটি নয়।',
      },
      link: '/returns',
      keywords: [
        'damaged book', 'defective', 'not as described', 'wrong book', 'missing pages', 'wrong edition', 'ক্ষতিগ্রস্ত বই',
        'ভুল বই', 'পাতা নেই', 'boi nosto', 'bhul boi', 'boi ta bhalo na', 'condition',
      ],
    },
    {
      id: 'returns-not-arrived',
      topic: 'returns',
      title: { en: 'Order has not arrived', bn: 'অর্ডার না পৌঁছালে' },
      text: {
        en: `An order that never arrived is not a return. E-mail ${SUPPORT_EMAIL} with the order number and the shop will chase it. If a return decision seems wrong, e-mail the same address with the order number.`,
        bn: `যে অর্ডার একেবারেই পৌঁছায়নি, সেটি রিটার্ন নয়। অর্ডার নম্বরসহ ${SUPPORT_EMAIL} ঠিকানায় ই-মেইল করুন, শপ খোঁজ নেবে। রিটার্নের সিদ্ধান্ত ভুল মনে হলেও অর্ডার নম্বরসহ একই ঠিকানায় লিখুন।`,
      },
      link: '/returns',
      keywords: [
        'order not arrived', 'not delivered', 'missing order', 'late order', 'order late', 'অর্ডার পৌঁছায়নি', 'পাইনি',
        'order pai nai', 'order ashe nai', 'delivery hoy nai', 'decision wrong',
      ],
    },

    // ------------------------------------------------------------- selling
    {
      id: 'selling-start',
      topic: 'selling',
      title: { en: 'Selling a book', bn: 'বই বিক্রি করা' },
      text: {
        en: 'Anyone with an account can list books for sale. Add photos, the title and author, and an honest condition for a second-hand copy; you set the price and the stock. You can change the stock any time from your book list.',
        bn: 'অ্যাকাউন্ট থাকলে যে কেউ বই বিক্রির জন্য তালিকাভুক্ত করতে পারেন। ছবি, বইয়ের নাম ও লেখক দিন, পুরোনো কপি হলে সৎভাবে অবস্থা লিখুন; দাম ও স্টক আপনিই ঠিক করেন। বইয়ের তালিকা থেকে যেকোনো সময় স্টক বদলানো যায়।',
      },
      link: '/add-book',
      keywords: [
        'sell a book', 'sell books', 'list a book', 'become a seller', 'add book', 'বই বিক্রি', 'বই তালিকাভুক্ত',
        'boi bikri', 'boi becbo', 'kivabe boi becbo', 'seller hobo', 'বিক্রেতা',
      ],
    },
    {
      id: 'selling-fee',
      topic: 'selling',
      title: { en: 'Selling fees', bn: 'বিক্রির ফি' },
      text: {
        en: `Listing a book is free. When a book sells, the shop keeps ${SELLER_FEE_PERCENT}% of the order's book total (price times quantity, not counting delivery) and the rest is the seller's.`,
        bn: `বই তালিকাভুক্ত করতে কোনো খরচ নেই। বই বিক্রি হলে শপ অর্ডারের বইয়ের মোট দামের (দাম গুণ পরিমাণ, ডেলিভারি বাদে) ${b(SELLER_FEE_PERCENT)}% ফি রাখে, বাকিটা বিক্রেতার।`,
      },
      link: '/terms#getting-paid',
      keywords: [
        'seller fee', 'commission', 'listing fee', 'fee', 'charges for sellers', 'বিক্রির ফি', 'কমিশন', 'ফি',
        'commission koto', 'fee koto', 'listing free', 'কত কাটে',
      ],
    },
    {
      id: 'selling-bkash-number',
      topic: 'selling',
      title: { en: 'bKash merchant number', bn: 'বিকাশ মার্চেন্ট নম্বর' },
      text: {
        en: 'Before you can list a book, add your bKash merchant number to your seller profile. That is where your sales are paid. You can change the number any time.',
        bn: 'বই তালিকাভুক্ত করার আগে আপনার বিক্রেতা প্রোফাইলে বিকাশ মার্চেন্ট নম্বর যোগ করতে হয়। আপনার বিক্রির টাকা ওই নম্বরেই যায়। নম্বরটি যেকোনো সময় বদলানো যায়।',
      },
      link: '/update-profile?mode=seller#bkash',
      keywords: [
        'bkash merchant number', 'bkash number', 'seller bkash', 'payout number', 'বিকাশ মার্চেন্ট', 'বিকাশ নম্বর',
        'bkash number dite hobe', 'bkash merchant', 'cannot list book', 'বই তোলা যাচ্ছে না',
      ],
    },
    {
      id: 'selling-order-steps',
      topic: 'selling',
      title: { en: 'What a seller does with an order', bn: 'অর্ডার এলে বিক্রেতা কী করেন' },
      text: {
        en: `A seller moves an order forward up to ${lastSellerStage.en}. ${STAGE_WORDS['Out for Delivery'].en} and ${STAGE_WORDS.Delivered.en} are set by the shop. The stock is reserved when someone orders, so a copy cannot be sold twice.`,
        bn: `বিক্রেতা অর্ডার "${lastSellerStage.bn}" পর্যন্ত এগিয়ে দিতে পারেন। "${STAGE_WORDS['Out for Delivery'].bn}" ও "${STAGE_WORDS.Delivered.bn}" শপ ঠিক করে। কেউ অর্ডার দিলে স্টক সংরক্ষিত হয়, তাই একই কপি দুবার বিক্রি হয় না।`,
      },
      link: '/seller-orders',
      keywords: [
        'seller order', 'mark shipped', 'update order status', 'seller orders', 'ship order', 'বিক্রেতার অর্ডার',
        'পাঠানো হয়েছে', 'order ashle ki korbo', 'shipped korbo', 'seller status',
      ],
    },
    {
      id: 'selling-seller-shop',
      topic: 'selling',
      title: { en: 'Seller shops', bn: 'বিক্রেতার শপ' },
      text: {
        en: "Every seller has a shop page showing their books, sales and rating, at /shop/ followed by their username. Sellers can add a banner and a picture to make it their own.",
        bn: 'প্রতিটি বিক্রেতার একটি শপের পাতা আছে, যেখানে তাঁর বই, বিক্রি ও রেটিং দেখা যায়। ঠিকানা /shop/ এর পরে তাঁর ইউজারনেম। ব্যানার ও ছবি যোগ করে শপকে নিজের মতো সাজানো যায়।',
      },
      link: '/how-it-works',
      keywords: [
        'seller shop', 'shop page', 'visit shop', 'seller profile', 'seller banner', 'বিক্রেতার শপ', 'শপ',
        'shop dekhbo', 'seller er shop', 'dokan', 'দোকান',
      ],
    },

    // ------------------------------------------------------------- payouts
    {
      id: 'payouts-when',
      topic: 'payouts',
      title: { en: 'When sellers are paid', bn: 'বিক্রেতারা কখন টাকা পান' },
      text: {
        en: `A seller is paid by bKash, with the transaction ID, once the buyer's ${RETURN_WINDOW_DAYS}-day return window has closed and no return is pending. That way money is never sent and then taken back. The order page shows where each payment stands.`,
        bn: `ক্রেতার ${b(RETURN_WINDOW_DAYS)} দিনের ফেরতের সময়সীমা শেষ হলে এবং কোনো রিটার্ন অপেক্ষায় না থাকলে বিক্রেতা ট্রানজ্যাকশন আইডিসহ বিকাশে টাকা পান। এতে টাকা পাঠিয়ে আবার ফেরত নিতে হয় না। অর্ডারের পাতায় প্রতিটি পেমেন্টের অবস্থা দেখা যায়।`,
      },
      link: '/terms#getting-paid',
      keywords: [
        'seller payout', 'when do sellers get paid', 'get paid', 'payout', 'payment to seller', 'টাকা পাওয়া', 'পেআউট',
        'taka kobe pabo', 'seller taka', 'bkash e taka', 'টাকা কবে পাব',
      ],
    },
    {
      id: 'payouts-returned-books',
      topic: 'payouts',
      title: { en: 'Returned books and payouts', bn: 'ফেরত আসা বই ও পাওনা' },
      text: {
        en: 'A book that is returned is not paid for, and no fee is taken on it. A cancelled book was never sent, so nothing is owed for it either.',
        bn: 'ফেরত আসা বইয়ের জন্য টাকা দেওয়া হয় না, আর তার ওপর কোনো ফিও নেওয়া হয় না। বাতিল বই কখনো পাঠানো হয়নি, তাই তারও কোনো পাওনা থাকে না।',
      },
      link: '/terms#getting-paid',
      keywords: [
        'returned book payout', 'return payout', 'cancelled order payout', 'fee on return', 'ফেরত বইয়ের টাকা',
        'ferot boi taka', 'return hole taka', 'payout return',
      ],
    },

    // ------------------------------------------------------------- reviews
    {
      id: 'reviews-who',
      topic: 'reviews',
      title: { en: 'Who can review', bn: 'কে রিভিউ দিতে পারেন' },
      text: {
        en: 'You can review a book, and rate the seller you bought it from, once your order has been delivered. You cannot review your own books or rate your own shop.',
        bn: 'অর্ডার ডেলিভারি হয়ে গেলে আপনি বইয়ের রিভিউ দিতে পারেন এবং যে বিক্রেতার কাছ থেকে কিনেছেন তাঁকে রেটিং দিতে পারেন। নিজের বইয়ের রিভিউ বা নিজের শপের রেটিং দেওয়া যায় না।',
      },
      link: '/terms#reviews',
      keywords: [
        'review', 'reviews', 'rate seller', 'rating', 'write a review', 'who can review', 'রিভিউ', 'রেটিং',
        'review dibo', 'review kivabe', 'rating dibo', 'রিভিউ দেব',
      ],
    },
    {
      id: 'reviews-trust',
      topic: 'reviews',
      title: { en: 'Trusting a seller', bn: 'বিক্রেতাকে বিশ্বাস করা' },
      text: {
        en: 'Every seller is rated by people whose orders from them were delivered, and every book review comes from a buyer who received the book. You can also chat with a seller before you buy.',
        bn: 'প্রতিটি বিক্রেতাকে রেটিং দেন তাঁরা, যাঁদের অর্ডার ওই বিক্রেতার কাছ থেকে ডেলিভারি হয়েছে, আর প্রতিটি বইয়ের রিভিউ আসে এমন ক্রেতার কাছ থেকে, যিনি বইটি হাতে পেয়েছেন। কেনার আগে বিক্রেতার সঙ্গে চ্যাটও করতে পারেন।',
      },
      link: '/how-it-works',
      keywords: [
        'trust seller', 'seller rating', 'is seller safe', 'reliable seller', 'fake review', 'বিক্রেতা বিশ্বাস', 'বিক্রেতার রেটিং',
        'seller bhalo ki', 'seller trust', 'বিশ্বাসযোগ্য',
      ],
    },
    {
      id: 'reviews-report',
      topic: 'reviews',
      title: { en: 'Reporting a review', bn: 'রিভিউ রিপোর্ট করা' },
      text: {
        en: 'If a review or rating looks wrong or abusive, use its Report button. An administrator will look at it.',
        bn: 'কোনো রিভিউ বা রেটিং ভুল বা আপত্তিকর মনে হলে তার "রিপোর্ট" বোতাম ব্যবহার করুন। একজন অ্যাডমিন সেটি দেখবেন।',
      },
      link: '/terms#reviews',
      keywords: [
        'report review', 'abusive review', 'fake review report', 'report rating', 'রিভিউ রিপোর্ট', 'আপত্তিকর রিভিউ',
        'review report korbo', 'bad review', 'report',
      ],
    },

    // -------------------------------------------------------------- wanted
    {
      id: 'wanted-board',
      topic: 'wanted',
      title: { en: 'Wanted board', bn: 'চাহিদার বোর্ড' },
      text: {
        en: 'Cannot find a book? Ask for it on the Wanted board with its title, and optionally the author or ISBN. The moment anyone lists it, you hear about it in the app and by e-mail. Other readers can add "I want this too".',
        bn: 'বই খুঁজে না পেলে চাহিদার বোর্ডে নাম দিয়ে চেয়ে রাখুন, চাইলে লেখক বা ISBN-ও দিন। কেউ তালিকাভুক্ত করলেই অ্যাপে ও ই-মেইলে জানতে পারবেন। অন্য পাঠকেরা "আমিও চাই" জানাতে পারেন।',
      },
      link: '/wanted',
      keywords: [
        'wanted board', 'request a book', 'book not listed', 'cannot find book', 'ask for a book', 'চাহিদার বোর্ড',
        'বই চান', 'boi pacchi na', 'boi khuje pai na', 'boi chai', 'বই খুঁজে পাচ্ছি না', 'wanted',
      ],
    },
    {
      id: 'wanted-for-sellers',
      topic: 'wanted',
      title: { en: 'Wanted board for sellers', bn: 'বিক্রেতাদের জন্য চাহিদার বোর্ড' },
      text: {
        en: 'Sellers can check the Wanted board for books readers already want, then list a copy. A request is marked found once the book is listed.',
        bn: 'বিক্রেতারা চাহিদার বোর্ডে দেখে নিতে পারেন পাঠকেরা কোন বই চাইছেন, তারপর একটি কপি তালিকাভুক্ত করতে পারেন। বই তালিকাভুক্ত হলে অনুরোধ "পাওয়া গেছে" চিহ্নিত হয়।',
      },
      link: '/wanted',
      keywords: [
        'what to sell', 'books in demand', 'readers want', 'have it list it', 'demand', 'চাহিদা', 'কী বিক্রি করব',
        'ki becbo', 'chahida', 'wanted list',
      ],
    },

    // ------------------------------------------------------------ shopping
    {
      id: 'shopping-search',
      topic: 'shopping',
      title: { en: 'Searching for a book', bn: 'বই খোঁজা' },
      text: {
        en: 'Search by title, author or ISBN, in Bangla or English; either spelling works, so "pather panchali" finds পথের পাঁচালী. Suggestions appear as you type, and you can speak your search with the microphone.',
        bn: 'বইয়ের নাম, লেখক বা ISBN দিয়ে বাংলায় বা ইংরেজিতে খুঁজুন; যেকোনো বানানেই কাজ করে, তাই "pather panchali" লিখলেও পথের পাঁচালী পাওয়া যায়। লেখার সময়েই পরামর্শ দেখা যায়, আর মাইক্রোফোনে বলেও খোঁজা যায়।',
      },
      link: '/filter',
      keywords: [
        'search', 'find a book', 'search by isbn', 'search by author', 'bangla search', 'খোঁজা', 'বই খুঁজুন',
        'boi khujbo', 'boi khuji', 'search korbo', 'isbn', 'লেখক', 'voice search',
      ],
    },
    {
      id: 'shopping-filters',
      topic: 'shopping',
      title: { en: 'Categories and filters', bn: 'ধরন ও ছাঁকনি' },
      text: {
        en: 'On the All books page, filter by category, new or second-hand, condition, price, rating and stock. Choose New books, Second-hand books or In stock to narrow the list quickly.',
        bn: 'সব বই পাতায় ধরন, নতুন না পুরোনো, অবস্থা, দাম, রেটিং ও স্টক দিয়ে ছাঁকা যায়। তালিকা ছোট করতে নতুন বই, পুরোনো বই বা স্টকে আছে বেছে নিন।',
      },
      link: '/filter',
      keywords: [
        'category', 'categories', 'filter', 'new books', 'second-hand books', 'used books', 'condition', 'price filter',
        'ধরন', 'ক্যাটাগরি', 'নতুন বই', 'পুরোনো বই', 'puraton boi', 'notun boi', 'category dekhbo',
      ],
    },
    {
      id: 'shopping-cart',
      topic: 'shopping',
      title: { en: 'Cart and checkout', bn: 'কার্ট ও চেকআউট' },
      text: {
        en: 'Add books to your cart, then check out with your delivery address and phone number. You can leave the seller a note, such as a good time to deliver. Sellers cannot buy their own books.',
        bn: 'বই কার্টে যোগ করুন, তারপর ডেলিভারির ঠিকানা ও ফোন নম্বর দিয়ে চেকআউট করুন। বিক্রেতার জন্য নোট রাখা যায়, যেমন ডেলিভারির সুবিধাজনক সময়। বিক্রেতা নিজের বই কিনতে পারেন না।',
      },
      link: '/cart',
      keywords: [
        'cart', 'checkout', 'place order', 'how to order', 'buy a book', 'add to cart', 'কার্ট', 'চেকআউট', 'অর্ডার করব',
        'order korbo', 'kivabe order', 'kinbo', 'কিনব', 'ঠিকানা',
      ],
    },
    {
      id: 'shopping-wishlist',
      topic: 'shopping',
      title: { en: 'Wishlist', bn: 'উইশলিস্ট' },
      text: {
        en: 'Save books you like to your wishlist and come back to them later. Wishlists also show sellers how wanted a book is.',
        bn: 'পছন্দের বই উইশলিস্টে রেখে পরে ফিরে আসতে পারেন। কতজন উইশলিস্টে রেখেছেন, তা থেকে বিক্রেতারা বইটির চাহিদা বুঝতে পারেন।',
      },
      link: '/wishlist',
      keywords: [
        'wishlist', 'save for later', 'favourite books', 'favorites', 'উইশলিস্ট', 'পছন্দের বই',
        'wishlist e rakhbo', 'pochonder boi', 'save book',
      ],
    },
    {
      id: 'shopping-chat',
      topic: 'shopping',
      title: { en: 'Chatting with a seller', bn: 'বিক্রেতার সঙ্গে চ্যাট' },
      text: {
        en: "Message a seller from the book's page before you buy; they know the condition of their copy best. Your conversations are in Chat.",
        bn: 'কেনার আগে বইয়ের পাতা থেকে বিক্রেতাকে মেসেজ দিন; নিজের কপির অবস্থা তিনিই সবচেয়ে ভালো জানেন। আপনার কথোপকথন চ্যাটে থাকে।',
      },
      link: '/chat',
      keywords: [
        'chat', 'message seller', 'ask seller', 'contact seller', 'seller message', 'চ্যাট', 'মেসেজ',
        'seller ke message', 'chat korbo', 'seller er sathe kotha', 'বিক্রেতাকে মেসেজ',
      ],
    },

    // ------------------------------------------------------------- account
    {
      id: 'account-notifications',
      topic: 'account',
      title: { en: 'Notifications', bn: 'নোটিফিকেশন' },
      text: {
        en: 'Order steps, replies and wanted-book news reach you as notifications in the app and by e-mail. In your profile you can switch each kind on or off, in the app and by e-mail.',
        bn: 'অর্ডারের ধাপ, উত্তর ও চাওয়া বইয়ের খবর অ্যাপে নোটিফিকেশন ও ই-মেইলে আসে। প্রোফাইলে প্রতিটি ধরন অ্যাপে ও ই-মেইলে চালু বা বন্ধ করা যায়।',
      },
      link: '/notifications',
      keywords: [
        'notifications', 'email notifications', 'turn off notifications', 'notification settings', 'নোটিফিকেশন',
        'ই-মেইল', 'notification off', 'notification bondho', 'notification ki', 'alerts',
      ],
    },
    {
      id: 'account-two-step',
      topic: 'account',
      title: { en: 'Two-step sign-in', bn: 'দুই ধাপের সাইন-ইন' },
      text: {
        en: 'Turn on two-step sign-in in your profile: after your password, the shop e-mails you a code to finish signing in. Use a strong password too.',
        bn: 'প্রোফাইলে দুই ধাপের সাইন-ইন চালু করুন: পাসওয়ার্ডের পরে সাইন ইন শেষ করতে শপ আপনাকে ই-মেইলে একটি কোড পাঠায়। শক্ত পাসওয়ার্ডও ব্যবহার করুন।',
      },
      link: '/profile',
      keywords: [
        'two-step', '2fa', 'two factor', 'secure account', 'account safety', 'password', 'দুই ধাপ', 'অ্যাকাউন্ট নিরাপদ',
        'account surokkha', 'password bhule gechi', 'sign in code', 'নিরাপত্তা',
      ],
    },
    {
      id: 'account-minimum-age',
      topic: 'account',
      title: { en: 'Minimum age', bn: 'ন্যূনতম বয়স' },
      text: {
        en: `You must be at least ${MINIMUM_AGE} to hold an account, because buying is a contract. Create a free account to buy or sell.`,
        bn: `অ্যাকাউন্ট রাখতে কমপক্ষে ${b(MINIMUM_AGE)} বছর বয়স হতে হবে, কারণ কেনা একটি চুক্তি। কিনতে বা বেচতে বিনামূল্যে অ্যাকাউন্ট খুলুন।`,
      },
      link: '/terms',
      keywords: [
        'minimum age', 'age limit', 'how old', 'under 18', 'create account', 'sign up', 'বয়স', 'অ্যাকাউন্ট খুলুন',
        'boyosh koto', 'account khulbo', 'sign up korbo', '১৮ বছর',
      ],
    },
    {
      id: 'account-bangla-interface',
      topic: 'account',
      title: { en: 'Bangla and English', bn: 'বাংলা ও ইংরেজি' },
      text: {
        en: 'The site, its e-mails and its notifications come in English and Bangla. Switch the language with the language toggle at the top of any page; your choice is remembered, and saved on your account when you are signed in.',
        bn: 'সাইট, ই-মেইল ও নোটিফিকেশন বাংলা ও ইংরেজি দুই ভাষাতেই আসে। যেকোনো পাতার ওপরের ভাষা বোতাম দিয়ে ভাষা বদলান; আপনার পছন্দ মনে রাখা হয়, আর সাইন ইন থাকলে অ্যাকাউন্টেও সংরক্ষিত হয়।',
      },
      link: '/privacy#cookies',
      keywords: [
        'bangla', 'language', 'change language', 'english', 'bangla interface', 'বাংলা', 'ভাষা', 'ভাষা বদলান',
        'bangla kivabe', 'language change korbo', 'banglay dekhbo', 'বাংলায়',
      ],
    },

    // ------------------------------------------------------------- privacy
    {
      id: 'privacy-summary',
      topic: 'privacy',
      title: { en: 'Your data and privacy', bn: 'আপনার তথ্য ও গোপনীয়তা' },
      text: {
        en: 'The shop uses no advertising or analytics cookies and does not track you across other sites. The privacy policy lists what is collected and why, and who else sees it.',
        bn: 'শপ কোনো বিজ্ঞাপন বা অ্যানালিটিক্স কুকি ব্যবহার করে না, এবং অন্য সাইটে আপনাকে অনুসরণ করে না। গোপনীয়তা নীতিতে কী সংগ্রহ হয়, কেন, এবং আর কে তা দেখে, সবই বলা আছে।',
      },
      link: '/privacy',
      keywords: [
        'privacy', 'data collected', 'personal data', 'tracking', 'privacy policy', 'গোপনীয়তা', 'তথ্য',
        'goponiyota', 'amar tothyo', 'data safe', 'তথ্য নিরাপদ',
      ],
    },
    {
      id: 'privacy-cookies',
      topic: 'privacy',
      title: { en: 'Cookie choices', bn: 'কুকির পছন্দ' },
      text: {
        en: 'When you first visit you choose: accept all, necessary only, or each group on its own. Turning a group off deletes what it kept, and you can change your mind any time from the cookie settings.',
        bn: 'প্রথমবার এলে আপনি বেছে নেন: সব গ্রহণ, শুধু প্রয়োজনীয়, অথবা প্রতিটি ভাগ আলাদা করে। কোনো ভাগ বন্ধ করলে সেটি যা রেখেছিল তা মুছে যায়, আর কুকি সেটিংস থেকে যেকোনো সময় সিদ্ধান্ত বদলানো যায়।',
      },
      link: '/privacy#cookies',
      keywords: [
        'cookies', 'cookie settings', 'cookie consent', 'storage', 'tracking cookies', 'কুকি', 'কুকি সেটিংস',
        'cookie bondho', 'cookie ki', 'consent',
      ],
    },
    {
      id: 'privacy-your-data',
      topic: 'privacy',
      title: { en: 'Download or delete your data', bn: 'তথ্য ডাউনলোড বা মুছে ফেলা' },
      text: {
        en: 'On your profile page, under Your data, you can download everything your account holds as a single file, and you can delete the account outright. You can also edit your profile there.',
        bn: 'আপনার প্রোফাইল পাতায় "আপনার তথ্য" অংশে অ্যাকাউন্টের সব তথ্য একটি ফাইলে ডাউনলোড করা যায়, আর অ্যাকাউন্ট পুরোপুরি মুছেও ফেলা যায়। সেখানে প্রোফাইলও সম্পাদনা করা যায়।',
      },
      link: '/profile',
      keywords: [
        'delete account', 'download my data', 'export data', 'remove account', 'close account', 'অ্যাকাউন্ট মুছুন',
        'তথ্য ডাউনলোড', 'account delete korbo', 'data download', 'account bondho', 'আমার তথ্য',
      ],
    },

    // ------------------------------------------------------------- contact
    {
      id: 'contact-email',
      topic: 'contact',
      title: { en: 'Contacting the shop', bn: 'শপের সঙ্গে যোগাযোগ' },
      text: {
        en: `E-mail ${SUPPORT_EMAIL} is the way to reach the shop; there is no phone line. For an order, include the order number. For a question about a book, message the seller from its page.`,
        bn: `শপের কাছে পৌঁছানোর উপায় ই-মেইল ${SUPPORT_EMAIL}; কোনো ফোন লাইন নেই। অর্ডার নিয়ে লিখলে অর্ডার নম্বর দিন। কোনো বই নিয়ে প্রশ্ন থাকলে বইয়ের পাতা থেকে বিক্রেতাকে মেসেজ দিন।`,
      },
      link: '/contact',
      keywords: [
        'contact', 'email', 'support', 'phone number', 'helpline', 'customer care', 'যোগাযোগ', 'ই-মেইল', 'ফোন নম্বর',
        'jogajog', 'phone number koto', 'help chai', 'support email', 'hotline',
      ],
    },
    {
      id: 'contact-chat-with-shop',
      topic: 'contact',
      title: { en: 'Chat with the shop', bn: 'শপের সঙ্গে চ্যাট' },
      text: {
        en: 'If a status needs correcting or something cannot be settled with a seller, message the shop in Chat or e-mail it. Once an order is past Shipped, only the shop can update it.',
        bn: 'কোনো অবস্থা সংশোধন করতে হলে বা বিক্রেতার সঙ্গে মীমাংসা না হলে চ্যাটে শপকে মেসেজ দিন বা ই-মেইল করুন। অর্ডার "পাঠানো হয়েছে" পার হলে শুধু শপই তা হালনাগাদ করতে পারে।',
      },
      link: '/chat',
      keywords: [
        'chat with shop', 'talk to admin', 'complaint', 'problem with order', 'shop chat', 'অভিযোগ', 'শপকে মেসেজ',
        'complain korbo', 'admin er sathe kotha', 'shop ke message', 'সমস্যা',
      ],
    },

    // --------------------------------------------------------------- about
    {
      id: 'about-shop',
      topic: 'about',
      title: { en: 'About BookStoreBD', bn: 'BookStoreBD সম্পর্কে' },
      text: {
        en: `BookStoreBD is a marketplace for new and second-hand books across Bangladesh, run by Utsha Basak in ${SHOP_LOCATION}. Anyone with an account can buy, and anyone with books to part with can list them.`,
        bn: 'BookStoreBD সারা বাংলাদেশে নতুন ও পুরোনো বই কেনাবেচার একটি মার্কেটপ্লেস, ঢাকা, বাংলাদেশ থেকে পরিচালনা করেন Utsha Basak। অ্যাকাউন্ট থাকলে যে কেউ কিনতে পারেন, আর যাঁর কাছে হাতছাড়া করার মতো বই আছে, তিনি তালিকাভুক্ত করতে পারেন।',
      },
      link: '/about',
      keywords: [
        'about', 'who runs', 'owner', 'location', 'where are you', 'what is bookstorebd', 'আমাদের সম্পর্কে', 'মালিক',
        'ke chalay', 'kothay', 'office', 'ঢাকা', 'about us',
      ],
    },
    {
      id: 'about-how-it-works',
      topic: 'about',
      title: { en: 'How buying and selling work', bn: 'কেনাবেচা যেভাবে কাজ করে' },
      text: {
        en: 'Find a book, order it, pay the courier on delivery, follow it, and ask for a return within the window if it is not as described. To sell, switch your profile to Seller, add your bKash merchant number, and list your books free.',
        bn: 'বই খুঁজুন, অর্ডার দিন, ডেলিভারিতে কুরিয়ারকে টাকা দিন, অর্ডারের খবর রাখুন, আর বর্ণনার সঙ্গে না মিললে সময়সীমার মধ্যে রিটার্ন চান। বিক্রি করতে প্রোফাইল "বিক্রেতা"-তে বদলান, বিকাশ মার্চেন্ট নম্বর যোগ করুন, আর বিনামূল্যে বই তালিকাভুক্ত করুন।',
      },
      link: '/how-it-works',
      keywords: [
        'how it works', 'how to buy', 'how to sell', 'guide', 'getting started', 'help', 'যেভাবে কাজ করে', 'কীভাবে কিনব',
        'kivabe kaj kore', 'kivabe kinbo', 'kivabe becbo', 'শুরু করব',
      ],
    },

    // ----------------------------------------------------------- assistant
    {
      id: 'assistant-about',
      topic: 'assistant',
      title: { en: 'About this assistant', bn: 'এই সহকারী সম্পর্কে' },
      text: {
        en: 'This is an AI helper, and it can make mistakes, so check anything important on the linked page. It can find books, explain the shop\'s rules, track your own orders when you are signed in, and hand you over to a person.',
        bn: 'এটি একটি এআই সহকারী, ভুল করতে পারে, তাই গুরুত্বপূর্ণ কিছু লিঙ্ক করা পাতায় মিলিয়ে নিন। এটি বই খুঁজে দিতে, শপের নিয়ম বোঝাতে, সাইন ইন থাকলে আপনার নিজের অর্ডারের খবর বলতে এবং আপনাকে একজন মানুষের হাতে তুলে দিতে পারে।',
      },
      link: '/how-it-works',
      keywords: [
        'assistant', 'ai', 'chatbot', 'bot', 'who are you', 'what can you do', 'human', 'talk to a person', 'সহকারী',
        'এআই', 'মানুষের সঙ্গে কথা', 'tumi ke', 'ki korte paro', 'manush', 'bot ke',
      ],
    },
  ];
};
