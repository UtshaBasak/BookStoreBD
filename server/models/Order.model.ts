import { Schema, type HydratedDocument, type InferSchemaType, type Types } from 'mongoose';

import { defineModel } from './defineModel.js';

const OrderSchema = new Schema({
  orderNumber: { type: String, required: true, unique: true }, // Unique order ID
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

export type OrderAttributes = InferSchemaType<typeof OrderSchema>;
export type OrderDocument = HydratedDocument<OrderAttributes>;

/** An order line as a `.lean()` query returns it: a plain object with its id. */
export type LeanOrder = OrderAttributes & { _id: Types.ObjectId };

const Order = defineModel<OrderAttributes>('Order', OrderSchema);
export default Order;
