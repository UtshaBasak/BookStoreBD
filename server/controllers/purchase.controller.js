import Purchase from '../models/Purchase.model.js';

export const getPurchasesByUser = async (req, res) => {
  const email = req.user.email;

  try {
    const purchases = await Purchase.find({ userEmail: email }).populate('bookId');
    res.status(200).json(purchases);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
export const createPurchase = async (req, res) => {
  const bookId = req.body.bookId;
  const userEmail = req.user.email;
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
