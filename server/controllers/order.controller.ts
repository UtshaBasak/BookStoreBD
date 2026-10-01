import type { Request, RequestHandler, Response } from 'express';

import type { UnavailableItem } from '@shared/api.js';

import AddBook, { type BookDocument } from '../models/AddBook.model.js';
import Order, { type LeanOrder } from '../models/Order.model.js';
import { actingUser } from '../middleware/auth.js';
import { recordAudit } from '../utils/audit.js';
import ReturnRequest from '../models/ReturnRequest.model.js';
import type {
  CreateOrderBody,
  OrderListQuery,
  OrderNumberParams,
  UpdateOrderStatusBody,
  CheckPromoBody,
  CancelOrderBody,
} from '../schemas/index.js';
import { validatedQuery } from '../middleware/validate.js';
import { contains } from '../utils/regex.js';
import { createLogger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';
import {
  CANCELLED,
  RETURN_WINDOW_DAYS,
  ORDER_STAGES,
  SELLER_LAST_STAGE,
  canCancel,
  deliveryChargeFor,
  payoutStateFor,
  returnDeadline,
  statusChangeProblem,
} from '../config/commerce.js';
import { adminEmails, notify } from '../utils/notify.js';
import { stockChanged } from '../utils/catalogueEvents.js';
import {
  dispatchShopMail,
  orderCancelledEmail,
  orderDeliveredBuyerEmail,
  orderDeliveredSellerEmail,
  orderPlacedBuyerEmail,
  orderPlacedSellerEmail,
  type OrderFacts,
} from '../utils/shopMail.js';
import { applyPromotion, findPromotion } from '../config/promotions.js';
import { unitPriceOf } from '../config/pricing.js';

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
  // A cancelled book is not paid for, and an order with nothing left in it
  // has no delivery to charge for either.
  const live = lines.filter((line) => line.status !== CANCELLED);
  const booksTotal = live.reduce(
    (sum, line) => sum + Number(line.price) * Number(line.quantity),
    0
  );
  const shippingCost = live.length ? (lines[0]?.shippingCharge ?? 0) : 0;
  const discount = live.length ? (lines[0]?.discount ?? 0) : 0;

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
  // Dates are the shop's days, Dhaka time, from the start of one to the end of the other.
  const day = (value: string, end: boolean) => new Date(`${value}T${end ? '23:59:59.999' : '00:00:00.000'}+06:00`);
  const filter: Record<string, unknown> = {
    ...scope,
    ...(query.status ? { status: query.status } : {}),
    ...(query.from || query.to
      ? {
          createdAt: {
            ...(query.from ? { $gte: day(query.from, false) } : {}),
            ...(query.to ? { $lte: day(query.to, true) } : {}),
          },
        }
      : {}),
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
      {
        $group: {
          _id: '$orderNumber',
          createdAt: { $max: '$createdAt' },
          total: { $sum: { $multiply: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$quantity', 1] }] } },
        },
      },
      {
        $sort:
          query.sort === 'oldest'
            ? { createdAt: 1, _id: 1 }
            : query.sort === 'totalHigh'
              ? { total: -1, createdAt: -1, _id: -1 }
              : query.sort === 'totalLow'
                ? { total: 1, createdAt: -1, _id: -1 }
                : { createdAt: -1, _id: -1 },
      },
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
  const rank = new Map(orderNumbers.map((number, index) => [number, index]));
  const lines = orderNumbers.length
    ? (
        await Order.find({ ...filter, orderNumber: { $in: orderNumbers } })
          .sort({ createdAt: -1, _id: -1 })
          .lean()
      ).sort((a, b) => (rank.get(a.orderNumber) ?? 0) - (rank.get(b.orderNumber) ?? 0))
    : [];

  return {
    lines,
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
};

/** Order lines in a book's own words, for a notification: "Deyal × 2, Sapiens". */
const describeLines = (lines: readonly { title?: string | null; quantity?: number | null }[]): string =>
  lines
    .map((line) => `${line.title || 'A book'}${Number(line.quantity) > 1 ? ` × ${line.quantity}` : ''}`)
    .join(', ');

/**
 * A new order, told to everyone it concerns: the buyer that it went through,
 * each seller what of theirs to send, the administrators that it exists, and
 * a seller whose book it sold the last copy of.
 */
const announceOrder = async (
  orderNumber: string,
  buyer: string,
  reserved: readonly { book: BookDocument; quantity: number }[],
  { total, facts }: { total: number; facts: OrderFacts }
): Promise<void> => {
  // E-mails first, since they go in the background: one to the buyer, and
  // one to each seller about their own books.
  const priced = (list: typeof reserved) =>
    list.map(({ book, quantity }) => ({ title: book.title, quantity, price: unitPriceOf(book) }));
  dispatchShopMail(buyer, orderPlacedBuyerEmail(facts, priced(reserved)));
  for (const seller of new Set(reserved.map(({ book }) => book.sellerEmail))) {
    dispatchShopMail(seller, orderPlacedSellerEmail(facts, priced(reserved.filter(({ book }) => book.sellerEmail === seller))));
  }

  const copies = reserved.reduce((sum, { quantity }) => sum + quantity, 0);
  await notify([buyer], {
    type: 'order-placed',
    title: `Order ${orderNumber} confirmed`,
    body: `${copies} ${copies === 1 ? 'book' : 'books'}, ${total} Tk to pay on delivery.`,
    link: `/order-tracking/${orderNumber}`,
  });

  const bySeller = new Map<string, { title: string; quantity: number }[]>();
  for (const { book, quantity } of reserved) {
    const list = bySeller.get(book.sellerEmail) ?? [];
    list.push({ title: book.title, quantity });
    bySeller.set(book.sellerEmail, list);
  }
  for (const [seller, lines] of bySeller) {
    await notify([seller], {
      type: 'order-received',
      title: `New order: ${describeLines(lines)}`,
      body: `Order ${orderNumber}. Get it ready and mark it as it moves on.`,
      link: `/seller/order-tracking/${orderNumber}`,
    });
  }

  await notify(await adminEmails(), {
    type: 'order-received',
    title: `New order ${orderNumber}`,
    body: `${describeLines(reserved.map(({ book, quantity }) => ({ title: book.title, quantity })))} - ${total} Tk.`,
    link: `/admin/order-tracking/${orderNumber}`,
  }, { except: buyer });
};

export const decreaseStock = async (
  req: Request<unknown, unknown, CreateOrderBody>,
  res: Response
): Promise<void> => {
  try {
    const { items } = req.body;
    const { email } = actingUser(req);

    /*
     * A promo code is checked here, and priced here. The browser used to send
     * the discount itself, which was stored as given. An unknown code is
     * refused before any stock is reserved, so the buyer can correct it.
     */
    const promoCode = req.body.promo?.trim() || '';
    const promotion = promoCode ? findPromotion(promoCode) : undefined;
    if (promoCode && !promotion) {
      res.status(400).json({ message: 'That promo code is not valid.' });
      return;
    }
    const isFirstOrder = !(await Order.exists({ buyerEmail: String(email), status: { $ne: CANCELLED } }));

    const wanted: { book: BookDocument; quantity: number }[] = [];
    for (const item of items) {
      const quantity = Number(item?.quantity);
      if (!item.bookId || !Number.isInteger(quantity) || quantity < 1) continue;
      const book = await AddBook.findById(String(item.bookId));
      if (book) wanted.push({ book, quantity });
    }

    // A code whose conditions the basket does not meet - under its minimum
    // spend, or not a first order - is refused with the reason, before stock
    // is taken, rather than the order going through at the full price.
    if (promotion) {
      const asked = applyPromotion(promotion, {
        booksTotal: wanted.reduce((sum, { book, quantity }) => sum + unitPriceOf(book) * quantity, 0),
        isFirstOrder,
      });
      if (!asked.ok) {
        res.status(400).json({ message: asked.message });
        return;
      }
    }

    // Generate unique order number
    const orderNumber = await generateUniqueOrderNumber();

    const unavailable: UnavailableItem[] = [];
    const reserved: { book: BookDocument; quantity: number }[] = [];
    const stockMoves: { book: BookDocument; before: number; after: number }[] = [];

    for (const { book, quantity } of wanted) {
      const bookId = String(book._id);

      // Reserve stock first: the conditional update is atomic, so two buyers
      // racing for the last copy cannot both succeed. It answers with what is
      // left, which is what decides who hears the book is running low.
      const taken = await AddBook.findOneAndUpdate(
        { _id: String(bookId), stock: { $gte: quantity } },
        { $inc: { stock: -quantity } },
        { returnDocument: 'after', projection: { stock: 1 } }
      ).lean();
      if (!taken) {
        unavailable.push({ bookId, title: book.title, available: book.stock });
        continue;
      }
      reserved.push({ book, quantity });
      stockMoves.push({ book, before: Number(taken.stock) + quantity, after: Number(taken.stock) });
    }

    /*
     * Delivery is priced from what was actually reserved, and by the server.
     * The browser used to send the figure and it was stored as given, so a
     * checkout request could name its own delivery charge.
     */
    const booksTotal = reserved.reduce(
      (sum, { book, quantity }) => sum + unitPriceOf(book) * quantity,
      0
    );
    // Priced again on what was actually reserved: if a book sold out in the
    // meantime, a code with a minimum spend may no longer apply, and the order
    // goes ahead without it (and says so) rather than failing after stock was
    // taken.
    const applied = promotion ? applyPromotion(promotion, { booksTotal, isFirstOrder }) : null;
    const discount = applied?.ok ? applied.discount : 0;
    const shippingCharge =
      applied?.ok && applied.freeDelivery ? 0 : deliveryChargeFor(req.body.deliveryDistrict);

    for (const { book, quantity } of reserved) {
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
        // What the buyer pays, which is what the seller's share and every
        // total are worked out from; the listed price is kept beside it.
        price: unitPriceOf(book),
        listPrice: book.price,
        quantity,
        // --- New fields for full order info ---
        paymentMethod: req.body.paymentMethod || '',
        contactName: req.body.contactName || '',
        contactPhone: req.body.contactPhone || '',
        deliveryDivision: req.body.deliveryDivision || '',
        deliveryDistrict: req.body.deliveryDistrict || '',
        deliveryAddress: req.body.deliveryAddress || '',
        buyerNote: req.body.buyerNote || '',
        // ---
        shippingCharge,
        discount,
        promo: applied?.ok ? applied.code : '',
        promoApplied: Boolean(applied?.ok),
        status: 'Order Confirmed',
        createdAt: new Date(),
      });
    }

    if (unavailable.length === items.length) {
      res.status(409).json({ message: 'None of the selected books are in stock', unavailable });
      return;
    }

    await announceOrder(orderNumber, String(email), reserved, {
      total: booksTotal + shippingCharge - discount,
      facts: {
        orderNumber,
        contactName: req.body.contactName,
        contactPhone: req.body.contactPhone,
        deliveryAddress: req.body.deliveryAddress,
        deliveryDistrict: req.body.deliveryDistrict,
        deliveryDivision: req.body.deliveryDivision,
        shippingCharge,
        discount,
        buyerNote: req.body.buyerNote,
      },
    });
    for (const move of stockMoves) {
      await stockChanged(move.book, move.before, move.after, { actor: String(email) });
    }

    res.status(200).json({
      message: 'Stock updated & order saved',
      orderNumber,
      shippingCharge,
      discount,
      ...(applied && !applied.ok ? { promoMessage: applied.message } : {}),
      unavailable,
    });
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
    const lineIds = lines.map((line) => line._id);
    const bookIds = [...new Set(lines.map((line) => String(line.bookId)))];
    const returns = await ReturnRequest.find(
      {
        userEmail: email,
        // By order line; by book for requests made before they named one.
        $or: [{ orderId: { $in: lineIds } }, { orderId: null, bookId: { $in: bookIds } }],
      },
      { orderId: 1, bookId: 1, status: 1 }
    ).lean();
    const byLine = new Map<string, string>();
    const byBook = new Map<string, string>();
    for (const request of returns) {
      if (request.orderId) byLine.set(String(request.orderId), request.status);
      else byBook.set(String(request.bookId), request.status);
    }

    const now = Date.now();
    const items = [];
    for (const orderBooks of grouped.values()) {
      const totals = totalsFor(orderBooks);
      for (const book of orderBooks) {
        const deadline = returnDeadline(book);
        items.push({
          ...book,
          ...totals,
          returnStatus: byLine.get(String(book._id)) ?? byBook.get(String(book.bookId)) ?? null,
          // Decided here, where it is enforced, rather than worked out again
          // in the browser from the order date.
          returnableUntil: deadline && deadline.getTime() > now ? deadline.toISOString() : null,
        });
      }
    }

    res.status(200).json({ items, ...page });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};


/**
 * What a promo code is worth on a basket, so checkout can show it before the
 * order is placed. The order itself prices the code again.
 */
export const checkPromo = async (
  req: Request<unknown, unknown, CheckPromoBody>,
  res: Response
): Promise<void> => {
  try {
    const { email } = actingUser(req);
    const isFirstOrder = !(await Order.exists({ buyerEmail: String(email), status: { $ne: CANCELLED } }));
    const result = applyPromotion(findPromotion(req.body.code), {
      booksTotal: Number(req.body.booksTotal),
      isFirstOrder,
    });

    if (!result.ok) {
      res.status(400).json({ message: result.message });
      return;
    }
    res.json({
      code: result.code,
      description: result.description,
      discount: result.discount,
      freeDelivery: result.freeDelivery,
    });
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

    /*
     * Where the seller's money for each line has got to: waiting on delivery,
     * inside the buyer's return window, due, or paid - worked out here by the
     * same rule the payouts page uses.
     */
    const returns = await ReturnRequest.find(
      { orderId: { $in: lines.map((line) => line._id) } },
      { orderId: 1, status: 1 }
    ).lean();
    const returnStatus = new Map(returns.map((request) => [String(request.orderId), request.status]));

    const items = lines.map((line) => {
      const deadline = returnDeadline(line);
      return {
        ...line,
        payoutState: payoutStateFor(line, returnStatus.get(String(line._id))),
        payableFrom: deadline?.toISOString() ?? null,
      };
    });
    res.status(200).json({ items, ...page });
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
    const live = orders.filter((line) => line.status !== CANCELLED);
    const status = live[0]?.status || (live.length ? 'Order Confirmed' : CANCELLED);
    const who = viewerRole(orders, actor, role);
    // The defaults come after the spread rather than before it. Records
    // written before these fields existed have no value to spread, and `.lean()`
    // does not apply schema defaults, so something has to fill the gap.
    res.status(200).json({
      ...first,
      orderNumber: first.orderNumber,
      status,
      // Worked out here, by the rules that enforce them, so the page offers
      // exactly what the API will accept.
      canCancel: who ? canCancel(who, statusFor(orders, who, actor)) : false,
      statusOptions: who === 'admin' || who === 'seller' ? statusOptionsFor(who, statusFor(orders, who, actor)) : [],
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

/** How someone stands to an order: the one who bought it, a seller in it, an administrator, or nobody. */
const viewerRole = (
  lines: readonly LeanOrder[],
  actor: string | undefined,
  role: string | undefined
): 'admin' | 'seller' | 'buyer' | null => {
  if (role === 'admin') return 'admin';
  if (lines.some((line) => line.sellerEmail === actor)) return 'seller';
  if (lines.some((line) => line.buyerEmail === actor)) return 'buyer';
  return null;
};

/** The lines a person acts on: a seller their own books, everyone else all of them. */
const linesFor = (lines: readonly LeanOrder[], who: 'admin' | 'seller' | 'buyer', actor: string | undefined) =>
  lines.filter((line) => line.status !== CANCELLED && (who !== 'seller' || line.sellerEmail === actor));

const statusFor = (lines: readonly LeanOrder[], who: 'admin' | 'seller' | 'buyer', actor: string | undefined): string =>
  linesFor(lines, who, actor)[0]?.status || CANCELLED;

/** The statuses a person may pick from where the order is now. */
const statusOptionsFor = (who: 'admin' | 'seller', current: string): string[] =>
  current === CANCELLED ? [] : ORDER_STAGES.filter((stage) => stage === current || !statusChangeProblem(who, current, stage));

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

    /*
     * The seller who is sending the book, or an administrator. The buyer could
     * change it too, though no page offered them the control - and now that
     * the return window opens on delivery, a buyer moving their own order out
     * of 'Delivered' and back would have restarted it.
     */
    const { email: actor, role } = actingUser(req);
    const who = viewerRole(existing, actor, role);
    if (who !== 'admin' && who !== 'seller') {
      res.status(403).json({ message: 'Only the seller or an administrator can change this' });
      return;
    }

    /*
     * A seller moves their own books along, up to Shipped. Past that the
     * order is the shop's: Out for Delivery and Delivered are the
     * administrator's to set, and a seller who could mark their own sale
     * delivered could start their own payout. A cancelled book stays
     * cancelled.
     */
    const mine = linesFor(existing, who, actor);
    const current = mine[0]?.status || CANCELLED;
    const problem = statusChangeProblem(who, current, String(status));
    if (problem) {
      res.status(403).json({ message: problem });
      return;
    }

    // Delivery is stamped when it happens, and only then: marking an order
    // delivered twice does not move the date the return window counts from.
    const wasDelivered = mine.length > 0 && mine.every((o) => o.status === 'Delivered');
    const becomesDelivered = String(status) === 'Delivered';
    const orders = await Order.updateMany(
      { _id: { $in: mine.map((line) => line._id) } },
      {
        status: String(status),
        ...(becomesDelivered && !wasDelivered ? { deliveredAt: new Date() } : {}),
        ...(!becomesDelivered ? { deliveredAt: null } : {}),
      }
    );
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

    if (current !== String(status)) {
      await notify([existing[0]?.buyerEmail], {
        type: 'order-status',
        title: `Order ${orderNumber} is ${String(status) === 'Delivered' ? 'delivered' : `now ${String(status)}`}`,
        body: String(status) === 'Delivered' ? 'Enjoy your books! You can ask for a return within 7 days.' : describeLines(mine),
        link: `/order-tracking/${orderNumber}`,
      });
      // Delivered: an e-mail each to the buyer and the sellers, beside the bell.
      if (becomesDelivered && !wasDelivered) {
        const facts = { orderNumber, contactName: existing[0]?.contactName };
        dispatchShopMail(existing[0]?.buyerEmail, orderDeliveredBuyerEmail(facts, mine));
        const payableFrom = new Date(Date.now() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        for (const seller of new Set(mine.map((line) => line.sellerEmail))) {
          dispatchShopMail(seller, orderDeliveredSellerEmail(facts, mine.filter((line) => line.sellerEmail === seller), payableFrom));
        }
      }
      // When the shop moves it on, the seller hears too.
      if (who === 'admin') {
        await notify([...new Set(mine.map((line) => line.sellerEmail))], {
          type: 'order-status',
          title: `Order ${orderNumber} is now ${String(status)}`,
          body: describeLines(mine),
          link: `/seller/order-tracking/${orderNumber}`,
        }, { except: actor });
      }
    }

    // Optionally, return the updated orders
    const updatedOrders = await Order.find({ orderNumber });
    res.status(200).json(updatedOrders);
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

/**
 * Calls an order off and puts the books back on sale.
 *
 * The buyer may, until the seller has started on it; a seller may cancel
 * their own books in it until they have shipped; an administrator may until
 * it is delivered (config/commerce.ts). The stock comes back, the books are
 * marked cancelled rather than deleted - the order is still something that
 * happened - and everyone else in it is told.
 */
export const cancelOrder = async (
  req: Request<OrderNumberParams, unknown, CancelOrderBody>,
  res: Response
): Promise<void> => {
  try {
    const { orderNumber } = req.params;
    const reason = req.body?.reason?.trim() ?? '';
    const existing = await Order.find({ orderNumber }).lean();
    if (existing.length === 0) {
      res.status(404).json({ message: 'Order not found' });
      return;
    }

    const { email: actor, role } = actingUser(req);
    const who = viewerRole(existing, actor, role);
    if (!who) {
      res.status(403).json({ message: 'You do not have access to this order' });
      return;
    }

    const lines = linesFor(existing, who, actor);
    if (!lines.length || !lines.every((line) => canCancel(who, line.status))) {
      res.status(409).json({
        message:
          who === 'buyer'
            ? 'This order is already being prepared, so it can no longer be cancelled here. Message the seller, or ask for a return once it arrives.'
            : who === 'seller'
              ? `Books can be cancelled until they are ${SELLER_LAST_STAGE.toLowerCase()}.`
              : 'A delivered or cancelled order cannot be cancelled.',
      });
      return;
    }

    const cancelled = await Order.updateMany(
      { _id: { $in: lines.map((line) => line._id) }, status: { $ne: CANCELLED } },
      { $set: { status: CANCELLED, cancelledAt: new Date(), cancelledBy: who, cancelReason: reason } }
    );
    // Back on the shelf, copy for copy - and anyone waiting for a sold-out
    // copy hears it is back.
    for (const line of lines) {
      const copies = Number(line.quantity) || 1;
      const restored = await AddBook.findOneAndUpdate(
        { _id: line.bookId },
        { $inc: { stock: copies } },
        { returnDocument: 'after', projection: { stock: 1, title: 1, sellerEmail: 1 } }
      ).lean();
      if (restored) await stockChanged(restored, Number(restored.stock) - copies, Number(restored.stock), { actor });
    }

    await recordAudit(req, {
      action: 'order.cancel',
      targetType: 'order',
      targetId: orderNumber,
      details: { by: who, lines: cancelled.modifiedCount, reason },
    });

    const what = describeLines(lines);
    const by = who === 'buyer' ? 'the buyer' : who === 'seller' ? 'the seller' : 'the shop';
    const body = `${what}, cancelled by ${by}${reason ? `: "${reason}"` : '.'}`;
    await notify([existing[0]?.buyerEmail], {
      type: 'order-cancelled',
      title: `Order ${orderNumber} was cancelled`,
      body,
      link: `/order-tracking/${orderNumber}`,
    }, { except: actor });
    await notify([...new Set(lines.map((line) => line.sellerEmail))], {
      type: 'order-cancelled',
      title: `Order ${orderNumber} was cancelled`,
      body: `${body} The stock is back on sale.`,
      link: `/seller/order-tracking/${orderNumber}`,
    }, { except: actor });
    await notify(await adminEmails(), {
      type: 'order-cancelled',
      title: `Order ${orderNumber} was cancelled`,
      body,
      link: `/admin/order-tracking/${orderNumber}`,
    }, { except: actor });

    // And by e-mail to the buyer and each seller concerned, the canceller
    // included: it is the record of what happened to the order.
    const cancelledIds = new Set(lines.map((line) => String(line._id)));
    const whole = existing.every((line) => line.status === CANCELLED || cancelledIds.has(String(line._id)));
    const facts = { orderNumber };
    dispatchShopMail(existing[0]?.buyerEmail, orderCancelledEmail('buyer', facts, lines, { by: who, reason, whole }));
    for (const seller of new Set(lines.map((line) => line.sellerEmail))) {
      dispatchShopMail(
        seller,
        orderCancelledEmail('seller', facts, lines.filter((line) => line.sellerEmail === seller), { by: who, reason, whole })
      );
    }

    res.status(200).json({ message: 'Order cancelled', cancelled: cancelled.modifiedCount });
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
