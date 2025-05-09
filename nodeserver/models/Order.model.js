import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema({
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
  orderNumber: { type: String, required: true },
  shippingCharge: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  promo: { type: String, default: '' },
  promoApplied: { type: Boolean, default: false },
  status: {
    type: String,
    enum: [
      'Order Confirmed',
      'Processing',
      'Shipped',
      'Out for Delivery',
      'Delivered'
    ],
    default: 'Order Confirmed'
  },
  createdAt: { type: Date, default: Date.now }
});

const Order = mongoose.model('Order', OrderSchema);
export default Order;

