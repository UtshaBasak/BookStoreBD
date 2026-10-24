import type { NotificationCategory, NotificationPrefs, NotificationType } from '@shared/api.js';

import { type Bilingual } from './language.js';
import User from '../models/user.model.js';

/**
 * What people can choose to hear about, in the app and by e-mail.
 *
 * Everything starts on; a person turns off what they do not want. Codes,
 * sign-in alerts and changes to the account itself are not here: those are
 * always sent, because missing one can cost someone their account.
 */
export interface CategoryDefinition {
  id: NotificationCategory;
  label: Bilingual;
  description: Bilingual;
  types: readonly NotificationType[];
  /** Whether anything in this category is ever e-mailed. */
  email: boolean;
  /**
   * Who it ever reaches, so nobody is offered a switch for something they
   * never get: buyers and sellers ("members"), administrators, or both.
   * Administrators hear about orders, cancellations, return requests and
   * reports - not payouts, the Wanted board, invitations or the shop's own
   * news, which they write.
   */
  audience: 'members' | 'admins' | 'everyone';
}

export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: 'orders',
    label: { en: 'Orders', bn: 'অর্ডার' },
    description: {
      en: 'New orders, each step of delivery, and cancellations.',
      bn: 'নতুন অর্ডার, ডেলিভারির প্রতিটি ধাপ এবং অর্ডার বাতিল।',
    },
    types: ['order-placed', 'order-received', 'order-status', 'order-cancelled'],
    email: true,
    audience: 'everyone',
  },
  {
    id: 'returns',
    label: { en: 'Returns', bn: 'রিটার্ন' },
    description: {
      en: 'Return requests and decisions.',
      bn: 'রিটার্নের অনুরোধ ও সিদ্ধান্ত।',
    },
    types: ['return-requested', 'return-decided'],
    email: true,
    audience: 'everyone',
  },
  {
    id: 'payouts',
    label: { en: 'Payouts', bn: 'পেআউট' },
    description: {
      en: 'When the shop pays you for sold books.',
      bn: 'বিক্রি হওয়া বইয়ের টাকা শপ পাঠালে।',
    },
    types: ['payout'],
    email: true,
    audience: 'members',
  },
  {
    id: 'reviews',
    label: { en: 'Reviews and ratings', bn: 'রিভিউ ও রেটিং' },
    description: {
      en: 'New reviews of your books or shop, and replies to yours.',
      bn: 'আপনার বই বা শপের নতুন রিভিউ এবং আপনার রিভিউয়ের উত্তর।',
    },
    types: ['review', 'review-reply', 'seller-review', 'seller-review-reply'],
    email: false,
    audience: 'members',
  },
  {
    id: 'stock',
    label: { en: 'Your stock', bn: 'আপনার স্টক' },
    description: {
      en: 'Low stock and sold-out listings, and buyers asking for a sold-out book.',
      bn: 'স্টক কমে গেলে বা শেষ হয়ে গেলে, এবং স্টক-আউট বই কেউ চাইলে।',
    },
    types: ['stock', 'book-request'],
    email: false,
    audience: 'members',
  },
  {
    id: 'deals',
    label: { en: 'Deals and price drops', bn: 'ডিল ও দাম কমা' },
    description: {
      en: 'Discounts and lower prices on books in your cart or wishlist, books back in stock, and books selling out.',
      bn: 'আপনার কার্ট বা উইশলিস্টের বইয়ে ছাড় ও কম দাম, বই আবার স্টকে এলে এবং বই ফুরিয়ে এলে।',
    },
    types: ['deal', 'price-drop', 'back-in-stock', 'selling-out'],
    email: false,
    audience: 'members',
  },
  {
    id: 'wanted',
    label: { en: 'Wanted books', bn: 'চাওয়া বই' },
    description: {
      en: 'When a book you asked for on the Wanted board is listed.',
      bn: 'ওয়ান্টেড বোর্ডে আপনার চাওয়া বই তালিকাভুক্ত হলে।',
    },
    types: ['wanted-found'],
    email: true,
    audience: 'members',
  },
  {
    id: 'community',
    label: { en: 'Friends', bn: 'বন্ধুরা' },
    description: {
      en: 'When someone you invited joins.',
      bn: 'আপনার আমন্ত্রণ পেয়ে কেউ যোগ দিলে।',
    },
    types: ['invite-joined'],
    email: false,
    audience: 'members',
  },
  {
    id: 'announcements',
    label: { en: 'News from BookStoreBD', bn: 'বুকস্টোরবিডির খবর' },
    description: {
      en: 'Messages from the shop: new features, events and offers.',
      bn: 'শপের বার্তা: নতুন সুবিধা, ইভেন্ট ও অফার।',
    },
    types: ['announcement'],
    email: true,
    audience: 'members',
  },
  {
    id: 'moderation',
    label: { en: 'Moderation', bn: 'মডারেশন' },
    description: {
      en: 'Reported reviews and ratings waiting for a decision.',
      bn: 'সিদ্ধান্তের অপেক্ষায় থাকা রিপোর্ট করা রিভিউ ও রেটিং।',
    },
    types: ['review-reported', 'seller-review-reported'],
    email: false,
    audience: 'admins',
  },
];

const BY_TYPE = new Map<NotificationType, NotificationCategory>(
  CATEGORIES.flatMap((category) => category.types.map((type) => [type, category.id] as const))
);

/** The category a notification belongs to; none for the ones always sent. */
export const categoryOf = (type: NotificationType): NotificationCategory | null => BY_TYPE.get(type) ?? null;

export type Channel = 'inApp' | 'email';

/** On unless turned off. */
export const wants = (prefs: NotificationPrefs | null | undefined, category: NotificationCategory, channel: Channel): boolean =>
  prefs?.[category]?.[channel] !== false;

/** The people, of these, who want this kind of message on this channel. */
export const recipientsWanting = async (
  emails: readonly string[],
  category: NotificationCategory | null,
  channel: Channel
): Promise<string[]> => {
  if (!category || !emails.length) return [...emails];
  const users = await User.find({ email: { $in: emails } }, { email: 1, notificationPrefs: 1 }).lean();
  const refused = new Set(
    users.filter((user) => !wants(user.notificationPrefs as NotificationPrefs, category, channel)).map((user) => user.email)
  );
  return emails.filter((email) => !refused.has(email));
};

/** Only known categories, and only true or false: what is stored is what the form can send. */
export const cleanPrefs = (input: unknown): NotificationPrefs => {
  const out: NotificationPrefs = {};
  if (!input || typeof input !== 'object') return out;
  for (const category of CATEGORIES) {
    const value = (input as Record<string, unknown>)[category.id];
    if (!value || typeof value !== 'object') continue;
    const { inApp, email } = value as { inApp?: unknown; email?: unknown };
    out[category.id] = { inApp: inApp !== false, email: category.email ? email !== false : true };
  }
  return out;
};
