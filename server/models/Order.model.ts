import { Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

import { defineModel } from './defineModel.js';

const OrderSchema = new Schema({
  // One document per book, all the books in a basket sharing one order number:
  // that is how the tracking page gathers an order back together. So it cannot
  // be unique on its own - it was, and the second book in a basket collided
  // with the first, failing checkout after the first book's stock was taken.
  orderNumber: { type: String, required: true, index: true },
  status: { type: String, default: 'Order Confirmed' },
  buyerEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  bookId: { type: Schema.Types.ObjectId, ref: 'AddBook', required: true },
  title: String,
  author: String,
  category: [String],
  bookType: String,
  condition: String,
  pages: Number,
  price: Number,
  quantity: Number,
  // --- New fields for full order info ---
  paymentMethod: { type: String, default: '' },
  contactName: { type: String, default: '' },
  contactPhone: { type: String, default: '' },
  deliveryDivision: { type: String, default: '' },
  deliveryDistrict: { type: String, default: '' },
  deliveryAddress: { type: String, default: '' },
  // ---
  shippingCharge: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  promo: { type: String, default: '' },
  promoApplied: { type: Boolean, default: false },
  isReturned: { type: Number, default: 0 },
  defectDescription: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
});

// A book appears once per order. This is the integrity the unique flag above
// was reaching for, expressed at the level that is actually true.
OrderSchema.index({ orderNumber: 1, bookId: 1 }, { unique: true });

export type OrderAttributes = InferSchemaType<typeof OrderSchema>;
export type OrderDocument = HydratedDocument<OrderAttributes>;

/** An order line as a `.lean()` query returns it: a plain object with its id. */
export type LeanOrder = OrderAttributes & { _id: Types.ObjectId };

const Order = defineModel<OrderAttributes>('Order', OrderSchema);
export default Order;
