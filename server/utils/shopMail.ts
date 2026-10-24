import { createLogger } from '../config/logger.js';
import { RETURN_WINDOW_DAYS, sellerFeeFor, SELLER_FEE_PERCENT } from '../config/commerce.js';
import User from '../models/user.model.js';
import { noticeEmail, type Email, type MailFor, type NoticeInput, type NoticeItem } from './emailTemplates.js';
import { asLanguage, bnDigits, inLanguage, type Language } from './language.js';
import { mailConfigured, sendMail } from './mailer.js';
import { recipientsWanting } from './notificationPrefs.js';
import type { NotificationCategory } from '@shared/api.js';

export type { MailFor } from './emailTemplates.js';

/**
 * The shop's e-mails about orders and returns, and the one place they are sent.
 *
 * Sending never holds up the response that caused it, and never fails it:
 * an order is placed whether or not its confirmation reaches an inbox. A
 * failure is logged, which is where it belongs.
 *
 * Every e-mail is a `MailFor`: written in English and Bangla, and rendered in
 * the recipient's account language when it is sent.
 */

const log = createLogger('mail');

const inFlight = new Set<Promise<void>>();

/**
 * The language an address's account last chose; English where there is no
 * account, or the lookup fails (a message is better late in English than lost).
 */
const languageOfAccount = async (email: string): Promise<Language> => {
  try {
    const user = await User.findOne({ email }, { language: 1 }).lean();
    return asLanguage(user?.language);
  } catch (err) {
    log.warn({ err }, 'Could not look up the recipient language');
    return 'en';
  }
};

/** A ready e-mail as it is; a template in the language of the account `to` (or `choicesOf`) belongs to. */
const render = async (mail: Email | MailFor, to: string): Promise<Email> =>
  typeof mail === 'function' ? mail(await languageOfAccount(to)) : mail;

/**
 * Sends in the background, or does nothing where mail is not set up. With a
 * category, only if the person has not turned that kind of e-mail off; without
 * one - account and security mail - always.
 */
export const dispatchShopMail = (
  to: string | null | undefined,
  mail: Email | MailFor,
  category: NotificationCategory | null = null,
  /**
   * Whose choices decide, when the address is not an account's own - the
   * e-mail a buyer gave for one order is still their account's mail.
   */
  { choicesOf = to }: { choicesOf?: string | null } = {}
): void => {
  if (!to || !mailConfigured()) return;
  let subject = typeof mail === 'function' ? '' : mail.subject;
  const sending: Promise<void> = new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  })
    .then(async () => {
      if (!(await recipientsWanting([choicesOf || to], category, 'email')).length) return;
      const ready = await render(mail, choicesOf || to);
      subject = ready.subject;
      await sendMail({ to, subject: ready.subject, text: ready.text, html: ready.html });
    })
    .catch((err: unknown) => {
      log.error({ err, subject }, 'Failed to send mail');
    })
    .finally(() => inFlight.delete(sending));
  inFlight.add(sending);
};

/** Resolves once every send started so far has settled. A test seam. */
export const shopMailSettled = async (): Promise<void> => {
  await Promise.all([...inFlight]);
};

/**
 * Sends one e-mail and says whether it went, for the administrator's
 * messages, where the count of what failed is the point.
 */
export const sendShopMailNow = async (to: string, mail: Email | MailFor): Promise<boolean> => {
  if (!mailConfigured()) return false;
  let subject = typeof mail === 'function' ? '' : mail.subject;
  try {
    const ready = await render(mail, to);
    subject = ready.subject;
    await sendMail({ to, subject: ready.subject, text: ready.text, html: ready.html });
    return true;
  } catch (err) {
    log.error({ err, subject }, 'Failed to send mail');
    return false;
  }
};

// ---------------------------------------------------------------- content

type Say = (en: string, bn: string) => string;

/** A notice written for both languages: `build` is given the one being rendered. */
const notice =
  (build: (say: Say, language: Language) => NoticeInput): MailFor =>
  (language) =>
    noticeEmail(build((en, bn) => inLanguage(language, en, bn), language), language);

/** A number inside text: Bangla digits in Bangla. */
const num = (language: Language, value: number | string): string => (language === 'bn' ? bnDigits(value) : String(value));

const taka = (amount: number, language: Language = 'en'): string => {
  const rounded = Math.round(amount * 100) / 100;
  return language === 'bn' ? `${bnDigits(rounded)} টাকা` : `${rounded} Tk`;
};

/** A date as the e-mails write it: "5 October 2026", or in Bangla digits and month names. */
const dateIn = (date: Date, language: Language, timeZone?: string): string =>
  date.toLocaleDateString(language === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    ...(timeZone ? { timeZone } : {}),
  });

/** The order lines an e-mail is about. */
export interface MailLine {
  /** The book, where an e-mail links to it. */
  bookId?: unknown;
  title?: string | null;
  quantity?: number | null;
  price?: number | null;
}

const itemsOf = (lines: readonly MailLine[], language: Language): NoticeItem[] =>
  lines.map((line) => {
    const quantity = Number(line.quantity) || 1;
    const price = Number(line.price) || 0;
    return {
      title: line.title || inLanguage(language, 'A book', 'একটি বই'),
      detail: quantity > 1 ? `${num(language, quantity)} × ${taka(price, language)}` : undefined,
      amount: taka(price * quantity, language),
    };
  });

const booksTotalOf = (lines: readonly MailLine[]): number =>
  lines.reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 1), 0);

export interface OrderFacts {
  orderNumber: string;
  /** Where the buyer's e-mails about the order go. */
  contactEmail?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryDistrict?: string | null;
  deliveryDivision?: string | null;
  shippingCharge?: number | null;
  discount?: number | null;
  buyerNote?: string | null;
}

const addressOf = (order: OrderFacts): string =>
  [order.deliveryAddress, order.deliveryDistrict, order.deliveryDivision].filter(Boolean).join(', ');

/** To the buyer: the order went through. */
export const orderPlacedBuyerEmail = (order: OrderFacts, lines: readonly MailLine[]): MailFor =>
  notice((say, language) => {
    const books = booksTotalOf(lines);
    const shipping = Number(order.shippingCharge) || 0;
    const discount = Number(order.discount) || 0;
    const tk = (amount: number): string => taka(amount, language);
    return {
      subject: say(`Order ${order.orderNumber} is confirmed`, `অর্ডার ${order.orderNumber} নিশ্চিত হয়েছে`),
      heading: say('Your order is confirmed', 'আপনার অর্ডার নিশ্চিত হয়েছে'),
      preheader: say(
        `Thank you! ${tk(books + shipping - discount)} to pay on delivery.`,
        `ধন্যবাদ! ডেলিভারির সময় ${tk(books + shipping - discount)} দিতে হবে।`
      ),
      lead: [
        say(
          `Thank you${order.contactName ? `, ${order.contactName}` : ''}! Your order ${order.orderNumber} is confirmed, and the seller is getting it ready.`,
          `ধন্যবাদ${order.contactName ? `, ${order.contactName}` : ''}! আপনার অর্ডার ${order.orderNumber} নিশ্চিত হয়েছে, বিক্রেতা এটি প্রস্তুত করছেন।`
        ),
      ],
      items: itemsOf(lines, language),
      facts: [
        [say('Books', 'বই'), tk(books)],
        [say('Delivery', 'ডেলিভারি'), shipping ? tk(shipping) : say('Free', 'বিনামূল্যে')],
        ...(discount ? ([[say('Discount', 'ছাড়'), `- ${tk(discount)}`]] as const) : []),
        [say('To pay on delivery', 'ডেলিভারির সময় দিতে হবে'), tk(books + shipping - discount)],
        ...(addressOf(order) ? ([[say('Deliver to', 'ডেলিভারির ঠিকানা'), addressOf(order)]] as const) : []),
        ...(order.buyerNote ? ([[say('Your note', 'আপনার নোট'), order.buyerNote]] as const) : []),
      ],
      button: { label: say('Track your order', 'অর্ডার ট্র্যাক করুন'), path: `/order-tracking/${order.orderNumber}` },
      after: [
        say(
          'You can cancel it from that page until the seller starts preparing it.',
          'বিক্রেতা প্রস্তুতি শুরু করার আগ পর্যন্ত ওই পেজ থেকে আপনি এটি বাতিল করতে পারবেন।'
        ),
      ],
    };
  });

/** To a seller: some of their books were ordered. */
export const orderPlacedSellerEmail = (order: OrderFacts, lines: readonly MailLine[]): MailFor =>
  notice((say, language) => {
    const books = booksTotalOf(lines);
    const tk = (amount: number): string => taka(amount, language);
    return {
      subject: say(`New order ${order.orderNumber}`, `নতুন অর্ডার ${order.orderNumber}`),
      heading: say('You have a new order', 'আপনার একটি নতুন অর্ডার এসেছে'),
      preheader: say(
        `${lines.map((line) => line.title || 'A book').join(', ')}: get it ready to send.`,
        `${lines.map((line) => line.title || 'একটি বই').join(', ')}: পাঠানোর জন্য প্রস্তুত করুন।`
      ),
      lead: [
        say(
          'Good news: a buyer has ordered from you. Get the books ready and mark the order as it moves on.',
          'সুখবর: একজন ক্রেতা আপনার কাছ থেকে অর্ডার করেছেন। বইগুলো প্রস্তুত করুন, আর অর্ডার এগোলে স্ট্যাটাস বদলে দিন।'
        ),
      ],
      items: itemsOf(lines, language),
      facts: [
        [say('Order', 'অর্ডার'), order.orderNumber],
        [say('Books total', 'বইয়ের মোট দাম'), tk(books)],
        [
          say(`${'BookStoreBD'} fee (${SELLER_FEE_PERCENT}%)`, `BookStoreBD ফি (${num(language, SELLER_FEE_PERCENT)}%)`),
          `- ${tk(sellerFeeFor(books))}`,
        ],
        [say('You receive', 'আপনি পাবেন'), tk(books - sellerFeeFor(books))],
        ...(order.contactName ? ([[say('Buyer', 'ক্রেতা'), order.contactName]] as const) : []),
        ...(order.buyerNote ? ([[say("Buyer's note", 'ক্রেতার নোট'), order.buyerNote]] as const) : []),
      ],
      button: { label: say('Open the order', 'অর্ডারটি খুলুন'), path: `/seller/order-tracking/${order.orderNumber}` },
      after: [
        say(
          `You are paid by bKash once it is delivered and the ${RETURN_WINDOW_DAYS}-day return window has closed.`,
          `অর্ডার ডেলিভারি হওয়ার পর ${num(language, RETURN_WINDOW_DAYS)} দিনের রিটার্নের সময় শেষ হলে আপনাকে বিকাশে টাকা পাঠানো হবে।`
        ),
      ],
    };
  });

/** Where "Review your books" goes: the book's reviews, or the orders when there are several. */
const reviewButton = (lines: readonly MailLine[], say: Say): { label: string; path: string } => {
  const books = [...new Set(lines.map((line) => String(line.bookId ?? '')).filter(Boolean))];
  return books.length === 1
    ? { label: say('Review your book', 'বইটির রিভিউ দিন'), path: `/book/${books[0]}#reviews` }
    : { label: say('Review your books', 'বইগুলোর রিভিউ দিন'), path: '/buyer/orders' };
};

/** To the buyer: it arrived. */
export const orderDeliveredBuyerEmail = (order: OrderFacts, lines: readonly MailLine[]): MailFor =>
  notice((say, language) => ({
    subject: say(`Order ${order.orderNumber} has been delivered`, `অর্ডার ${order.orderNumber} ডেলিভারি হয়েছে`),
    heading: say('Your order has been delivered', 'আপনার অর্ডার ডেলিভারি হয়েছে'),
    preheader: say(
      'Enjoy your books! Tell other readers what you thought.',
      'বইগুলো উপভোগ করুন! অন্য পাঠকদের জানান আপনার কেমন লাগল।'
    ),
    lead: [say('Your books have arrived. We hope you enjoy them!', 'আপনার বইগুলো পৌঁছে গেছে। আশা করি বইগুলো আপনার ভালো লাগবে!')],
    items: itemsOf(lines, language),
    facts: [[say('Order', 'অর্ডার'), order.orderNumber]],
    // Reviews are written on the book's own page: one book goes straight to
    // its review form, several to the orders, where each book links to its page.
    button: reviewButton(lines, say),
    after: [
      say(
        `Something wrong with a book? You can ask for a return within ${RETURN_WINDOW_DAYS} days, from your orders.`,
        `কোনো বইয়ে সমস্যা আছে? ${num(language, RETURN_WINDOW_DAYS)} দিনের মধ্যে আপনার অর্ডার থেকে রিটার্নের অনুরোধ করতে পারেন।`
      ),
    ],
  }));

/** To a seller: their books arrived, and when they will be paid. */
export const orderDeliveredSellerEmail = (order: OrderFacts, lines: readonly MailLine[], payableFrom: Date): MailFor =>
  notice((say, language) => {
    const books = booksTotalOf(lines);
    const tk = (amount: number): string => taka(amount, language);
    return {
      subject: say(`Order ${order.orderNumber} was delivered`, `অর্ডার ${order.orderNumber} ডেলিভারি হয়েছে`),
      heading: say('Your order was delivered', 'আপনার অর্ডার ডেলিভারি হয়েছে'),
      preheader: say(
        `${tk(books - sellerFeeFor(books))} comes to your bKash once the return window closes.`,
        `রিটার্নের সময় শেষ হলে ${tk(books - sellerFeeFor(books))} আপনার বিকাশে আসবে।`
      ),
      lead: [say('The buyer has received your books.', 'ক্রেতা আপনার বইগুলো পেয়েছেন।')],
      items: itemsOf(lines, language),
      facts: [
        [say('Order', 'অর্ডার'), order.orderNumber],
        [say('You receive', 'আপনি পাবেন'), tk(books - sellerFeeFor(books))],
        [say('Payable from', 'পেআউট শুরু'), dateIn(payableFrom, language)],
      ],
      button: { label: say('Open the order', 'অর্ডারটি খুলুন'), path: `/seller/order-tracking/${order.orderNumber}` },
      after: [
        say(
          'If the buyer asks for a return in the meantime, the payment waits until it is decided.',
          'এর মধ্যে ক্রেতা রিটার্নের অনুরোধ করলে সিদ্ধান্ত না হওয়া পর্যন্ত পেমেন্ট অপেক্ষায় থাকবে।'
        ),
      ],
    };
  });

/** To a seller: the shop has paid them for an order, by bKash. */
export const payoutSentEmail = (
  payout: { orderNumber: string; reference: string; paidAt: Date },
  lines: readonly MailLine[]
): MailFor =>
  notice((say, language) => {
    const books = booksTotalOf(lines);
    const paid = taka(books - sellerFeeFor(books), language);
    const tk = (amount: number): string => taka(amount, language);
    return {
      subject: say(
        `You have been paid ${paid} for order ${payout.orderNumber}`,
        `অর্ডার ${payout.orderNumber}-এর জন্য আপনাকে ${paid} পাঠানো হয়েছে`
      ),
      heading: say('Your payment is on its way', 'আপনার পেমেন্ট পাঠানো হয়েছে'),
      preheader: say(
        `${paid} sent to your bKash. Transaction ID ${payout.reference}.`,
        `${paid} আপনার বিকাশে পাঠানো হয়েছে। ট্রানজেকশন আইডি ${payout.reference}।`
      ),
      lead: [say('We have sent you the money for your books, by bKash.', 'আপনার বইয়ের টাকা আমরা বিকাশে পাঠিয়ে দিয়েছি।')],
      items: itemsOf(lines, language),
      facts: [
        [say('Order', 'অর্ডার'), payout.orderNumber],
        [say('Books total', 'বইয়ের মোট দাম'), tk(books)],
        [
          say(`BookStoreBD fee (${SELLER_FEE_PERCENT}%)`, `BookStoreBD ফি (${num(language, SELLER_FEE_PERCENT)}%)`),
          `- ${tk(sellerFeeFor(books))}`,
        ],
        [say('You receive', 'আপনি পেয়েছেন'), paid],
        [say('bKash transaction ID', 'বিকাশ ট্রানজেকশন আইডি'), payout.reference],
        [say('Paid on', 'পাঠানোর তারিখ'), dateIn(payout.paidAt, language, 'Asia/Dhaka')],
      ],
      button: { label: say('See your sales', 'আপনার বিক্রি দেখুন'), path: '/seller-orders' },
      after: [
        say(
          'If it has not reached your bKash account within a day, reply to this e-mail with the transaction ID.',
          'একদিনের মধ্যে আপনার বিকাশ অ্যাকাউন্টে না পৌঁছালে ট্রানজেকশন আইডিসহ এই ই-মেইলের উত্তর দিন।'
        ),
      ],
    };
  });

const BY: Record<string, { en: string; bn: string }> = {
  buyer: { en: 'the buyer', bn: 'ক্রেতা' },
  seller: { en: 'the seller', bn: 'বিক্রেতা' },
  admin: { en: 'BookStoreBD', bn: 'BookStoreBD' },
};

/** To the buyer or a seller: books in the order were cancelled. */
export const orderCancelledEmail = (
  audience: 'buyer' | 'seller',
  order: OrderFacts,
  lines: readonly MailLine[],
  { by, reason, whole }: { by: string; reason?: string | null; whole: boolean }
): MailFor =>
  notice((say, language) => {
    const who = BY[by] ? say(BY[by].en, BY[by].bn) : by;
    return {
      subject: say(`Order ${order.orderNumber} was cancelled`, `অর্ডার ${order.orderNumber} বাতিল হয়েছে`),
      heading: whole
        ? say('Your order was cancelled', 'আপনার অর্ডার বাতিল হয়েছে')
        : say('Part of your order was cancelled', 'আপনার অর্ডারের একটি অংশ বাতিল হয়েছে'),
      preheader: say(`Cancelled by ${who}${reason ? `: ${reason}` : '.'}`, `${who} বাতিল করেছেন${reason ? `: ${reason}` : '।'}`),
      lead: [
        audience === 'buyer'
          ? whole
            ? say(
                `Order ${order.orderNumber} has been cancelled. You will not be charged for it.`,
                `অর্ডার ${order.orderNumber} বাতিল করা হয়েছে। এর জন্য আপনাকে কোনো টাকা দিতে হবে না।`
              )
            : say(
                `Some books in order ${order.orderNumber} have been cancelled. You will not be charged for them; the rest of the order goes ahead.`,
                `অর্ডার ${order.orderNumber}-এর কিছু বই বাতিল করা হয়েছে। সেগুলোর জন্য আপনাকে টাকা দিতে হবে না; বাকি অর্ডার আগের মতোই এগোবে।`
              )
          : say(
              `Your books in order ${order.orderNumber} have been cancelled, and the copies are back on sale.`,
              `অর্ডার ${order.orderNumber}-এ আপনার বইগুলো বাতিল করা হয়েছে, আর কপিগুলো আবার বিক্রির জন্য আছে।`
            ),
      ],
      items: itemsOf(lines, language),
      facts: [
        [say('Cancelled by', 'বাতিল করেছেন'), who],
        ...(reason ? ([[say('Reason', 'কারণ'), reason]] as const) : []),
      ],
      button: {
        label: say('Open the order', 'অর্ডারটি খুলুন'),
        path: audience === 'buyer' ? `/order-tracking/${order.orderNumber}` : `/seller/order-tracking/${order.orderNumber}`,
      },
    };
  });

export interface ReturnFacts {
  orderNumber: string;
  bookTitle: string;
  refundBkash?: string | null;
  defectDescription?: string | null;
}

/** To the buyer: their return was decided. */
export const returnDecidedEmail = (request: ReturnFacts, approved: boolean): MailFor =>
  notice((say, language) => {
    const address = (process.env.RETURN_ADDRESS ?? '').trim();
    return approved
      ? {
          subject: say(`Your return of "${request.bookTitle}" was approved`, `"${request.bookTitle}" ফেরত দেওয়ার অনুরোধ অনুমোদিত হয়েছে`),
          heading: say('Your return is approved', 'আপনার রিটার্ন অনুমোদিত হয়েছে'),
          preheader: say(
            'Send the book back and we will refund you by bKash.',
            'বইটি ফেরত পাঠান, আমরা বিকাশে আপনার টাকা ফেরত দেব।'
          ),
          lead: [
            say(
              `We have approved your return of "${request.bookTitle}" from order ${request.orderNumber}.`,
              `অর্ডার ${request.orderNumber}-এর "${request.bookTitle}" ফেরত দেওয়ার অনুরোধ আমরা অনুমোদন করেছি।`
            ),
          ],
          facts: [
            [
              say('Next step', 'পরবর্তী ধাপ'),
              address
                ? say(`Send the book by courier to:\n${address}`, `বইটি কুরিয়ারে এই ঠিকানায় পাঠান:\n${address}`)
                : say(
                    'Reply to this e-mail and we will arrange the courier with you.',
                    'এই ই-মেইলের উত্তর দিন, আমরা আপনার সঙ্গে মিলে কুরিয়ারের ব্যবস্থা করব।'
                  ),
            ],
            [say('Courier', 'কুরিয়ার'), say('Paid by BookStoreBD', 'খরচ BookStoreBD দেবে')],
            [
              say('Refund', 'টাকা ফেরত'),
              say(
                `The book's price, to your bKash${request.refundBkash ? ` ${request.refundBkash}` : ''}, within 15 working days of it reaching us`,
                `বইটি আমাদের হাতে পৌঁছানোর ${num(language, 15)} কর্মদিবসের মধ্যে বইয়ের দাম আপনার বিকাশে${request.refundBkash ? ` ${request.refundBkash}-এ` : ''} ফেরত দেওয়া হবে`
              ),
            ],
          ],
          button: { label: say('See your orders', 'আপনার অর্ডারগুলো দেখুন'), path: '/buyer/orders' },
          after: [say('The original delivery charge is not refunded.', 'আগের ডেলিভারি চার্জ ফেরত দেওয়া হয় না।')],
        }
      : {
          subject: say(`Your return of "${request.bookTitle}" was not approved`, `"${request.bookTitle}" ফেরত দেওয়ার অনুরোধ অনুমোদিত হয়নি`),
          heading: say('Your return was not approved', 'আপনার রিটার্ন অনুমোদিত হয়নি'),
          preheader: say('Reply to this e-mail if you would like to know why.', 'কারণ জানতে চাইলে এই ই-মেইলের উত্তর দিন।'),
          lead: [
            say(
              `We have looked at your return of "${request.bookTitle}" from order ${request.orderNumber}, and could not approve it this time.`,
              `অর্ডার ${request.orderNumber}-এর "${request.bookTitle}" ফেরত দেওয়ার অনুরোধটি আমরা দেখেছি, কিন্তু এবার অনুমোদন করতে পারিনি।`
            ),
            say(
              'If you think that is wrong, or would like to know why, reply to this e-mail and we will look at it again.',
              'আপনার মনে হলে এটি ঠিক হয়নি, অথবা কারণ জানতে চাইলে এই ই-মেইলের উত্তর দিন, আমরা আবার দেখব।'
            ),
          ],
          button: { label: say('See your orders', 'আপনার অর্ডারগুলো দেখুন'), path: '/buyer/orders' },
        };
  });

/** To a seller: a buyer wants to send their books back. */
export const returnRequestedSellerEmail = (request: ReturnFacts, titles: readonly string[]): MailFor =>
  notice((say) => ({
    subject: say(`Return requested for order ${request.orderNumber}`, `অর্ডার ${request.orderNumber}-এর জন্য রিটার্নের অনুরোধ এসেছে`),
    heading: say('A buyer asked for a return', 'একজন ক্রেতা রিটার্নের অনুরোধ করেছেন'),
    preheader: say(`${titles.join(', ')}: BookStoreBD will decide it.`, `${titles.join(', ')}: BookStoreBD সিদ্ধান্ত নেবে।`),
    lead: [
      say(
        `The buyer of order ${request.orderNumber} has asked to return ${titles.length > 1 ? 'these books' : 'this book'}.`,
        `অর্ডার ${request.orderNumber}-এর ক্রেতা ${titles.length > 1 ? 'এই বইগুলো' : 'এই বইটি'} ফেরত দিতে চেয়েছেন।`
      ),
    ],
    items: titles.map((title) => ({ title })),
    facts: [
      ...(request.defectDescription ? ([[say('What is wrong', 'কী সমস্যা'), request.defectDescription]] as const) : []),
      [
        say('What happens now', 'এখন কী হবে'),
        say(
          'BookStoreBD looks at the photographs and decides. Your payment for these books waits until then.',
          'BookStoreBD ছবিগুলো দেখে সিদ্ধান্ত নেবে। ততক্ষণ এই বইগুলোর পেমেন্ট অপেক্ষায় থাকবে।'
        ),
      ],
    ],
    button: { label: say('Open the order', 'অর্ডারটি খুলুন'), path: `/seller/order-tracking/${request.orderNumber}` },
  }));

/** A new member's first e-mail: what the shop is, and where to start. */
export const welcomeEmail = (username: string): MailFor =>
  notice((say, language) => ({
    subject: say(`Welcome to BookStoreBD, ${username}!`, `BookStoreBD-তে স্বাগতম, ${username}!`),
    heading: say(`Welcome, ${username}!`, `স্বাগতম, ${username}!`),
    preheader: say(
      'New and second-hand books, bought and sold by readers across Bangladesh.',
      'সারা বাংলাদেশের পাঠকদের কেনাবেচা নতুন ও পুরোনো বই।'
    ),
    lead: [
      say(
        'Thank you for joining BookStoreBD, where readers across Bangladesh buy and sell new and second-hand books.',
        'BookStoreBD-তে যোগ দেওয়ার জন্য ধন্যবাদ, যেখানে সারা বাংলাদেশের পাঠকেরা নতুন ও পুরোনো বই কেনাবেচা করেন।'
      ),
      say('Here is what you can do:', 'এখানে আপনি যা করতে পারেন:'),
    ],
    items: [
      {
        title: say('🔎 Find any book', '🔎 যেকোনো বই খুঁজুন'),
        detail: say(
          'Search in Bangla or English, filter by condition and price, and catch Quick deals.',
          'বাংলা বা ইংরেজিতে খুঁজুন, অবস্থা ও দাম দিয়ে ছেঁকে নিন, আর কুইক ডিল ধরুন।'
        ),
      },
      {
        title: say('💵 Pay on delivery', '💵 ডেলিভারির সময় টাকা দিন'),
        detail: say(
          `Cash on delivery, with ${RETURN_WINDOW_DAYS}-day returns if a book is not as described.`,
          `ক্যাশ অন ডেলিভারি, আর বই বর্ণনা অনুযায়ী না হলে ${num(language, RETURN_WINDOW_DAYS)} দিনের মধ্যে রিটার্ন।`
        ),
      },
      {
        title: say('🏪 Sell your books', '🏪 আপনার বই বিক্রি করুন'),
        detail: say(
          'List a book in minutes for free, and get paid by bKash.',
          'কয়েক মিনিটে বিনামূল্যে বই তালিকাভুক্ত করুন, আর বিকাশে টাকা পান।'
        ),
      },
      {
        title: say('🎯 Ask for any book', '🎯 যেকোনো বই চেয়ে নিন'),
        detail: say(
          'Not listed yet? Ask on the Wanted board and hear the moment it is.',
          'এখনো তালিকায় নেই? ওয়ান্টেড বোর্ডে চেয়ে রাখুন, বইটি এলেই জানতে পারবেন।'
        ),
      },
    ],
    button: { label: say('See how it works', 'কীভাবে কাজ করে দেখুন'), path: '/how-it-works' },
    after: [
      say(
        'Next, finish setting up your profile - your phone and address make checkout quicker.',
        'এরপর আপনার প্রোফাইল সম্পূর্ণ করুন - ফোন নম্বর ও ঠিকানা দিলে চেকআউট দ্রুত হয়।'
      ),
      say(
        "You received this because you created an account. If that wasn't you, write to us and we will close it.",
        'আপনি অ্যাকাউন্ট খুলেছেন বলে এই ই-মেইলটি পেয়েছেন। এটি আপনি না হলে আমাদের লিখুন, আমরা অ্যাকাউন্টটি বন্ধ করে দেব।'
      ),
    ],
  }));

/** A member inviting a friend: who, what the shop is, and how to join. */
export const inviteEmail = (inviterName: string, note: string): MailFor =>
  notice((say, language) => ({
    subject: say(`${inviterName} invited you to BookStoreBD`, `${inviterName} আপনাকে BookStoreBD-তে আমন্ত্রণ জানিয়েছেন`),
    heading: say(
      `${inviterName} thinks you would like BookStoreBD`,
      `${inviterName}-এর মনে হয়েছে BookStoreBD আপনার ভালো লাগবে`
    ),
    preheader: say(
      'New and second-hand books, bought and sold by readers across Bangladesh.',
      'সারা বাংলাদেশের পাঠকদের কেনাবেচা নতুন ও পুরোনো বই।'
    ),
    lead: [
      ...(note ? [`"${note}" - ${inviterName}`] : []),
      say(
        'BookStoreBD is where readers across Bangladesh buy and sell new and second-hand books.',
        'BookStoreBD-তে সারা বাংলাদেশের পাঠকেরা নতুন ও পুরোনো বই কেনাবেচা করেন।'
      ),
    ],
    items: [
      {
        title: say('📚 Thousands of books', '📚 হাজার হাজার বই'),
        detail: say(
          'New and second-hand, searchable in Bangla and English.',
          'নতুন ও পুরোনো, বাংলা ও ইংরেজি দুই ভাষাতেই খোঁজা যায়।'
        ),
      },
      {
        title: say('💵 Pay on delivery', '💵 ডেলিভারির সময় টাকা দিন'),
        detail: say(
          `Cash on delivery, delivered to your door, with ${RETURN_WINDOW_DAYS}-day returns if a book is not as described.`,
          `ক্যাশ অন ডেলিভারি, বাড়ির দরজায় পৌঁছে দেওয়া হয়, আর বই বর্ণনা অনুযায়ী না হলে ${num(language, RETURN_WINDOW_DAYS)} দিনের মধ্যে রিটার্ন।`
        ),
      },
      {
        title: say('🏪 Sell yours too', '🏪 আপনিও বিক্রি করুন'),
        detail: say(
          'List the books you have finished for free, and get paid by bKash.',
          'পড়া শেষ হওয়া বইগুলো বিনামূল্যে তালিকাভুক্ত করুন, আর বিকাশে টাকা পান।'
        ),
      },
    ],
    button: { label: say('Join BookStoreBD', 'BookStoreBD-তে যোগ দিন'), path: '/sign-up' },
    after: [
      say(
        `You received this because ${inviterName} entered your address. We will not e-mail you again unless you sign up.`,
        `${inviterName} আপনার ঠিকানা দিয়েছেন বলে আপনি এই ই-মেইলটি পেয়েছেন। আপনি সাইন আপ না করলে আমরা আর ই-মেইল করব না।`
      ),
    ],
  }));

/** A book someone asked for on the Wanted board has been listed. */
export const wantedFoundEmail = (title: string, author: string, link: string): MailFor =>
  notice((say) => ({
    subject: say(`"${title}" is here`, `"${title}" এসে গেছে`),
    heading: say('The book you wanted is here', 'আপনার চাওয়া বইটি এসে গেছে'),
    preheader: say(`${title} has just been listed on BookStoreBD.`, `${title} এইমাত্র BookStoreBD-তে তালিকাভুক্ত হয়েছে।`),
    lead: [
      say(
        'Good news: a book you asked for on the Wanted board has just been listed.',
        'সুখবর: ওয়ান্টেড বোর্ডে আপনার চাওয়া একটি বই এইমাত্র তালিকাভুক্ত হয়েছে।'
      ),
    ],
    items: [{ title, ...(author ? { detail: say(`by ${author}`, `লেখক: ${author}`) } : {}) }],
    button: { label: say('See the book', 'বইটি দেখুন'), path: link },
    after: [
      say('Copies can go quickly, so have a look soon.', 'কপি দ্রুত শেষ হয়ে যেতে পারে, তাই তাড়াতাড়ি দেখে নিন।'),
      say(
        'You can turn these e-mails off under Notifications in your profile.',
        'প্রোফাইলের নোটিফিকেশন থেকে এই ই-মেইল বন্ধ করে দিতে পারেন।'
      ),
    ],
  }));

/**
 * The account was signed in to from a browser, or a phone with the app, it has
 * not been used in before. `when` is a moment, written here in Dhaka time.
 */
export const newSignInEmail = (browser: string, when: Date, kind: 'browser' | 'app' = 'browser'): MailFor =>
  notice((say, language) => {
    const written =
      language === 'bn'
        ? `${when.toLocaleString('bn-BD', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' })} (ঢাকার সময়)`
        : `${when.toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', dateStyle: 'medium', timeStyle: 'short' })} (Dhaka time)`;
    return {
      subject: say('New sign-in to your BookStoreBD account', 'আপনার BookStoreBD অ্যাকাউন্টে নতুন সাইন ইন'),
      heading: say('A new sign-in to your account', 'আপনার অ্যাকাউন্টে নতুন সাইন ইন'),
      preheader: `${browser}, ${written}`,
      lead: [
        kind === 'app'
          ? say(
              'Your BookStoreBD account was just signed in to from the Android app, on a phone it has not been used on before.',
              'আপনার BookStoreBD অ্যাকাউন্টে এইমাত্র অ্যান্ড্রয়েড অ্যাপ থেকে সাইন ইন করা হয়েছে, এমন একটি ফোনে যেখানে আগে ব্যবহার করা হয়নি।'
            )
          : say(
              'Your BookStoreBD account was just signed in to from a browser it has not been used in before.',
              'আপনার BookStoreBD অ্যাকাউন্টে এইমাত্র এমন একটি ব্রাউজার থেকে সাইন ইন করা হয়েছে যেখানে আগে ব্যবহার করা হয়নি।'
            ),
      ],
      facts: [
        [kind === 'app' ? say('Device', 'ডিভাইস') : say('Browser', 'ব্রাউজার'), browser],
        [say('When', 'কখন'), written],
      ],
      button: { label: say('Review your account', 'আপনার অ্যাকাউন্ট দেখুন'), path: '/profile#security' },
      after: [
        say('If this was you, there is nothing to do.', 'এটি আপনি হলে কিছু করার নেই।'),
        say(
          "If it wasn't, reset your password from the sign-in page now, then choose Sign out everywhere else in your profile.",
          'এটি আপনি না হলে এখনই সাইন ইন পেজ থেকে পাসওয়ার্ড রিসেট করুন, তারপর প্রোফাইলে "অন্য সব জায়গা থেকে সাইন আউট" বেছে নিন।'
        ),
      ],
    };
  });

/** The account's password was changed. */
export const passwordChangedEmail = (): MailFor =>
  notice((say) => ({
    subject: say('Your BookStoreBD password was changed', 'আপনার BookStoreBD পাসওয়ার্ড বদলানো হয়েছে'),
    heading: say('Your password was changed', 'আপনার পাসওয়ার্ড বদলানো হয়েছে'),
    preheader: say('If this was you, there is nothing to do.', 'এটি আপনি হলে কিছু করার নেই।'),
    lead: [
      say(
        'The password for your BookStoreBD account was just changed, and every other device signed in to it has been signed out.',
        'আপনার BookStoreBD অ্যাকাউন্টের পাসওয়ার্ড এইমাত্র বদলানো হয়েছে, আর এতে সাইন ইন থাকা অন্য সব ডিভাইস সাইন আউট হয়ে গেছে।'
      ),
      say('If this was you, there is nothing more to do.', 'এটি আপনি হলে আর কিছু করার নেই।'),
    ],
    button: { label: say('Open your profile', 'আপনার প্রোফাইল খুলুন'), path: '/profile' },
    after: [
      say(
        "If you didn't change it, reset your password from the sign-in page straight away and write to us.",
        'আপনি না বদলে থাকলে এখনই সাইন ইন পেজ থেকে পাসওয়ার্ড রিসেট করুন এবং আমাদের লিখুন।'
      ),
    ],
  }));

/** The bKash number a seller is paid to was changed or removed. */
/** To the old address, once an account has moved to a new one. */
export const emailChangedEmail = (newEmail: string): MailFor =>
  notice((say) => ({
    subject: say('The e-mail address on your BookStoreBD account was changed', 'আপনার BookStoreBD অ্যাকাউন্টের ই-মেইল ঠিকানা বদলানো হয়েছে'),
    heading: say('Your e-mail address was changed', 'আপনার ই-মেইল ঠিকানা বদলানো হয়েছে'),
    preheader: say('If this was you, there is nothing to do.', 'এটি আপনি হলে কিছু করার নেই।'),
    lead: [
      say(
        `Your BookStoreBD account now uses ${newEmail}. Sign in with that address from now on; order and account e-mails go there too.`,
        `আপনার BookStoreBD অ্যাকাউন্ট এখন ${newEmail} ব্যবহার করছে। এখন থেকে ওই ঠিকানা দিয়ে সাইন ইন করুন; অর্ডার ও অ্যাকাউন্টের ই-মেইলও সেখানে যাবে।`
      ),
      say('If this was you, there is nothing more to do.', 'এটি আপনি হলে আর কিছু করার নেই।'),
    ],
    after: [
      say(
        "If you didn't make this change, write to us straight away so we can put it right.",
        'আপনি এই পরিবর্তন না করে থাকলে এখনই আমাদের লিখুন, যাতে আমরা ঠিক করে দিতে পারি।'
      ),
    ],
  }));

export const payoutNumberChangedEmail = (removed: boolean): MailFor =>
  notice((say) => ({
    subject: removed
      ? say('Your bKash payout number was removed', 'আপনার বিকাশ পেআউট নম্বর সরিয়ে ফেলা হয়েছে')
      : say('Your bKash payout number was changed', 'আপনার বিকাশ পেআউট নম্বর বদলানো হয়েছে'),
    heading: removed
      ? say('Your payout number was removed', 'আপনার পেআউট নম্বর সরিয়ে ফেলা হয়েছে')
      : say('Your payout number was changed', 'আপনার পেআউট নম্বর বদলানো হয়েছে'),
    preheader: say('If this was you, there is nothing to do.', 'এটি আপনি হলে কিছু করার নেই।'),
    lead: [
      removed
        ? say(
            'The bKash number your sales are paid to was just removed from your BookStoreBD account.',
            'আপনার বিক্রির টাকা যে বিকাশ নম্বরে পাঠানো হয়, সেটি এইমাত্র আপনার BookStoreBD অ্যাকাউন্ট থেকে সরিয়ে ফেলা হয়েছে।'
          )
        : say(
            'The bKash number your sales are paid to was just changed on your BookStoreBD account. Payouts go to the new number from now on.',
            'আপনার বিক্রির টাকা যে বিকাশ নম্বরে পাঠানো হয়, সেটি এইমাত্র আপনার BookStoreBD অ্যাকাউন্টে বদলানো হয়েছে। এখন থেকে পেআউট নতুন নম্বরে যাবে।'
          ),
      say('If this was you, there is nothing more to do.', 'এটি আপনি হলে আর কিছু করার নেই।'),
    ],
    button: { label: say('Open your profile', 'আপনার প্রোফাইল খুলুন'), path: '/profile?mode=seller' },
    after: [
      say(
        "If you didn't make this change, reset your password from the sign-in page straight away and write to us.",
        'আপনি এই পরিবর্তন না করে থাকলে এখনই সাইন ইন পেজ থেকে পাসওয়ার্ড রিসেট করুন এবং আমাদের লিখুন।'
      ),
    ],
  }));

/** Two-step sign-in was turned on or off for this account. */
export const twoFactorChangedEmail = (enabled: boolean): MailFor =>
  notice((say) => ({
    subject: enabled ? say('Two-step sign-in is on', 'টু-স্টেপ সাইন ইন চালু হয়েছে') : say('Two-step sign-in is off', 'টু-স্টেপ সাইন ইন বন্ধ হয়েছে'),
    heading: enabled ? say('Two-step sign-in is on', 'টু-স্টেপ সাইন ইন চালু হয়েছে') : say('Two-step sign-in is off', 'টু-স্টেপ সাইন ইন বন্ধ হয়েছে'),
    preheader: enabled
      ? say(
          'From now on, signing in also asks for a code sent to this address.',
          'এখন থেকে সাইন ইনের সময় এই ঠিকানায় পাঠানো একটি কোডও চাওয়া হবে।'
        )
      : say('Signing in now needs only your password.', 'এখন সাইন ইনে শুধু পাসওয়ার্ড লাগবে।'),
    lead: enabled
      ? [
          say(
            'From now on, after your password, we will e-mail a one-time code to this address to finish signing in.',
            'এখন থেকে পাসওয়ার্ডের পর সাইন ইন শেষ করতে আমরা এই ঠিকানায় একটি ওয়ান-টাইম কোড ই-মেইল করব।'
          ),
        ]
      : [
          say(
            'Signing in to your account now needs only your password. You can turn two-step sign-in back on from your profile.',
            'আপনার অ্যাকাউন্টে সাইন ইন করতে এখন শুধু পাসওয়ার্ড লাগবে। চাইলে প্রোফাইল থেকে টু-স্টেপ সাইন ইন আবার চালু করতে পারেন।'
          ),
        ],
    button: { label: say('Open your profile', 'আপনার প্রোফাইল খুলুন'), path: '/profile' },
    after: [
      say(
        "If you didn't make this change, reset your password from the sign-in page and contact us.",
        'আপনি এই পরিবর্তন না করে থাকলে সাইন ইন পেজ থেকে পাসওয়ার্ড রিসেট করুন এবং আমাদের সঙ্গে যোগাযোগ করুন।'
      ),
    ],
  }));

/**
 * A message from the shop, written by an administrator. Their title and words
 * go out as written; only the frame around them is translated.
 */
export const adminMessageEmail = (title: string, body: string, link?: string | null): MailFor =>
  notice((say) => ({
    subject: title,
    heading: title,
    preheader: body.slice(0, 120),
    lead: body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean),
    ...(link ? { button: { label: say('Open BookStoreBD', 'BookStoreBD খুলুন'), path: link } } : {}),
  }));
