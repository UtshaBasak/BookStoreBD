import Order from '../models/Order.model.js';

/**
 * Whether somebody has bought something, for writing a review or rating a
 * seller: a matching order line that has been delivered.
 *
 * Delivery, not ordering: an order can be placed, reviewed and cancelled, and
 * a review that outlives its order says nothing about the book. Delivery is
 * set by the shop rather than the seller, so it is a sale that happened.
 *
 * `ordered` says whether there is an order on its way, so the page can tell
 * the buyer to wait for it rather than that they never bought it.
 */
export const purchaseOf = async (
  match: { buyerEmail: string; bookId?: string; sellerEmail?: string }
): Promise<{ orderNumber: string | null; ordered: boolean }> => {
  const delivered = await Order.findOne({ ...match, status: 'Delivered' }, { orderNumber: 1 })
    .sort({ deliveredAt: -1, createdAt: -1 })
    .lean();
  if (delivered) return { orderNumber: String(delivered.orderNumber), ordered: true };
  const onItsWay = await Order.exists({ ...match, status: { $nin: ['Cancelled', 'Delivered'] } });
  return { orderNumber: null, ordered: onItsWay !== null };
};
