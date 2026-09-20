import type { Request, RequestHandler, Response } from 'express';

import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import AddBook from '../models/AddBook.model.js';
import { actingUser } from '../middleware/auth.js';
import type { CreateReturnBody, UpdateReturnStatusBody } from '../schemas/index.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('return');

export const returnBook = async (
  req: Request<unknown, unknown, CreateReturnBody>,
  res: Response
): Promise<void> => {
  try {
    const bookId = req.body.bookId;
    const userEmail = actingUser(req).email;
    const defectDescription = req.body.defectDescription;

    // Get the book details
    const book = await AddBook.findById(bookId);
    if (!book) {
      res.status(404).json({ message: 'Book not found' });
      return;
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
    log.error({ err: error }, 'Failed to process return request');
    res.status(500).json({ message: 'Failed to process return request' });
  }
};

export const getReturnRequests: RequestHandler = async (req, res) => {
  try {
    // Administrators see every request; everyone else sees only their own.
    const actor = actingUser(req);
    const requests = await (actor.role === 'admin'
      ? ReturnRequest.find()
      : ReturnRequest.find({ userEmail: actor.email })
    ).sort({ createdAt: -1 });
    res.json(requests);
  } catch (error) {
    log.error({ err: error }, 'Error fetching return requests');
    res.status(500).json({ message: 'Error fetching return requests' });
  }
};

export const updateReturnStatus = async (
  req: Request<{ id: string }, unknown, UpdateReturnStatusBody>,
  res: Response
): Promise<void> => {
  try {
    const id = req.params.id;
    const status = req.body.status;

    const updatedRequest = await ReturnRequest.findByIdAndUpdate(
      id,
      { status },
      { returnDocument: 'after' }
    );

    if (!updatedRequest) {
      res.status(404).json({ message: 'Return request not found' });
      return;
    }

    res.json(updatedRequest);
  } catch (error) {
    log.error({ err: error }, 'Error updating return request');
    res.status(500).json({ message: 'Error updating return request' });
  }
};
