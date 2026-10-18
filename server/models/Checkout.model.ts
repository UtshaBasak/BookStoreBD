import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * One buyer's checkout in progress.
 *
 * Held for as long as an order is being placed, so a second checkout by the
 * same buyer - a double click, two tabs, a retried request - waits its turn
 * instead of running alongside: two at once could both take stock, and both
 * see "no orders yet" and use the first-order code.
 */
const CheckoutLockSchema = new Schema({
  buyerEmail: { type: String, required: true, unique: true },
  /** Which request holds it, so a request only ever releases its own lock. */
  token: { type: String, required: true },
  /** A lock left by a crash runs out rather than blocking the buyer for good. */
  expiresAt: { type: Date, required: true },
});

CheckoutLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

/**
 * What a placed order answered, kept under the checkout id the browser or
 * app sent with it. The same request sent again - a retry after a dropped
 * connection, a second tap - gets the same order back rather than a second
 * one.
 */
const CheckoutReceiptSchema = new Schema({
  buyerEmail: { type: String, required: true },
  checkoutId: { type: String, required: true },
  orderNumber: { type: String, required: true },
  response: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
});

CheckoutReceiptSchema.index({ buyerEmail: 1, checkoutId: 1 }, { unique: true });
// A week is far longer than any retry; after that the id is forgotten.
CheckoutReceiptSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export type CheckoutLockAttributes = InferSchemaType<typeof CheckoutLockSchema>;
export type CheckoutLockDocument = HydratedDocument<CheckoutLockAttributes>;
export type CheckoutReceiptAttributes = InferSchemaType<typeof CheckoutReceiptSchema>;

export const CheckoutLock = defineModel<CheckoutLockAttributes>('CheckoutLock', CheckoutLockSchema);
export const CheckoutReceipt = defineModel<CheckoutReceiptAttributes>('CheckoutReceipt', CheckoutReceiptSchema);
