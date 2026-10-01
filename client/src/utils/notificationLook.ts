import type { NotificationType } from '@shared/api.js';

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
  announcement: '📣',
};

/** "just now", "5 min ago", "3 h ago", "2 days ago", then the date. */
export const timeAgo = (iso: string, now: number = Date.now()): string => {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};
