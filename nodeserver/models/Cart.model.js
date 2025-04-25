import mongoose from 'mongoose';

const CartSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'AddBook', required: true, index: true },
}, { timestamps: true });

CartSchema.index({ user: 1, book: 1 }, { unique: true });

export default mongoose.model('Cart', CartSchema);
