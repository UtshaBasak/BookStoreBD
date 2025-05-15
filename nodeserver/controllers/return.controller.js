import Order from '../models/Order.model.js';

export const returnBook = async (req, res) => {
  const { bookId, userEmail ,defectDescription } = req.body;
  console.log('Received data:', req.body); 
  try {
    // Find the purchase record for the book and user
    const threeDaysAgo = new Date();
threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

const purchase = await Order.findOne({
  bookId,
  buyerEmail: userEmail,
  createdAt: { $gte: threeDaysAgo }
});


    if (!purchase) {
      return res.status(404).json({ message: 'Purchase record not found within expired date' });
    }

    
    if (purchase.isReturned) {
      return res.status(400).json({ message: 'Book has already been returned' });
    }

    // Mark the book as returned
    console.log('purchase:',purchase);
    purchase.isReturned = 1;
    purchase.defectDescription = defectDescription; 
    console.log('response:',purchase);
  
    await purchase.save();

    res.status(200).json({ message: 'Book returned successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};