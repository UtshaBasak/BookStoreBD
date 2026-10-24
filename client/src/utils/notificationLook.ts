import type { NotificationType } from '@shared/api.js';

import { formatDate, formatNumber, t } from './language.js';

/** A small picture for each kind of notification, so a list of them can be read at a glance. */
export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  'order-placed': '📦',
  'order-received': '🛒',
  'order-status': '🚚',
  'order-cancelled': '✖️',
  stock: '📉',
  'return-requested': '↩️',
  'return-decided': '✅',
  payout: '💸',
  review: '⭐',
  'review-reply': '💬',
  'review-reported': '🚩',
  'seller-review': '🏅',
  'seller-review-reply': '💬',
  'seller-review-reported': '🚩',
  deal: '⚡',
  'price-drop': '🏷️',
  'book-request': '🙋',
  'back-in-stock': '📚',
  'selling-out': '⏳',
  'wanted-found': '🎯',
  'invite-joined': '🤝',
  welcome: '👋',
  'shop-message': '✉️',
  announcement: '📣',
};

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export const timeAgo = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return t('just now', 'এইমাত্র');
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return t(`${minutes} min ago`, `${formatNumber(minutes)} মিনিট আগে`);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return t(`${hours} h ago`, `${formatNumber(hours)} ঘণ্টা আগে`);
  const days = Math.round(hours / 24);
  if (days < 7) return t(`${days} ${days === 1 ? 'day' : 'days'} ago`, `${formatNumber(days)} দিন আগে`);
  return formatDate(iso, { day: 'numeric', month: 'short', year: 'numeric' }, 'en-GB');
};
