import type { Request, RequestHandler, Response } from 'express';

import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import AddBook from '../models/AddBook.model.js';
import { actingUser } from '../middleware/auth.js';
import type {
  CreateReturnBody,
  ReturnListQuery,
  UpdateReturnStatusBody,
} from '../schemas/index.js';
import { validatedQuery } from '../middleware/validate.js';
import { collectImages } from '../utils/uploadedImages.js';
import { contains } from '../utils/regex.js';
import { serveStoredImage } from '../utils/serveImage.js';
import { API_PREFIX } from '../config/apiPaths.js';
import { createLogger } from '../config/logger.js';
import { recordAudit } from '../utils/audit.js';

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

    /*
     * The photographs of the defect.
     *
     * They were being thrown away: the form uploaded them to
     * /user/upload-images, which handed back base64 and stored nothing, and
     * the request was then created without them. A buyer was asked to
     * photograph the damage and an administrator decided the return with no
     * evidence.
     */
    const uploaded = collectImages(req);

    const returnRequest = new ReturnRequest({
      bookId,
      bookTitle: book.title,
      userEmail,
      sellerEmail: book.sellerEmail,
      defectDescription,
      images: uploaded.images,
      imagePublicIds: uploaded.publicIds,
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

/**
 * One page of return requests, newest first.
 *
 * This answered with every request, and a request carries the photographs of
 * the defect as base64 on the document - so the administrator's table of seven
 * columns downloaded every picture anybody had ever uploaded, to draw a button
 * that said "View Images". The pictures are addresses now, fetched only when
 * one is actually looked at.
 */
export const getReturnRequests: RequestHandler = async (req, res) => {
  try {
    // Administrators see every request; everyone else sees only their own.
    const actor = actingUser(req);
    const query = validatedQuery<ReturnListQuery>(req);

    const pattern = query.search ? contains(query.search) : null;
    const filter: Record<string, unknown> = {
      ...(actor.role === 'admin' ? {} : { userEmail: actor.email }),
      ...(pattern
        ? {
            $or: [
              { bookTitle: pattern },
              { userEmail: pattern },
              { sellerEmail: pattern },
              { defectDescription: pattern },
            ],
          }
        : {}),
    };

    const [requests, total] = await Promise.all([
      ReturnRequest.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((query.page - 1) * query.pageSize)
        .limit(query.pageSize)
        .lean(),
      ReturnRequest.countDocuments(filter),
    ]);

    const items = requests.map((request) => ({
      ...request,
      images: (request.images ?? []).map(
        (_image, index) => `${API_PREFIX}/return/requests/${String(request._id)}/image/${String(index)}`
      ),
    }));

    res.json({
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    });
  } catch (error) {
    log.error({ err: error }, 'Error fetching return requests');
    res.status(500).json({ message: 'Error fetching return requests' });
  }
};

/**
 * One photograph from a return request.
 *
 * Visible to an administrator, who decides the request, and to the buyer who
 * uploaded it. Nobody else: a defect photograph is somebody's property and
 * their address label may well be in the frame.
 */
export const getReturnImage: RequestHandler<{ id: string; index?: string }> = async (
  req,
  res,
  next
) => {
  try {
    const actor = actingUser(req);
    const request = await ReturnRequest.findById(req.params.id)
      .select('images userEmail')
      .lean();

    if (!request) {
      res.status(404).json({ message: 'Return request not found' });
      return;
    }

    if (actor.role !== 'admin' && request.userEmail !== actor.email) {
      res.status(403).json({ message: 'That return request is not yours' });
      return;
    }

    const image = request.images?.[Number(req.params.index ?? 0)];
    if (!serveStoredImage(req, res, image)) {
      res.status(404).json({ message: 'Image not found' });
    }
  } catch (error) {
    next(error);
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

    await recordAudit(req, {
      action: 'return.status',
      targetType: 'returnRequest',
      targetId: String(updatedRequest._id),
      details: { status, bookTitle: updatedRequest.bookTitle },
    });

    res.json(updatedRequest);
  } catch (error) {
    log.error({ err: error }, 'Error updating return request');
    res.status(500).json({ message: 'Error updating return request' });
  }
};
