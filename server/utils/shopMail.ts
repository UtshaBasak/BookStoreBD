import { createLogger } from '../config/logger.js';
import { RETURN_WINDOW_DAYS, sellerFeeFor, SELLER_FEE_PERCENT } from '../config/commerce.js';
import { noticeEmail, type Email, type NoticeItem } from './emailTemplates.js';
import { mailConfigured, sendMail } from './mailer.js';
import { recipientsWanting } from './notificationPrefs.js';
import type { NotificationCategory } from '@shared/api.js';

/**
 * The shop's e-mails about orders and returns, and the one place they are sent.
 *
 * Sending never holds up the response that caused it, and never fails it:
 * an order is placed whether or not its confirmation reaches an inbox. A
 * failure is logged, which is where it belongs.
 */

const log = createLogger('mail');

const inFlight = new Set<Promise<void>>();

/**
 * Sends in the background, or does nothing where mail is not set up. With a
 * category, only if the person has not turned that kind of e-mail off; without
 * one - account and security mail - always.
 */
export const dispatchShopMail = (
  to: string | null | undefined,
  mail: Email,
  category: NotificationCategory | null = null
): void => {
  if (!to || !mailConfigured()) return;
  const sending: Promise<void> = new Promise<void>((resolve) => {
    setImmediate(() => resolve());
  })
    .then(async () => {
      if (!(await recipientsWanting([to], category, 'email')).length) return;
      await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html });
    })
    .catch((err: unknown) => {
      log.error({ err, subject: mail.subject }, 'Failed to send mail');
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
export const sendShopMailNow = async (to: string, mail: Email): Promise<boolean> => {
  if (!mailConfigured()) return false;
  try {
    await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html });
    return true;
  } catch (err) {
    log.error({ err, subject: mail.subject }, 'Failed to send mail');
    return false;
  }
};

// ---------------------------------------------------------------- content

const taka = (amount: number): string => `${Math.round(amount * 100) / 100} Tk`;

/** The order lines an e-mail is about. */
export interface MailLine {
  title?: string | null;
  quantity?: number | null;
  price?: number | null;
}

const itemsOf = (lines: readonly MailLine[]): NoticeItem[] =>
  lines.map((line) => {
    const quantity = Number(line.quantity) || 1;
    const price = Number(line.price) || 0;
    return {
      title: line.title || 'A book',
      detail: quantity > 1 ? `${quantity} × ${taka(price)}` : undefined,
      amount: taka(price * quantity),
    };
  });

const booksTotalOf = (lines: readonly MailLine[]): number =>
  lines.reduce((sum, line) => sum + (Number(line.price) || 0) * (Number(line.quantity) || 1), 0);

export interface OrderFacts {
  orderNumber: string;
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
export const orderPlacedBuyerEmail = (order: OrderFacts, lines: readonly MailLine[]): Email => {
  const books = booksTotalOf(lines);
  const shipping = Number(order.shippingCharge) || 0;
  const discount = Number(order.discount) || 0;
  return noticeEmail({
    subject: `Order ${order.orderNumber} is confirmed`,
    heading: 'Your order is confirmed',
    preheader: `Thank you! ${taka(books + shipping - discount)} to pay on delivery.`,
    lead: [`Thank you${order.contactName ? `, ${order.contactName}` : ''}! Your order ${order.orderNumber} is confirmed, and the seller is getting it ready.`],
    items: itemsOf(lines),
    facts: [
      ['Books', taka(books)],
      ['Delivery', shipping ? taka(shipping) : 'Free'],
      ...(discount ? ([['Discount', `- ${taka(discount)}`]] as const) : []),
      ['To pay on delivery', taka(books + shipping - discount)],
      ...(addressOf(order) ? ([['Deliver to', addressOf(order)]] as const) : []),
      ...(order.buyerNote ? ([['Your note', order.buyerNote]] as const) : []),
    ],
    button: { label: 'Track your order', path: `/order-tracking/${order.orderNumber}` },
    after: ['You can cancel it from that page until the seller starts preparing it.'],
  });
};

/** To a seller: some of their books were ordered. */
export const orderPlacedSellerEmail = (order: OrderFacts, lines: readonly MailLine[]): Email => {
  const books = booksTotalOf(lines);
  return noticeEmail({
    subject: `New order ${order.orderNumber}`,
    heading: 'You have a new order',
    preheader: `${lines.map((line) => line.title || 'A book').join(', ')}: get it ready to send.`,
    lead: ['Good news: a buyer has ordered from you. Get the books ready and mark the order as it moves on.'],
    items: itemsOf(lines),
    facts: [
      ['Order', order.orderNumber],
      ['Books total', taka(books)],
      [`${'BookStoreBD'} fee (${SELLER_FEE_PERCENT}%)`, `- ${taka(sellerFeeFor(books))}`],
      ['You receive', taka(books - sellerFeeFor(books))],
      ...(order.contactName ? ([['Buyer', order.contactName]] as const) : []),
      ...(order.buyerNote ? ([["Buyer's note", order.buyerNote]] as const) : []),
    ],
    button: { label: 'Open the order', path: `/seller/order-tracking/${order.orderNumber}` },
    after: [`You are paid by bKash once it is delivered and the ${RETURN_WINDOW_DAYS}-day return window has closed.`],
  });
};

/** To the buyer: it arrived. */
export const orderDeliveredBuyerEmail = (order: OrderFacts, lines: readonly MailLine[]): Email =>
  noticeEmail({
    subject: `Order ${order.orderNumber} has been delivered`,
    heading: 'Your order has been delivered',
    preheader: 'Enjoy your books! Tell other readers what you thought.',
    lead: ['Your books have arrived. We hope you enjoy them!'],
    items: itemsOf(lines),
    facts: [['Order', order.orderNumber]],
    button: { label: 'Review your books', path: `/order-tracking/${order.orderNumber}` },
    after: [`Something wrong with a book? You can ask for a return within ${RETURN_WINDOW_DAYS} days, from your orders.`],
  });

/** To a seller: their books arrived, and when they will be paid. */
export const orderDeliveredSellerEmail = (order: OrderFacts, lines: readonly MailLine[], payableFrom: Date): Email => {
  const books = booksTotalOf(lines);
  return noticeEmail({
    subject: `Order ${order.orderNumber} was delivered`,
    heading: 'Your order was delivered',
    preheader: `${taka(books - sellerFeeFor(books))} comes to your bKash once the return window closes.`,
    lead: ['The buyer has received your books.'],
    items: itemsOf(lines),
    facts: [
      ['Order', order.orderNumber],
      ['You receive', taka(books - sellerFeeFor(books))],
      ['Payable from', payableFrom.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })],
    ],
    button: { label: 'Open the order', path: `/seller/order-tracking/${order.orderNumber}` },
    after: ['If the buyer asks for a return in the meantime, the payment waits until it is decided.'],
  });
};

const BY: Record<string, string> = { buyer: 'the buyer', seller: 'the seller', admin: 'BookStoreBD' };

/** To the buyer or a seller: books in the order were cancelled. */
export const orderCancelledEmail = (
  audience: 'buyer' | 'seller',
  order: OrderFacts,
  lines: readonly MailLine[],
  { by, reason, whole }: { by: string; reason?: string | null; whole: boolean }
): Email =>
  noticeEmail({
    subject: `Order ${order.orderNumber} was cancelled`,
    heading: whole ? 'Your order was cancelled' : 'Part of your order was cancelled',
    preheader: `Cancelled by ${BY[by] ?? by}${reason ? `: ${reason}` : '.'}`,
    lead: [
      audience === 'buyer'
        ? whole
          ? `Order ${order.orderNumber} has been cancelled. You will not be charged for it.`
          : `Some books in order ${order.orderNumber} have been cancelled. You will not be charged for them; the rest of the order goes ahead.`
        : `Your books in order ${order.orderNumber} have been cancelled, and the copies are back on sale.`,
    ],
    items: itemsOf(lines),
    facts: [
      ['Cancelled by', BY[by] ?? by],
      ...(reason ? ([['Reason', reason]] as const) : []),
    ],
    button: {
      label: 'Open the order',
      path: audience === 'buyer' ? `/order-tracking/${order.orderNumber}` : `/seller/order-tracking/${order.orderNumber}`,
    },
  });

export interface ReturnFacts {
  orderNumber: string;
  bookTitle: string;
  refundBkash?: string | null;
  defectDescription?: string | null;
}

/** To the buyer: their return was decided. */
export const returnDecidedEmail = (request: ReturnFacts, approved: boolean): Email => {
  const address = (process.env.RETURN_ADDRESS ?? '').trim();
  return approved
    ? noticeEmail({
        subject: `Your return of "${request.bookTitle}" was approved`,
        heading: 'Your return is approved',
        preheader: 'Send the book back and we will refund you by bKash.',
        lead: [`We have approved your return of "${request.bookTitle}" from order ${request.orderNumber}.`],
        facts: [
          ['Next step', address ? `Send the book by courier to:\n${address}` : 'Reply to this e-mail and we will arrange the courier with you.'],
          ['Courier', 'Paid by BookStoreBD'],
          ['Refund', `The book's price, to your bKash${request.refundBkash ? ` ${request.refundBkash}` : ''}, within 15 working days of it reaching us`],
        ],
        button: { label: 'See your orders', path: '/buyer/orders' },
        after: ['The original delivery charge is not refunded.'],
      })
    : noticeEmail({
        subject: `Your return of "${request.bookTitle}" was not approved`,
        heading: 'Your return was not approved',
        preheader: 'Reply to this e-mail if you would like to know why.',
        lead: [
          `We have looked at your return of "${request.bookTitle}" from order ${request.orderNumber}, and could not approve it this time.`,
          'If you think that is wrong, or would like to know why, reply to this e-mail and we will look at it again.',
        ],
        button: { label: 'See your orders', path: '/buyer/orders' },
      });
};

/** To a seller: a buyer wants to send their books back. */
export const returnRequestedSellerEmail = (request: ReturnFacts, titles: readonly string[]): Email =>
  noticeEmail({
    subject: `Return requested for order ${request.orderNumber}`,
    heading: 'A buyer asked for a return',
    preheader: `${titles.join(', ')}: BookStoreBD will decide it.`,
    lead: [`The buyer of order ${request.orderNumber} has asked to return ${titles.length > 1 ? 'these books' : 'this book'}.`],
    items: titles.map((title) => ({ title })),
    facts: [
      ...(request.defectDescription ? ([['What is wrong', request.defectDescription]] as const) : []),
      ['What happens now', 'BookStoreBD looks at the photographs and decides. Your payment for these books waits until then.'],
    ],
    button: { label: 'Open the order', path: `/seller/order-tracking/${request.orderNumber}` },
  });

/** A new member's first e-mail: what the shop is, and where to start. */
export const welcomeEmail = (username: string): Email =>
  noticeEmail({
    subject: `Welcome to BookStoreBD, ${username}!`,
    heading: `Welcome, ${username}!`,
    preheader: 'New and second-hand books, bought and sold by readers across Bangladesh.',
    lead: [
      'Thank you for joining BookStoreBD, where readers across Bangladesh buy and sell new and second-hand books.',
      'Here is what you can do:',
    ],
    items: [
      { title: '🔎 Find any book', detail: 'Search in Bangla or English, filter by condition and price, and catch Quick deals.' },
      { title: '💵 Pay on delivery', detail: 'Cash on delivery, with 7-day returns if a book is not as described.' },
      { title: '🏪 Sell your books', detail: 'List a book in minutes for free, and get paid by bKash.' },
      { title: '🎯 Ask for any book', detail: 'Not listed yet? Ask on the Wanted board and hear the moment it is.' },
    ],
    button: { label: 'See how it works', path: '/how-it-works' },
    after: [
      'Next, finish setting up your profile - your phone and address make checkout quicker.',
      "You received this because you created an account. If that wasn't you, write to us and we will close it.",
    ],
  });

/** A book someone asked for on the Wanted board has been listed. */
export const wantedFoundEmail = (title: string, author: string, link: string): Email =>
  noticeEmail({
    subject: `"${title}" is here`,
    heading: 'The book you wanted is here',
    preheader: `${title} has just been listed on BookStoreBD.`,
    lead: ['Good news: a book you asked for on the Wanted board has just been listed.'],
    items: [{ title, ...(author ? { detail: `by ${author}` } : {}) }],
    button: { label: 'See the book', path: link },
    after: [
      'Copies can go quickly, so have a look soon.',
      'You can turn these e-mails off under Notifications in your profile.',
    ],
  });

/** Two-step sign-in was turned on or off for this account. */
export const twoFactorChangedEmail = (enabled: boolean): Email =>
  noticeEmail({
    subject: enabled ? 'Two-step sign-in is on' : 'Two-step sign-in is off',
    heading: enabled ? 'Two-step sign-in is on' : 'Two-step sign-in is off',
    preheader: enabled
      ? 'From now on, signing in also asks for a code sent to this address.'
      : 'Signing in now needs only your password.',
    lead: enabled
      ? ['From now on, after your password, we will e-mail a one-time code to this address to finish signing in.']
      : ['Signing in to your account now needs only your password. You can turn two-step sign-in back on from your profile.'],
    button: { label: 'Open your profile', path: '/profile' },
    after: ["If you didn't make this change, reset your password from the sign-in page and contact us."],
  });

/** A message from the shop, written by an administrator. */
export const adminMessageEmail = (title: string, body: string, link?: string | null): Email =>
  noticeEmail({
    subject: title,
    heading: title,
    preheader: body.slice(0, 120),
    lead: body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean),
    ...(link ? { button: { label: 'Open BookStoreBD', path: link } } : {}),
  });
