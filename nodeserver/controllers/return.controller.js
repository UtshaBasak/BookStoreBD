import Order from '../models/Order.model.js';

export const returnBook = async (req, res) => {
  const { bookId, userEmail ,defectDescription } = req.body;
  console.log('Received data:', req.body); // Log the received data for debugging

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

    // // Check if the purchase was made within the last 3 days
    // console.log('Purchase date:', purchase.createdAt); // Log the purchase date for debugging
    // console.log('Current date:', new Date()); // Log the current date for debugging
    // const purchaseDate = new Date(purchase.createdAt);
    // const currentDate = new Date();
    // const diffInDays = (currentDate - purchaseDate) / (1000 * 60 * 60 * 24);
    

    // if (diffInDays > 3) {
    //   return res.status(400).json({ message: 'Return period has expired' });
    
    // }
    if (purchase.isReturned) {
      return res.status(400).json({ message: 'Book has already been returned' });
    }

    // Mark the book as returned
    purchase.isReturned = 1;
    purchase.defectDescription = defectDescription; 
    await purchase.save();

    res.status(200).json({ message: 'Book returned successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};