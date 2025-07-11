import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import AddBook from '../models/AddBook.model.js';

export const returnBook = async (req, res) => {
  try {
    const { bookId, userEmail, defectDescription } = req.body;
    
    // Get the book details
    const book = await AddBook.findById(bookId);
    if (!book) {
      return res.status(404).json({ message: 'Book not found' });
    }

    // Create return request
    const returnRequest = new ReturnRequest({
      bookId,
      bookTitle: book.title,
      userEmail,
      sellerEmail: book.sellerEmail,
      defectDescription,
      status: 'pending'
    });

    await returnRequest.save();
    
    // Update the order status
    await Order.findOneAndUpdate(
      { bookId, buyerEmail: userEmail },
      { isReturned: 1 }
    );

    res.status(200).json({ 
      message: 'Return request submitted successfully',
      returnId: returnRequest._id
    });
  } catch (error) {
    console.error('Return Error:', error);
    res.status(500).json({ message: 'Failed to process return request' });
  }
};

export const getReturnRequests = async (req, res) => {
  try {
    const { userEmail } = req.query;
    const query = userEmail ? { userEmail } : {};
    const requests = await ReturnRequest.find(query).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching return requests' });
  }
};

export const updateReturnStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const updatedRequest = await ReturnRequest.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );

    if (!updatedRequest) {
      return res.status(404).json({ message: 'Return request not found' });
    }

    res.json(updatedRequest);
  } catch (error) {
    console.error('Error updating return request:', error);
    res.status(500).json({ message: 'Error updating return request' });
  }
};