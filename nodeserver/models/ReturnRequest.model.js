import mongoose from 'mongoose';

const returnRequestSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'AddBook', required: true },
  bookTitle: { type: String, required: true },
  userEmail: { type: String, required: true },
  sellerEmail: { type: String, required: true },
  defectDescription: { type: String, required: true },
  images: [String],
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model('ReturnRequest', returnRequestSchema);
