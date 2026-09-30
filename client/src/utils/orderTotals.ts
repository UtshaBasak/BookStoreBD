import type { OrderLine } from '@shared/api.js';

export const CANCELLED = 'Cancelled';

/**
 * The totals of one order's lines, worked out the way the API does.
 *
 * A cancelled book is not paid for, and an order with nothing left in it has
 * no delivery to charge for either - so a page that summed every line would
 * show a buyer a bill they are not paying.
 */
export function orderTotals(lines: readonly Pick<OrderLine, 'price' | 'quantity' | 'status' | 'shippingCharge' | 'discount'>[]) {
  const live = lines.filter((line) => line.status !== CANCELLED);
  const itemTotal = live.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
  const shipping = live.length ? Number(lines[0]?.shippingCharge ?? 0) : 0;
  const discount = live.length ? Number(lines[0]?.discount ?? 0) : 0;
  return {
    itemTotal,
    shipping,
    discount,
    total: itemTotal + shipping - discount,
    /** Where the order stands: its live books' stage, or Cancelled when none are left. */
    status: live[0]?.status || (live.length ? 'Order Confirmed' : CANCELLED),
    cancelled: lines.length - live.length,
  };
}
