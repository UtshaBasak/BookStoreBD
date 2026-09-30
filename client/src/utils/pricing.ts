import type { Book } from '@shared/api.js';

/**
 * What a copy costs the buyer: the sale price when the seller has given a
 * discount, the listed price otherwise. The server works the sale price out
 * and charges it (server/config/pricing.ts); this only reads it.
 */
export const priceOf = (book: Pick<Book, 'price' | 'salePrice'>): number => Number(book.salePrice ?? book.price ?? 0);

/** Whether the book is on a deal. */
export const hasDeal = (book: Pick<Book, 'discountPercent'>): boolean => Number(book.discountPercent ?? 0) > 0;

/** Taka, as the shop writes it. */
export const taka = (amount: number): string => `৳${Number(amount).toLocaleString('en-IN')}`;
