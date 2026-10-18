import type { Request, RequestHandler, Response } from 'express';

import AddBook from '../models/AddBook.model.js';
import Purchase from '../models/Purchase.model.js';
import { actingUser } from '../middleware/auth.js';
import type { CreatePurchaseBody } from '../schemas/index.js';
import { errorMessage } from '../utils/error.js';

export const getPurchasesByUser: RequestHandler = async (req, res) => {
  const { email } = actingUser(req);

  try {
    const purchases = await Purchase.find({ userEmail: email }).populate('bookId');
    res.status(200).json(purchases);
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};

export const createPurchase = async (
  req: Request<unknown, unknown, CreatePurchaseBody>,
  res: Response
): Promise<void> => {
  const bookId = req.body.bookId;
  const quantity = req.body.quantity ?? 1;
  const userEmail = actingUser(req).email;

  try {
    // A record of buying a book that exists, and how many copies.
    if (!(await AddBook.exists({ _id: bookId }))) {
      res.status(404).json({ message: 'Book not found' });
      return;
    }
    const newPurchase = new Purchase({
      bookId,
      userEmail,
      quantity,
    });

    await newPurchase.save();
    res.status(201).json({ message: 'Purchase created successfully', purchase: newPurchase });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};
