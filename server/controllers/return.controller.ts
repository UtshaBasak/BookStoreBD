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
import { isDuplicateKeyError } from '../utils/error.js';
import { RETURN_WINDOW_DAYS, returnDeadline } from '../config/commerce.js';
import { adminEmails, notify } from '../utils/notify.js';
import { dispatchShopMail, returnDecidedEmail, returnRequestedSellerEmail } from '../utils/shopMail.js';
import { securityEvent } from '../utils/securityLog.js';
import { bnDigits, t } from '../utils/language.js';

const log = createLogger('return');

export const returnBook = async (
  req: Request<unknown, unknown, CreateReturnBody>,
  res: Response
): Promise<void> => {
  try {
    const userEmail = actingUser(req).email;
    const { defectDescription, refundBkash } = req.body;

    /*
     * One book, or a whole order: every line has to be the buyer's own,
     * delivered, inside its window and not already on its way back. If any
     * one is not, nothing is requested - half an order returned by accident
     * is worse than being told which book held it up.
     */
    const ids = [...new Set(req.body.orderId.map(String))];
    const lines = await Order.find({ _id: { $in: ids }, buyerEmail: String(userEmail) }).lean();
    if (lines.length !== ids.length) {
      res.status(404).json({ message: t(req, 'Order not found', 'অর্ডারটি পাওয়া যায়নি') });
      return;
    }

    const already = new Set(
      (await ReturnRequest.find({ orderId: { $in: lines.map((l) => l._id) } }, { orderId: 1 }).lean()).map((r) =>
        String(r.orderId)
      )
    );
    for (const line of lines) {
      const name = lines.length > 1 ? `"${line.title || 'A book'}"` : 'this order';
      const nameBn = lines.length > 1 ? `"${line.title || 'একটি বই'}"` : 'এই অর্ডার';
      const deadline = returnDeadline(line);
      if (!deadline) {
        res.status(409).json({
          message: t(
            req,
            `A return can be requested once ${name} has been delivered.`,
            `${nameBn} ডেলিভারি হওয়ার পর ফেরতের অনুরোধ করা যাবে।`
          ),
        });
        return;
      }
      if (deadline.getTime() < Date.now()) {
        res.status(409).json({
          message: t(
            req,
            `The ${String(RETURN_WINDOW_DAYS)}-day return window for ${name} has closed.`,
            `${nameBn}-এর ${bnDigits(RETURN_WINDOW_DAYS)} দিনের ফেরতের সময়সীমা শেষ হয়ে গেছে।`
          ),
        });
        return;
      }
      // Paid out means the sale is settled; one that reached this point
      // (an order moved back to Delivered by hand) goes to the shop instead.
      if (line.sellerPaidAt) {
        res.status(409).json({
          message: t(
            req,
            `The sale of ${name} has been settled, so please write to us about a return.`,
            `${nameBn}-এর বিক্রির হিসাব মিটে গেছে, তাই ফেরতের জন্য আমাদের লিখুন।`
          ),
        });
        return;
      }
      if (already.has(String(line._id))) {
        res.status(409).json({
          message:
            lines.length > 1
              ? t(req, `A return has already been requested for ${name}.`, `${nameBn}-এর ফেরতের অনুরোধ আগেই করা হয়েছে।`)
              : t(req, 'A return has already been requested for this book.', 'এই বইটির ফেরতের অনুরোধ আগেই করা হয়েছে।'),
        });
        return;
      }
    }

    /*
     * The photographs of the defect, stored with the request so that an
     * administrator decides the return on the evidence.
     */
    const uploaded = collectImages(req);
    // At least one: a return is decided on the photographs, and a request
    // without any can only be answered by asking for them.
    if (!uploaded.images.length) {
      res.status(400).json({
        message: t(req, 'Please add at least one photo showing what is wrong.', 'সমস্যাটি দেখায় এমন অন্তত একটি ছবি দিন।'),
      });
      return;
    }

    // Copied from the order rather than the listing, which may since have
    // been edited or taken down. One request per book, so each can be decided
    // on its own, all carrying the same description and photographs.
    // A request sent twice at once trips the one-request-per-line index,
    // which is the same answer as the check above.
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
    ).catch((err: unknown) => {
      if (isDuplicateKeyError(err)) return null;
      throw err;
    });
    if (!created) {
      res.status(409).json({
        message: t(req, 'A return has already been requested for this book.', 'এই বইটির ফেরতের অনুরোধ আগেই করা হয়েছে।'),
      });
      return;
    }
    // The order line counts as returned only once the return is approved: a
    // request that is turned down leaves the sale as it was.

    const titles = lines.map((line) => line.title || 'A book').join(', ');
    const titlesBn = lines.map((line) => line.title || 'একটি বই').join(', ');
    const orderNumber = lines[0]?.orderNumber ?? '';
    await notify([...new Set(lines.map((line) => line.sellerEmail))], {
      type: 'return-requested',
      title: { en: `A buyer wants to return ${titles}`, bn: `একজন ক্রেতা ফেরত দিতে চান: ${titlesBn}` },
      body: {
        en: `Order ${orderNumber}: "${defectDescription.slice(0, 120)}"`,
        bn: `অর্ডার ${orderNumber}: "${defectDescription.slice(0, 120)}"`,
      },
      link: `/seller/order-tracking/${orderNumber}`,
    });
    await notify(await adminEmails(), {
      type: 'return-requested',
      title: { en: `Return requested: ${titles}`, bn: `ফেরতের অনুরোধ: ${titlesBn}` },
      body: {
        en: `Order ${orderNumber}. Decide it in Return Management.`,
        bn: `অর্ডার ${orderNumber}। রিটার্ন ম্যানেজমেন্টে সিদ্ধান্ত নিন।`,
      },
      link: '/admin/returns',
    });
    // The seller by e-mail as well: it is their sale on hold.
    for (const seller of new Set(lines.map((line) => line.sellerEmail))) {
      dispatchShopMail(
        seller,
        returnRequestedSellerEmail(
          { orderNumber, bookTitle: titles, defectDescription },
          lines.filter((line) => line.sellerEmail === seller).map((line) => line.title || 'A book')
        ),
        'returns'
      );
    }

    res.status(200).json({
      message:
        lines.length > 1
          ? t(req, `Return requested for ${lines.length} books`, `${bnDigits(lines.length)}টি বইয়ের ফেরতের অনুরোধ করা হয়েছে`)
          : t(req, 'Return request submitted successfully', 'ফেরতের অনুরোধ পাঠানো হয়েছে'),
      returnId: created[0]?._id,
      returnIds: created.map((request) => request._id),
    });
  } catch (error) {
    log.error({ err: error }, 'Failed to process return request');
    res.status(500).json({ message: t(req, 'Failed to process return request', 'ফেরতের অনুরোধটি নেওয়া যায়নি') });
  }
};

/**
 * One page of return requests, newest first.
 *
 * A request carries its defect photographs as base64 on the document, so the
 * list sends addresses for them instead, fetched only when one is looked at.
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
    res.status(500).json({ message: t(req, 'Error fetching return requests', 'ফেরতের অনুরোধগুলো আনা যায়নি') });
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
      res.status(404).json({ message: t(req, 'Return request not found', 'ফেরতের অনুরোধটি পাওয়া যায়নি') });
      return;
    }

    if (actor.role !== 'admin' && request.userEmail !== actor.email) {
      securityEvent(req, 'authz.denied', { reason: 'not_owner', extra: { resource_type: 'return_request' } });
      res.status(403).json({ message: t(req, 'That return request is not yours', 'এই ফেরতের অনুরোধটি আপনার নয়') });
      return;
    }

    const image = request.images?.[Number(req.params.index ?? 0)];
    if (!serveStoredImage(req, res, image)) {
      res.status(404).json({ message: t(req, 'Image not found', 'ছবিটি পাওয়া যায়নি') });
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
    const actor = actingUser(req);

    /*
     * A return is decided once. Only a pending request can be decided, and
     * the decision is made in the same step that checks it is pending, so a
     * second click or a second administrator is told it is decided rather
     * than sending the buyer and the seller a contradicting notice - and a
     * sale already paid out is never reopened.
     */
    const updatedRequest = await ReturnRequest.findOneAndUpdate(
      { _id: String(id), status: 'pending' },
      { $set: { status, decidedAt: new Date(), decidedBy: actor.email ?? '' } },
      { returnDocument: 'after' }
    );

    if (!updatedRequest) {
      const existing = await ReturnRequest.findById(String(id), { status: 1 }).lean();
      if (!existing) {
        res.status(404).json({ message: t(req, 'Return request not found', 'ফেরতের অনুরোধটি পাওয়া যায়নি') });
        return;
      }
      res.status(409).json({
        message: t(
          req,
          `This return has already been ${existing.status === 'approved' ? 'approved' : 'turned down'}.`,
          `এই ফেরতের অনুরোধ আগেই ${existing.status === 'approved' ? 'অনুমোদিত হয়েছে' : 'নাকচ করা হয়েছে'}।`
        ),
      });
      return;
    }

    // An approved return takes the line out of the seller's sales, the
    // bestseller counts and the shop's fees.
    if (status === 'approved') {
      await Order.updateOne(
        updatedRequest.orderId
          ? { _id: updatedRequest.orderId }
          : { orderNumber: updatedRequest.orderNumber, bookId: updatedRequest.bookId },
        { $set: { isReturned: 1 } }
      );
    }

    const decided = status === 'approved' ? 'approved' : 'turned down';
    const decidedBn = status === 'approved' ? 'অনুমোদিত হয়েছে' : 'গ্রহণ করা হয়নি';
    await notify([updatedRequest.userEmail], {
      type: 'return-decided',
      title: {
        en: `Your return of "${updatedRequest.bookTitle}" was ${decided}`,
        bn: `"${updatedRequest.bookTitle}" ফেরতের অনুরোধ ${decidedBn}`,
      },
      body:
        status === 'approved'
          ? {
              en: 'Send the book back to us; the refund goes to your bKash within 15 working days of it arriving.',
              bn: 'বইটি আমাদের কাছে ফেরত পাঠান; বই পৌঁছানোর ১৫ কর্মদিবসের মধ্যে টাকা আপনার বিকাশে যাবে।',
            }
          : {
              en: 'Write to support if you would like to know why.',
              bn: 'কারণ জানতে চাইলে সাপোর্টে লিখুন।',
            },
      link: '/buyer-books',
    });
    dispatchShopMail(
      updatedRequest.userEmail,
      returnDecidedEmail(
        {
          orderNumber: updatedRequest.orderNumber ?? '',
          bookTitle: updatedRequest.bookTitle ?? 'your book',
          refundBkash: updatedRequest.refundBkash,
        },
        status === 'approved'
      ),
      'returns'
    );
    await notify([updatedRequest.sellerEmail], {
      type: 'return-decided',
      title: {
        en: `The return of "${updatedRequest.bookTitle}" was ${decided}`,
        bn: `"${updatedRequest.bookTitle}" ফেরতের অনুরোধ ${decidedBn}`,
      },
      body: { en: `Order ${updatedRequest.orderNumber}.`, bn: `অর্ডার ${updatedRequest.orderNumber}।` },
      link: '/seller-orders',
    });

    await recordAudit(req, {
      action: 'return.status',
      targetType: 'returnRequest',
      targetId: String(updatedRequest._id),
      details: { status, bookTitle: updatedRequest.bookTitle },
    });

    res.json(updatedRequest);
  } catch (error) {
    log.error({ err: error }, 'Error updating return request');
    res.status(500).json({ message: t(req, 'Error updating return request', 'ফেরতের অনুরোধটি আপডেট করা যায়নি') });
  }
};
