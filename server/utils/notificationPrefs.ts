import type { NotificationCategory, NotificationPrefs, NotificationType } from '@shared/api.js';

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
  label: string;
  description: string;
  types: readonly NotificationType[];
  /** Whether anything in this category is ever e-mailed. */
  email: boolean;
  /** Shown to administrators only. */
  adminOnly?: boolean;
}

export const CATEGORIES: readonly CategoryDefinition[] = [
  {
    id: 'orders',
    label: 'Orders',
    description: 'New orders, each step of delivery, and cancellations.',
    types: ['order-placed', 'order-received', 'order-status', 'order-cancelled'],
    email: true,
  },
  {
    id: 'returns',
    label: 'Returns',
    description: 'Return requests and decisions.',
    types: ['return-requested', 'return-decided'],
    email: true,
  },
  { id: 'payouts', label: 'Payouts', description: 'When the shop pays you for sold books.', types: ['payout'], email: false },
  {
    id: 'reviews',
    label: 'Reviews and ratings',
    description: 'New reviews of your books or shop, and replies to yours.',
    types: ['review', 'review-reply', 'seller-review', 'seller-review-reply'],
    email: false,
  },
  {
    id: 'stock',
    label: 'Your stock',
    description: 'Low stock and sold-out listings, and buyers asking for a sold-out book.',
    types: ['stock', 'book-request'],
    email: false,
  },
  {
    id: 'deals',
    label: 'Deals and price drops',
    description: 'Discounts and lower prices on books in your cart or wishlist, and books back in stock.',
    types: ['deal', 'price-drop', 'back-in-stock'],
    email: false,
  },
  {
    id: 'wanted',
    label: 'Wanted books',
    description: 'When a book you asked for on the Wanted board is listed.',
    types: ['wanted-found'],
    email: true,
  },
  {
    id: 'community',
    label: 'Friends',
    description: 'When someone you invited joins.',
    types: ['invite-joined'],
    email: false,
  },
  {
    id: 'announcements',
    label: 'News from BookStoreBD',
    description: 'Messages from the shop: new features, events and offers.',
    types: ['announcement'],
    email: true,
  },
  {
    id: 'moderation',
    label: 'Moderation',
    description: 'Reported reviews and ratings waiting for a decision.',
    types: ['review-reported', 'seller-review-reported'],
    email: false,
    adminOnly: true,
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
