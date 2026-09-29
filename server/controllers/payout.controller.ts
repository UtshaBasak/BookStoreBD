import type { Request, RequestHandler, Response } from 'express';

import type { PayoutPage, PayoutRow } from '@shared/api.js';

import Order from '../models/Order.model.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import User from '../models/user.model.js';
import type { MarkPaidBody, PayoutsQuery } from '../schemas/index.js';
import { validatedQuery } from '../middleware/validate.js';
import { recordAudit } from '../utils/audit.js';
import { createLogger } from '../config/logger.js';
import { returnWindowClosedBefore, sellerFeeFor, sellerPayoutFor } from '../config/commerce.js';

const log = createLogger('payout');

/** A return in one of these states holds a line back from being paid. */
const HOLDING_RETURNS: ('pending' | 'approved')[] = ['pending', 'approved'];

/**
 * Sellers are paid per order: the books of theirs in it, less the fee.
 *
 * "Due" is a line delivered long enough ago that its return window has
 * closed, not yet paid, and with no return pending or approved against it -
 * the same rule as `payoutStateFor`, written as a query. Paying earlier would
 * mean taking money back from a seller whenever a book came back.
 */
export const getPayouts: RequestHandler = async (req, res, next) => {
  try {
    const query = validatedQuery<PayoutsQuery>(req);
    const due = query.state === 'due';

    const match = due
      ? { status: 'Delivered', sellerPaidAt: null, deliveredAt: { $lte: returnWindowClosedBefore() } }
      : { sellerPaidAt: { $ne: null } };

    const [result] = await Order.aggregate<{
      items: {
        _id: { orderNumber: string; sellerEmail: string };
        booksTotal: number;
        titles: string[];
        deliveredAt: Date | null;
        paidAt: Date | null;
        reference: string;
      }[];
      total: { count: number }[];
    }>([
      { $match: match },
      {
        $lookup: {
          from: ReturnRequest.collection.name,
          localField: '_id',
          foreignField: 'orderId',
          pipeline: [{ $project: { status: 1 } }],
          as: 'returns',
        },
      },
      ...(due ? [{ $match: { 'returns.status': { $nin: HOLDING_RETURNS } } }] : []),
      {
        $group: {
          _id: { orderNumber: '$orderNumber', sellerEmail: '$sellerEmail' },
          booksTotal: { $sum: { $multiply: ['$price', '$quantity'] } },
          titles: { $push: '$title' },
          deliveredAt: { $max: '$deliveredAt' },
          paidAt: { $max: '$sellerPaidAt' },
          reference: { $first: '$sellerPayoutRef' },
        },
      },
      // Oldest debt first; newest payment first.
      { $sort: due ? { deliveredAt: 1, '_id.orderNumber': 1 } : { paidAt: -1, '_id.orderNumber': 1 } },
      {
        $facet: {
          items: [{ $skip: (query.page - 1) * query.pageSize }, { $limit: query.pageSize }],
          total: [{ $count: 'count' }],
        },
      },
    ]);

    const groups = result?.items ?? [];
    const sellers = await User.find(
      { email: { $in: [...new Set(groups.map((g) => g._id.sellerEmail))] } },
      { email: 1, username: 1, bkashMerchant: 1 }
    ).lean();
    const byEmail = new Map(sellers.map((seller) => [seller.email, seller]));

    const items: PayoutRow[] = groups.map((group) => {
      const seller = byEmail.get(group._id.sellerEmail);
      return {
        orderNumber: group._id.orderNumber,
        sellerEmail: group._id.sellerEmail,
        sellerName: seller?.username ?? null,
        bkashMerchant: seller?.bkashMerchant || null,
        titles: group.titles.map((title) => title || 'Untitled'),
        booksTotal: group.booksTotal,
        fee: sellerFeeFor(group.booksTotal),
        payout: sellerPayoutFor(group.booksTotal),
        deliveredAt: group.deliveredAt?.toISOString() ?? null,
        paidAt: group.paidAt?.toISOString() ?? null,
        reference: group.reference || null,
      };
    });

    const total = result?.total[0]?.count ?? 0;
    const body: PayoutPage = {
      items,
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    };
    res.json(body);
  } catch (error) {
    next(error);
  }
};

/**
 * Records that a seller has been paid for their books in one order.
 *
 * Marks only what is due at this moment - so a line whose return is still
 * being decided stays unpaid, and a double click cannot pay twice.
 */
export const markPayoutPaid = async (
  req: Request<Record<string, string>, unknown, MarkPaidBody>,
  res: Response
): Promise<void> => {
  try {
    const { orderNumber, sellerEmail, reference } = req.body;

    const candidates = await Order.find(
      {
        orderNumber: String(orderNumber),
        sellerEmail: String(sellerEmail),
        status: 'Delivered',
        sellerPaidAt: null,
        deliveredAt: { $lte: returnWindowClosedBefore() },
      },
      { _id: 1, price: 1, quantity: 1 }
    ).lean();

    const held = new Set(
      (
        await ReturnRequest.find(
          { orderId: { $in: candidates.map((line) => line._id) }, status: { $in: HOLDING_RETURNS } },
          { orderId: 1 }
        ).lean()
      ).map((request) => String(request.orderId))
    );
    const payable = candidates.filter((line) => !held.has(String(line._id)));

    if (payable.length === 0) {
      res.status(409).json({ message: 'Nothing is due to that seller on that order.' });
      return;
    }

    const paidAt = new Date();
    await Order.updateMany(
      { _id: { $in: payable.map((line) => line._id) }, sellerPaidAt: null },
      { $set: { sellerPaidAt: paidAt, sellerPayoutRef: reference } }
    );

    const booksTotal = payable.reduce(
      (sum, line) => sum + Number(line.price) * Number(line.quantity),
      0
    );
    const amount = sellerPayoutFor(booksTotal);

    await recordAudit(req, {
      action: 'payout.paid',
      targetType: 'order',
      targetId: orderNumber,
      details: { sellerEmail, reference, amount, lines: payable.length },
    });

    res.json({ message: `Recorded ${amount.toFixed(2)} Tk paid.`, amount, paidAt: paidAt.toISOString() });
  } catch (error) {
    log.error({ err: error }, 'Failed to record a payout');
    res.status(500).json({ message: 'Could not record the payout.' });
  }
};
