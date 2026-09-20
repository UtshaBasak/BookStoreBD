import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true }, // Unique order ID
  status: { type: String, default: 'Order Confirmed' },
  buyerEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'AddBook', required: true },
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

const Order = mongoose.model('Order', OrderSchema);
export default Order;
