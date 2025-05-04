import mongoose from 'mongoose';

const purchaseSchema = new mongoose.Schema({
  bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'AddBook', required: true },
  userEmail: { type: String, required: true },
  date: { type: Date, default: Date.now },
  isReturned: { type: Boolean, default: false },
});

export default mongoose.model('Purchase', purchaseSchema);