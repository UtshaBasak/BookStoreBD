import Purchase from '../models/Purchase.model.js';
import { asTrimmedString } from '../utils/sanitize.js';

export const getPurchasesByUser = async (req, res) => {
  const email = asTrimmedString(req.query.email);

  try {
    const purchases = await Purchase.find({ userEmail: email }).populate('bookId');
    res.status(200).json(purchases);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const createPurchase = async (req, res) => {
  const bookId = asTrimmedString(req.body.bookId);
  const userEmail = asTrimmedString(req.body.userEmail);
  const { quantity } = req.body;

  try {
    const newPurchase = new Purchase({
      bookId,
      userEmail,
      quantity,
    });

    await newPurchase.save();
    res.status(201).json({ message: 'Purchase created successfully', purchase: newPurchase });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
