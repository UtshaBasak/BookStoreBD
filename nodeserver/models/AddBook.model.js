import mongoose from 'mongoose';

const AddBookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: { type: String, required: true },
  publisher: { type: String, required: true },
  country: { type: String, required: true },
  language: { type: String, required: true },
  isbn: { type: String, required: true },
  pages: { type: Number, required: true },
  price: { type: Number, required: true, min: 0 }, // allow zero
  desc: { type: String, required: true },
  category: [{ type: String, required: true }],
  bookType: { type: String, enum: ['new', 'old'], required: true },
  condition: { type: String },
  conditionDetails: { type: String },
  images: [{ type: String }], // Now stores base64 strings
  createdAt: { type: Date, default: Date.now },
  sellerEmail: { type: String, required: true }, // NEW: track seller
  stock: { type: Number, default: 1, min: 0 }    // allow zero
});
const AddBook = mongoose.model('AddBook', AddBookSchema);
export default AddBook;
