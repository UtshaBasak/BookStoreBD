import { randomUUID } from 'crypto';

import type { Request, RequestHandler, Response } from 'express';

import type { CreateOrderResponse, UnavailableItem, UnavailableReason } from '@shared/api.js';

import AddBook, { type BookDocument } from '../models/AddBook.model.js';
import Order, { type LeanOrder } from '../models/Order.model.js';
import User from '../models/user.model.js';
import { CheckoutLock, CheckoutReceipt } from '../models/Checkout.model.js';
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
import { errorMessage, isDuplicateKeyError } from '../utils/error.js';
import {
  CANCELLED,
  RETURN_WINDOW_DAYS,
  ORDER_STAGES,
  SELLER_LAST_STAGE,
  canCancelLines,
  deliveryChargeFor,
  orderChargesFor,
  orderStatusOf,
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
const totalsFor = (lines: readonly LeanOrder[]) => orderChargesFor(lines);

/**
 * One page of orders, newest first.
 *
 * Paged by **order**, not by line: an order of three books is three rows, and
 * a page that cut between them would show part of a purchase and leave the
 * rest on the next page. So a page of order numbers is chosen first, and then
 * every line belonging to them is fetched. Searching here rather than in the
 * browser means a search covers every order, not just the page on screen.
 *
 * `$group` is a blocking stage, so this reads the orders the filter matches
 * rather than a page of them. For a buyer or a seller that is their own
 * orders, against an index; for the administrator's table it is every order,
 * which is the price of counting distinct purchases and is text, not images.
 */
const pageOfOrders = async (
  scope: Record<string, unknown>,
  query: OrderListQuery
): Promise<{
  lines: LeanOrder[];
  /** Every line of the orders on the page, matched or not, by order number - what totals are worked out from. */
  whole: Map<string, LeanOrder[]>;
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
}> => {
  const pattern = query.search ? contains(query.search) : null;
  const byTotal = query.sort === 'totalHigh' || query.sort === 'totalLow';
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
      { $group: { _id: '$orderNumber', createdAt: { $max: '$createdAt' } } },
      // Sorting by total is by what the order comes to - all of its books
      // still in it, with delivery and the discount - not by the lines a
      // search happened to match.
      ...(byTotal
        ? [
            {
              $lookup: {
                from: Order.collection.name,
                let: { number: '$_id' },
                pipeline: [
                  { $match: { ...scope, $expr: { $eq: ['$orderNumber', '$$number'] }, status: { $ne: CANCELLED } } },
                  {
                    $group: {
                      _id: null,
                      books: { $sum: { $multiply: [{ $ifNull: ['$price', 0] }, { $ifNull: ['$quantity', 1] }] } },
                      shipping: { $first: { $ifNull: ['$shippingCharge', 0] } },
                      discount: { $first: { $ifNull: ['$discount', 0] } },
                    },
                  },
                ],
                as: 'charges',
              },
            },
            {
              $addFields: {
                total: {
                  $let: {
                    vars: { c: { $first: '$charges' } },
                    in: {
                      $cond: [
                        { $gt: [{ $ifNull: ['$$c.books', 0] }, 0] },
                        { $subtract: [{ $add: ['$$c.books', '$$c.shipping'] }, { $min: ['$$c.discount', '$$c.books'] }] },
                        0,
                      ],
                    },
                  },
                },
              },
            },
          ]
        : []),
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
  // matched rather than the whole order.
  const rank = new Map(orderNumbers.map((number, index) => [number, index]));
  const everyLine = orderNumbers.length
    ? (
        await Order.find({ ...scope, orderNumber: { $in: orderNumbers } })
          .sort({ createdAt: -1, _id: -1 })
          .lean()
      ).sort((a, b) => (rank.get(a.orderNumber) ?? 0) - (rank.get(b.orderNumber) ?? 0))
    : [];
  const matching = new Set(
    orderNumbers.length && Object.keys(filter).length > Object.keys(scope).length
      ? (await Order.find({ ...filter, orderNumber: { $in: orderNumbers } }, { _id: 1 }).lean()).map((line) => String(line._id))
      : everyLine.map((line) => String(line._id))
  );
  const whole = new Map<string, LeanOrder[]>();
  for (const line of everyLine) {
    const group = whole.get(line.orderNumber);
    if (group) group.push(line);
    else whole.set(line.orderNumber, [line]);
  }

  return {
    lines: everyLine.filter((line) => matching.has(String(line._id))),
    whole,
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
  dispatchShopMail(buyer, orderPlacedBuyerEmail(facts, priced(reserved)), 'orders');
  for (const seller of new Set(reserved.map(({ book }) => book.sellerEmail))) {
    dispatchShopMail(seller, orderPlacedSellerEmail(facts, priced(reserved.filter(({ book }) => book.sellerEmail === seller))), 'orders');
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

/** How long one checkout may hold the buyer's lock before it is treated as abandoned. */
const CHECKOUT_LOCK_MS = 2 * 60 * 1000;

/**
 * Takes the buyer's checkout lock, or says they already hold it.
 *
 * A lock whose time ran out - a request that crashed half way - is taken
 * over rather than waited on.
 */
const takeCheckoutLock = async (buyerEmail: string): Promise<string | null> => {
  const token = randomUUID();
  const expiresAt = new Date(Date.now() + CHECKOUT_LOCK_MS);
  try {
    await CheckoutLock.create({ buyerEmail, token, expiresAt });
    return token;
  } catch (err) {
    if (!isDuplicateKeyError(err)) throw err;
  }
  const stale = await CheckoutLock.findOneAndUpdate(
    { buyerEmail, expiresAt: { $lt: new Date() } },
    { $set: { token, expiresAt } }
  );
  return stale ? token : null;
};

const releaseCheckoutLock = async (buyerEmail: string, token: string): Promise<void> => {
  await CheckoutLock.deleteOne({ buyerEmail, token }).catch((err: unknown) => {
    log.warn({ err }, 'Could not release a checkout lock');
  });
};

/**
 * Takes as many copies as there are, up to what was asked: when two of the
 * three wanted are left, the buyer gets the two and is told, rather than
 * losing the book from the order. Atomic per attempt, so two buyers racing
 * for the same copies never both get them; tried a few times in case the
 * stock moves between reading it and taking it.
 */
const reserveCopies = async (
  bookId: string,
  wanted: number
): Promise<{ reserved: number; left: number }> => {
  let ask = wanted;
  for (let attempt = 0; attempt < 3 && ask > 0; attempt++) {
    const taken = await AddBook.findOneAndUpdate(
      { _id: bookId, stock: { $gte: ask } },
      { $inc: { stock: -ask } },
      { returnDocument: 'after', projection: { stock: 1 } }
    ).lean();
    if (taken) return { reserved: ask, left: Number(taken.stock) };
    const now = await AddBook.findById(bookId, { stock: 1 }).lean();
    ask = Math.min(wanted, Math.max(0, Number(now?.stock ?? 0)));
  }
  return { reserved: 0, left: 0 };
};

/** Puts reserved copies back, when an order could not be written after all. */
const giveBackCopies = async (reserved: readonly { book: BookDocument; quantity: number }[]): Promise<void> => {
  for (const { book, quantity } of reserved) {
    await AddBook.updateOne({ _id: book._id }, { $inc: { stock: quantity } }).catch((err: unknown) => {
      log.error({ err, bookId: String(book._id), quantity }, 'Could not give back reserved stock');
    });
  }
};

export const decreaseStock = async (
  req: Request<unknown, unknown, CreateOrderBody>,
  res: Response
): Promise<void> => {
  const buyer = String(actingUser(req).email);

  // One checkout at a time per buyer. A second one sent while the first is
  // still running is told so; once the first is done, a repeat with the same
  // checkout id gets the first one's answer below.
  let lock: string | null;
  try {
    lock = await takeCheckoutLock(buyer);
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
    return;
  }
  if (!lock) {
    res.status(409).json({
      code: 'checkout-in-progress',
      message: 'Your order is already being placed. Check your orders in a moment.',
    });
    return;
  }

  try {
    const { items, checkoutId } = req.body;

    if (checkoutId) {
      const receipt = await CheckoutReceipt.findOne({ buyerEmail: buyer, checkoutId }).lean();
      if (receipt) {
        res.status(200).json({ ...(receipt.response as CreateOrderResponse), replayed: true });
        return;
      }
    }

    /*
     * A promo code is checked and priced here, never taken from the browser.
     * An unknown code is refused before any stock is reserved, so the buyer
     * can correct it.
     */
    const promoCode = req.body.promo?.trim() || '';
    const promotion = promoCode ? findPromotion(promoCode) : undefined;
    if (promoCode && !promotion) {
      res.status(400).json({ message: 'That promo code is not valid.' });
      return;
    }
    // Safe from a second checkout at the same moment: the lock above means
    // this buyer has no other order being written.
    const isFirstOrder = !(await Order.exists({ buyerEmail: buyer, status: { $ne: CANCELLED } }));

    /*
     * What can be ordered at all. A book that has been taken down, the
     * buyer's own listing, and a book whose seller cannot be paid (no
     * account, or no bKash number) are left out and named in the answer.
     */
    const unavailable: UnavailableItem[] = [];
    const books = await AddBook.find({ _id: { $in: items.map((item) => item.bookId) } });
    const byId = new Map(books.map((book) => [String(book._id), book]));
    const sellers = await User.find(
      { email: { $in: [...new Set(books.map((book) => book.sellerEmail))] } },
      { email: 1, bkashMerchant: 1 }
    ).lean();
    const payable = new Set(sellers.filter((seller) => Boolean(seller.bkashMerchant)).map((seller) => seller.email));

    const wanted: { book: BookDocument; quantity: number }[] = [];
    for (const { bookId, quantity } of items) {
      const book = byId.get(bookId);
      const leaveOut = (reason: UnavailableReason) =>
        unavailable.push({ bookId, title: book?.title, available: 0, requested: quantity, reserved: 0, reason });
      if (!book) leaveOut('removed');
      else if (book.sellerEmail === buyer) leaveOut('own-listing');
      else if (!payable.has(book.sellerEmail)) leaveOut('seller-unavailable');
      else wanted.push({ book, quantity });
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

    const reserved: { book: BookDocument; quantity: number }[] = [];
    const stockMoves: { book: BookDocument; before: number; after: number }[] = [];

    for (const { book, quantity } of wanted) {
      const bookId = String(book._id);
      // What is left after taking decides who hears the book is running low.
      const taken = await reserveCopies(bookId, quantity);
      if (taken.reserved < quantity) {
        unavailable.push({
          bookId,
          title: book.title,
          available: taken.reserved,
          requested: quantity,
          reserved: taken.reserved,
          reason: taken.reserved ? 'short' : 'sold-out',
        });
      }
      if (!taken.reserved) continue;
      reserved.push({ book, quantity: taken.reserved });
      stockMoves.push({ book, before: taken.left + taken.reserved, after: taken.left });
    }

    // Nothing reserved is no order: no number, no lines, no notices.
    if (!reserved.length) {
      res.status(409).json({ message: 'None of the selected books can be ordered right now.', unavailable });
      return;
    }

    /*
     * Delivery is priced by the server, from what was actually reserved, so a
     * checkout request cannot name its own delivery charge.
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

    const orderNumber = await generateUniqueOrderNumber();
    const createdAt = new Date();
    try {
      await Order.insertMany(
        reserved.map(({ book, quantity }) => ({
          orderNumber, // the same orderNumber for every book in this order
          buyerEmail: buyer,
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
          // --- Payment and delivery details ---
          paymentMethod: req.body.paymentMethod,
          contactName: req.body.contactName,
          contactPhone: req.body.contactPhone,
          deliveryDivision: req.body.deliveryDivision,
          deliveryDistrict: req.body.deliveryDistrict,
          deliveryAddress: req.body.deliveryAddress,
          buyerNote: req.body.buyerNote || '',
          // --- Charges and discounts ---
          shippingCharge,
          discount,
          promo: applied?.ok ? applied.code : '',
          promoApplied: Boolean(applied?.ok),
          checkoutId: checkoutId ?? '',
          status: 'Order Confirmed',
          createdAt,
        }))
      );
    } catch (err) {
      // All or nothing: the stock taken for an order that was not written
      // goes back on the shelf.
      await Order.deleteMany({ orderNumber }).catch(() => undefined);
      await giveBackCopies(reserved);
      throw err;
    }

    const response: CreateOrderResponse = {
      message: 'Stock updated & order saved',
      orderNumber,
      shippingCharge,
      discount,
      ...(applied && !applied.ok ? { promoMessage: applied.message } : {}),
      unavailable,
    };
    if (checkoutId) {
      await CheckoutReceipt.create({ buyerEmail: buyer, checkoutId, orderNumber, response }).catch((err: unknown) => {
        log.warn({ err }, 'Could not keep a checkout receipt');
      });
    }

    await announceOrder(orderNumber, buyer, reserved, {
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
      await stockChanged(move.book, move.before, move.after, { actor: buyer });
    }

    res.status(200).json(response);
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  } finally {
    await releaseCheckoutLock(buyer, lock);
  }
};

// Get all orders for a buyer
export const getOrdersByBuyer: RequestHandler = async (req, res) => {
  try {
    const { email } = actingUser(req);
    const query = validatedQuery<OrderListQuery>(req);
    const { lines, whole, ...page } = await pageOfOrders({ buyerEmail: email }, query);

    // Order-level totals repeat on every line of the same order.
    const grouped = new Map<string, LeanOrder[]>();
    for (const line of lines) {
      const key = line.orderNumber || String(line._id);
      const group = grouped.get(key);
      if (group) group.push(line);
      else grouped.set(key, [line]);
    }

    /*
     * Whether each book on this page has a return in progress, from one small
     * query for the books on the page: a return request carries its defect
     * photographs as base64, so fetching every request would be costly.
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
    for (const [orderNumber, orderBooks] of grouped) {
      // From the whole order, not the lines a search or a status matched:
      // a search for one title still shows what the order comes to.
      const all = whole.get(orderNumber) ?? orderBooks;
      const totals = { ...totalsFor(all), orderStatus: orderStatusOf(all), canCancel: canCancelLines('buyer', all) };
      for (const book of orderBooks) {
        const deadline = returnDeadline(book);
        items.push({
          ...book,
          ...totals,
          returnStatus: byLine.get(String(book._id)) ?? byBook.get(String(book.bookId)) ?? null,
          // Decided here, where it is enforced, so the page and the API agree.
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
    const { lines, total, page: pageNumber, pageSize, pageCount } = await pageOfOrders(
      { sellerEmail: email },
      validatedQuery<OrderListQuery>(req)
    );
    const page = { total, page: pageNumber, pageSize, pageCount };

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
    // A seller sees their own books in it and nothing of another seller's:
    // not their titles, prices, e-mail addresses or payouts.
    const who = viewerRole(orders, actor, role);
    const shown = who === 'seller' ? orders.filter((line) => line.sellerEmail === actor) : orders;
    const first = shown[0] ?? orders[0];
    const totals = totalsFor(shown);
    const mine = linesFor(orders, who ?? 'buyer', actor);
    // The defaults come after the spread rather than before it. Records
    // written before these fields existed have no value to spread, and `.lean()`
    // does not apply schema defaults, so something has to fill the gap.
    res.status(200).json({
      ...first,
      orderNumber: first.orderNumber,
      // The least advanced of the books still in it, so the order page and
      // the order list say the same thing.
      status: orderStatusOf(shown),
      // Worked out here, by the rules that enforce them, so the page offers
      // exactly what the API will accept: a cancel needs every book in it
      // to be cancellable.
      canCancel: who ? canCancelLines(who, mine) : false,
      statusOptions:
        who === 'admin' || who === 'seller'
          ? statusOptionsFor(who, orderStatusOf(mine), { deliveredLocked: await deliveredLocked(mine) })
          : [],
      paymentMethod: first.paymentMethod || '',
      contactName: first.contactName || '',
      contactPhone: first.contactPhone || '',
      deliveryDivision: first.deliveryDivision || '',
      deliveryDistrict: first.deliveryDistrict || '',
      deliveryAddress: first.deliveryAddress || '',
      books: shown,
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

/**
 * Whether delivered books have gone past the point of being moved back: the
 * seller has been paid for one, or the buyer has asked to return one.
 */
const deliveredLocked = async (lines: readonly LeanOrder[]): Promise<boolean> => {
  const delivered = lines.filter((line) => line.status === 'Delivered');
  if (!delivered.length) return false;
  if (delivered.some((line) => line.sellerPaidAt)) return true;
  return (await ReturnRequest.exists({ orderId: { $in: delivered.map((line) => line._id) } })) !== null;
};

/** The statuses a person may pick from where the order is now. */
const statusOptionsFor = (who: 'admin' | 'seller', current: string, rules: { deliveredLocked: boolean }): string[] =>
  current === CANCELLED
    ? []
    : ORDER_STAGES.filter((stage) => stage === current || !statusChangeProblem(who, current, stage, rules));

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
     * The seller who is sending the book, or an administrator - not the buyer:
     * the return window opens on delivery, so a buyer moving their own order
     * out of 'Delivered' and back would restart it.
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
    const current = orderStatusOf(mine);
    // Every book it would move must be allowed to make that move: a seller
    // whose books are at different stages cannot pull one of them back.
    const rules = { deliveredLocked: await deliveredLocked(mine) };
    const problem = mine.length
      ? mine.map((line) => statusChangeProblem(who, line.status, String(status), rules)).find(Boolean)
      : statusChangeProblem(who, CANCELLED, String(status));
    if (problem) {
      res.status(403).json({ message: problem });
      return;
    }

    // Delivery is stamped when it first happens, and only then: marking an
    // order delivered again, or moving it back and on, does not move the date
    // the return window and the payout count from.
    const wasDelivered = mine.length > 0 && mine.every((o) => o.status === 'Delivered');
    const becomesDelivered = String(status) === 'Delivered';
    const ids = mine.map((line) => line._id);
    const orders = await Order.updateMany({ _id: { $in: ids }, status: { $ne: CANCELLED } }, { $set: { status: String(status) } });
    if (becomesDelivered) {
      await Order.updateMany({ _id: { $in: ids }, deliveredAt: null }, { $set: { deliveredAt: new Date() } });
    }
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
        dispatchShopMail(existing[0]?.buyerEmail, orderDeliveredBuyerEmail(facts, mine), 'orders');
        const payableFrom = new Date(Date.now() + RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000);
        for (const seller of new Set(mine.map((line) => line.sellerEmail))) {
          dispatchShopMail(seller, orderDeliveredSellerEmail(facts, mine.filter((line) => line.sellerEmail === seller), payableFrom), 'orders');
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

    const candidates = linesFor(existing, who, actor);
    if (!canCancelLines(who, candidates)) {
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

    /*
     * Each book is cancelled only if it is still where it was read - not
     * cancelled already, and not moved on in the meantime - and only a book
     * this request actually cancelled has its copies put back and is told
     * about. Two cancels at once (a double click, or the buyer and the seller
     * together) put the stock back once.
     */
    const lines: LeanOrder[] = [];
    for (const line of candidates) {
      const changed = await Order.updateOne(
        { _id: line._id, status: line.status ?? 'Order Confirmed' },
        { $set: { status: CANCELLED, cancelledAt: new Date(), cancelledBy: who, cancelReason: reason } }
      );
      if (changed.modifiedCount === 1) lines.push(line);
    }
    if (!lines.length) {
      res.status(409).json({ message: 'This order has already been cancelled or has moved on.' });
      return;
    }
    const cancelled = { modifiedCount: lines.length };

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
    dispatchShopMail(existing[0]?.buyerEmail, orderCancelledEmail('buyer', facts, lines, { by: who, reason, whole }), 'orders');
    for (const seller of new Set(lines.map((line) => line.sellerEmail))) {
      dispatchShopMail(
        seller,
        orderCancelledEmail('seller', facts, lines.filter((line) => line.sellerEmail === seller), { by: who, reason, whole }),
        'orders'
      );
    }

    res.status(200).json({ message: 'Order cancelled', cancelled: cancelled.modifiedCount });
  } catch (err) {
    res.status(500).json({ message: errorMessage(err) });
  }
};

// Delete an order by id
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
    const { lines, whole, ...page } = await pageOfOrders({}, validatedQuery<OrderListQuery>(req));
    // Each line carries what its whole order comes to and where it stands,
    // as the buyer's list does.
    const summaries = new Map(
      [...whole].map(([number, all]) => [number, { ...totalsFor(all), orderStatus: orderStatusOf(all) }])
    );
    res.status(200).json({ items: lines.map((line) => ({ ...line, ...summaries.get(line.orderNumber) })), ...page });
  } catch (err) {
    log.error({ err }, 'Error in getAllOrders');
    res.status(500).json({ message: errorMessage(err) || 'Internal Server Error' });
  }
};
