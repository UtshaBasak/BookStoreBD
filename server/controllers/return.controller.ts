import type { Request, RequestHandler, Response } from 'express';

import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
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
import { RETURN_WINDOW_DAYS, returnDeadline } from '../config/commerce.js';
import { adminEmails, notify } from '../utils/notify.js';

const log = createLogger('return');

export const returnBook = async (
  req: Request<unknown, unknown, CreateReturnBody>,
  res: Response
): Promise<void> => {
  try {
    const userEmail = actingUser(req).email;
    const { defectDescription, refundBkash } = req.body;

    /*
     * The buyer's own order line, delivered, and inside the window.
     *
     * This took a book id and nothing else: it did not check that the person
     * asking had bought the book, and the three-day limit lived only in the
     * browser, so a request for any book at any time was accepted.
     */
    /*
     * One book, or a whole order: every line has to be the buyer's own,
     * delivered, inside its window and not already on its way back. If any
     * one is not, nothing is requested - half an order returned by accident
     * is worse than being told which book held it up.
     */
    const ids = [...new Set(req.body.orderId.map(String))];
    const lines = await Order.find({ _id: { $in: ids }, buyerEmail: String(userEmail) }).lean();
    if (lines.length !== ids.length) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }

    const already = new Set(
      (await ReturnRequest.find({ orderId: { $in: lines.map((l) => l._id) } }, { orderId: 1 }).lean()).map((r) =>
        String(r.orderId)
      )
    );
    for (const line of lines) {
      const name = lines.length > 1 ? `"${line.title || 'A book'}"` : 'this order';
      const deadline = returnDeadline(line);
      if (!deadline) {
        res.status(409).json({ message: `A return can be requested once ${name} has been delivered.` });
        return;
      }
      if (deadline.getTime() < Date.now()) {
        res.status(409).json({
          message: `The ${String(RETURN_WINDOW_DAYS)}-day return window for ${name} has closed.`,
        });
        return;
      }
      if (already.has(String(line._id))) {
        res.status(409).json({
          message: lines.length > 1 ? `A return has already been requested for ${name}.` : 'A return has already been requested for this book.',
        });
        return;
      }
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

    // Copied from the order rather than the listing, which may since have
    // been edited or taken down. One request per book, so each can be decided
    // on its own, all carrying the same description and photographs.
    const created = await ReturnRequest.insertMany(
      lines.map((line) => ({
        orderId: line._id,
        orderNumber: line.orderNumber,
        bookId: line.bookId,
        bookTitle: line.title || 'Untitled',
        userEmail,
        sellerEmail: line.sellerEmail,
        defectDescription,
        refundBkash,
        images: uploaded.images,
        imagePublicIds: uploaded.publicIds,
        status: 'pending',
      }))
    );

    // Update the order status
    await Order.updateMany({ _id: { $in: lines.map((line) => line._id) } }, { isReturned: 1 });

    const titles = lines.map((line) => line.title || 'A book').join(', ');
    const orderNumber = lines[0]?.orderNumber ?? '';
    await notify([...new Set(lines.map((line) => line.sellerEmail))], {
      type: 'return-requested',
      title: `A buyer wants to return ${titles}`,
      body: `Order ${orderNumber}: "${defectDescription.slice(0, 120)}"`,
      link: `/seller/order-tracking/${orderNumber}`,
    });
    await notify(await adminEmails(), {
      type: 'return-requested',
      title: `Return requested: ${titles}`,
      body: `Order ${orderNumber}. Decide it in Return Management.`,
      link: '/admin/returns',
    });

    res.status(200).json({
      message: lines.length > 1 ? `Return requested for ${lines.length} books` : 'Return request submitted successfully',
      returnId: created[0]?._id,
      returnIds: created.map((request) => request._id),
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
      ...(query.status ? { status: query.status } : {}),
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
        .sort(query.sort === 'oldest' ? { createdAt: 1, _id: 1 } : { createdAt: -1, _id: -1 })
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
      String(id),
      { status: String(status) },
      { returnDocument: 'after' }
    );

    if (!updatedRequest) {
      res.status(404).json({ message: 'Return request not found' });
      return;
    }

    if (status !== 'pending') {
      const decided = status === 'approved' ? 'approved' : 'turned down';
      await notify([updatedRequest.userEmail], {
        type: 'return-decided',
        title: `Your return of "${updatedRequest.bookTitle}" was ${decided}`,
        body:
          status === 'approved'
            ? 'Send the book back to us; the refund goes to your bKash within 15 working days of it arriving.'
            : 'Write to support if you would like to know why.',
        link: '/buyer-books',
      });
      await notify([updatedRequest.sellerEmail], {
        type: 'return-decided',
        title: `The return of "${updatedRequest.bookTitle}" was ${decided}`,
        body: `Order ${updatedRequest.orderNumber}.`,
        link: '/seller-orders',
      });
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
