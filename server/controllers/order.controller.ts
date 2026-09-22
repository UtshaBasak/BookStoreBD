import type { Request, RequestHandler, Response } from 'express';

import type { UnavailableItem } from '@shared/api.js';

import AddBook from '../models/AddBook.model.js';
import Order, { type LeanOrder } from '../models/Order.model.js';
import { actingUser } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import type {
  CreateOrderBody,
  OrderListQuery,
  OrderNumberParams,
  UpdateOrderStatusBody,
} from '../schemas/index.js';
import { validatedQuery } from '../middleware/validate.js';
import { contains } from '../utils/regex.js';
import { createLogger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';

const log = createLogger('order');

// Generate a unique 16-character order number (uppercase letters and numbers)
async function generateUniqueOrderNumber(): Promise<string> {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let orderNumber = '';
  let exists = true;
  while (exists) {
    orderNumber = '';
    for (let i = 0; i < 16; i++) {
      orderNumber += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Check if this orderNumber already exists
    exists = (await Order.exists({ orderNumber })) !== null;
  }
  return orderNumber;
}

/** The order-level totals, which repeat on every line of the same order. */
const totalsFor = (lines: readonly LeanOrder[]) => {
  const booksTotal = lines.reduce(
    (sum, line) => sum + Number(line.price) * Number(line.quantity),
    0
  );
  const shippingCost = lines[0]?.shippingCharge ?? 0;
  const discount = lines[0]?.discount ?? 0;

  return {
    booksTotal,
    shippingCost,
    discount,
    totalCost: booksTotal + Number(shippingCost) - Number(discount),
  };
};

/**
 * One page of orders, newest first.
 *
 * Paged by **order**, not by line: an order of three books is three rows, and
 * a page that cut between them would show part of a purchase and leave the
 * rest on the next page. So a page of order numbers is chosen first, and then
 * every line belonging to them is fetched.
 *
 * The three tables that use this each fetched every order they could see and
 * then searched and grouped in the browser - which also meant the search box
 * could only find an order that had already been downloaded.
 *
 * `$group` is a blocking stage, so this reads the orders the filter matches
 * rather than a page of them. For a buyer or a seller that is their own
 * orders, against an index; for the administrator's table it is every order,
 * which is the price of counting distinct purchases and is text, not images.
 */
const pageOfOrders = async (
  scope: Record<string, unknown>,
  query: OrderListQuery
): Promise<{ lines: LeanOrder[]; total: number; page: number; pageSize: number; pageCount: number }> => {
  const pattern = query.search ? contains(query.search) : null;
  const filter: Record<string, unknown> = {
    ...scope,
    ...(pattern
      ? {
          $or: [
            { orderNumber: pattern },
            { buyerEmail: pattern },
            { sellerEmail: pattern },
            { title: pattern },
            { author: pattern },
          ],
        }
      : {}),
  };

  const [numbers, counted] = await Promise.all([
    Order.aggregate<{ _id: string }>([
      { $match: filter },
      { $group: { _id: '$orderNumber', createdAt: { $max: '$createdAt' } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: (query.page - 1) * query.pageSize },
      { $limit: query.pageSize },
      { $project: { _id: 1 } },
    ]),
    Order.aggregate<{ n: number }>([
      { $match: filter },
      { $group: { _id: '$orderNumber' } },
      { $count: 'n' },
    ]),
  ]);

  const total = counted[0]?.n ?? 0;
  const orderNumbers = numbers.map((row) => row._id);

  // The same filter again, so a search for a title still shows the line that
  // matched rather than the whole order - which is what the browser did.
  const lines = orderNumbers.length
    ? await Order.find({ ...filter, orderNumber: { $in: orderNumbers } })
        .sort({ createdAt: -1, _id: -1 })
        .lean()
    : [];

  return {
    lines,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
};

export const decreaseStock = async (
  req: Request<unknown, unknown, CreateOrderBody>,
  res: Response
): Promise<void> => {
  try {
    const { items, shippingCharge, discount, promoApplied } = req.body;
    const { email } = actingUser(req);
    const promo = req.body.promo;

    // Generate unique order number
    const orderNumber = await generateUniqueOrderNumber();

    const unavailable: UnavailableItem[] = [];

    // Save order(s)
    for (const item of items) {
      const bookId = item.bookId;
      const quantity = Number(item?.quantity);
      if (!bookId || !Number.isInteger(quantity) || quantity < 1) continue;
      const book = await AddBook.findById(bookId);
      if (!book) continue;

      // Reserve stock first: the conditional update is atomic, so two buyers
      // racing for the last copy cannot both succeed.
      const reserved = await AddBook.updateOne(
        { _id: bookId, stock: { $gte: quantity } },
        { $inc: { stock: -quantity } }
      );
      if (reserved.modifiedCount === 0) {
        unavailable.push({ bookId, title: book.title, available: book.stock });
        continue;
      }

      await Order.create({
        orderNumber, // save the same orderNumber for all books in this order
        buyerEmail: email,
        sellerEmail: book.sellerEmail,
        bookId: book._id,
        title: book.title,
        author: book.author,
        category: book.category,
        bookType: book.bookType,
        condition: book.condition,
        pages: book.pages,
        price: book.price,
        quantity,
        // --- New fields for full order info ---
        paymentMethod: req.body.paymentMethod || '',
        contactName: req.body.contactName || '',
        contactPhone: req.body.contactPhone || '',
        deliveryDivision: req.body.deliveryDivision || '',
        deliveryDistrict: req.body.deliveryDistrict || '',
        deliveryAddress: req.body.deliveryAddress || '',
        // ---
        shippingCharge: typeof shippingCharge === 'number' ? shippingCharge : 0,
        discount: typeof discount === 'number' ? discount : 0,
        promo: promo || '',
        promoApplied: !!promoApplied,
        status: 'Order Confirmed',
        createdAt: new Date(),
      });
    }

    if (unavailable.length === items.length) {
      res.status(409).json({ message: 'None of the selected books are in stock', unavailable });
      return;
    }

    res.status(200).json({ message: 'Stock updated & order saved', orderNumber, unavailable });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

// Get all orders for a buyer
export const getOrdersByBuyer: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const query = validatedQuery<OrderListQuery>(req);
    const { lines, ...page } = await pageOfOrders({ buyerEmail: email }, query);

    // Order-level totals repeat on every line of the same order.
    const grouped = new Map<string, LeanOrder[]>();
    for (const line of lines) {
      const key = line.orderNumber || String(line._id);
      const group = grouped.get(key);
      if (group) group.push(line);
      else grouped.set(key, [line]);
    }

    /*
     * Whether each book on this page has a return in progress.
     *
     * The buyer's list used to fetch every return request this account has
     * ever made, only to turn it into a bookId -> status lookup - and those
     * requests carry the photographs of the defect, as base64, on the
     * document. Asking for the books on the page instead makes it one small
     * query, and one request fewer.
     */
    const bookIds = [...new Set(lines.map((line) => String(line.bookId)))];
    const returns = await ReturnRequest.find(
      { userEmail: email, bookId: { $in: bookIds } },
      { bookId: 1, status: 1 }
    ).lean();
    const returnStatus = new Map(returns.map((request) => [String(request.bookId), request.status]));

    const items = [];
    for (const orderBooks of grouped.values()) {
      const totals = totalsFor(orderBooks);
      for (const book of orderBooks) {
        items.push({
          ...book,
          ...totals,
          returnStatus: returnStatus.get(String(book.bookId)) ?? null,
        });
      }
    }

    res.status(200).json({ items, ...page });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};


// Get all orders for a seller
export const getOrdersBySeller: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const { lines, ...page } = await pageOfOrders(
      { sellerEmail: email },
      validatedQuery<OrderListQuery>(req)
    );
    res.status(200).json({ items: lines, ...page });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

// Get order by orderNumber
export const getOrderByOrderNumber = async (
  req: Request<OrderNumberParams>,
  res: Response
): Promise<void> => {
  try {
    const orderNumber = req.params.orderNumber;
    if (!orderNumber) {
      res.status(400).json({ message: 'Order number required' });
      return;
    }
    const orders = await Order.find({ orderNumber }).lean();
    if (orders.length === 0) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }

    // Only the buyer, the seller, or an administrator may read an order.
    // Order numbers are guessable enough that this must be enforced.
    const { email: actor, role } = actingUser(req);
    const involved = orders.some((o) => o.buyerEmail === actor || o.sellerEmail === actor);
    if (role !== 'admin' && !involved) {
      res.status(403).json({ message: 'You do not have access to this order' });
      return;
    }
    // Group and summarize as in getOrdersByBuyer
    const first = orders[0];
    const totals = totalsFor(orders);
    // The defaults come after the spread rather than before it. Records
    // written before these fields existed have no value to spread, and `.lean()`
    // does not apply schema defaults, so something has to fill the gap.
    res.status(200).json({
      ...first,
      orderNumber: first.orderNumber,
      status: first.status || 'Order Confirmed',
      paymentMethod: first.paymentMethod || '',
      contactName: first.contactName || '',
      contactPhone: first.contactPhone || '',
      deliveryDivision: first.deliveryDivision || '',
      deliveryDistrict: first.deliveryDistrict || '',
      deliveryAddress: first.deliveryAddress || '',
      books: orders,
      ...totals,
    });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

// Update order status by orderNumber (for all books in the order)
export const updateOrderStatusByOrderNumber = async (
  req: Request<OrderNumberParams, unknown, UpdateOrderStatusBody>,
  res: Response
): Promise<void> => {
  try {
    const orderNumber = req.params.orderNumber;
    const status = req.body.status;

    const existing = await Order.find({ orderNumber }).lean();
    if (existing.length === 0) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }

    const { email: actor, role } = actingUser(req);
    const involved = existing.some((o) => o.buyerEmail === actor || o.sellerEmail === actor);
    if (role !== 'admin' && !involved) {
      res.status(403).json({ message: 'You do not have access to this order' });
      return;
    }

    const orders = await Order.updateMany({ orderNumber }, { status });
    if (orders.matchedCount === 0) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }
    await recordAudit(req, {
      action: 'order.status',
      targetType: 'order',
      targetId: orderNumber,
      details: { from: existing[0]?.status, to: status, lines: orders.modifiedCount },
    });

    // Optionally, return the updated orders
    const updatedOrders = await Order.find({ orderNumber });
    res.status(200).json(updatedOrders);
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

// Add delete order by id
export const deleteOrder: RequestHandler = async (req, res) => {
  try {
    const id = req.params.id;
    await Order.findByIdAndDelete(id);
    await recordAudit(req, {
      action: 'order.delete',
      targetType: 'order',
      targetId: String(req.params.id),
    });

    res.status(200).json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

// Get all orders for admin
export const getAllOrders: RequestHandler = async (req, res) => {
  try {
    const { lines, ...page } = await pageOfOrders({}, validatedQuery<OrderListQuery>(req));
    res.status(200).json({ items: lines, ...page });
  } catch (err) {
    // Log the error for debugging
    log.error({ err }, 'Error in getAllOrders');
    res.status(500).json({ message: errorMessage(err) || 'Internal Server Error' });
  }
};
