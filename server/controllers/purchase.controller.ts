import type { Request, RequestHandler, Response } from 'express';

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
  const userEmail = actingUser(req).email;

  try {
    const newPurchase = new Purchase({
      bookId,
      userEmail,
    });

    await newPurchase.save();
    res.status(201).json({ message: 'Purchase created successfully', purchase: newPurchase });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
};
