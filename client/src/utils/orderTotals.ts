import type { OrderLine, OrderSummary } from '@shared/api.js';

export const CANCELLED = 'Cancelled';

const STAGES = ['Order Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered'];

type TotalsLine = Pick<OrderLine, 'price' | 'quantity' | 'status' | 'shippingCharge' | 'discount'> & Partial<OrderSummary>;

/**
 * The totals of one order, and where it stands.
 *
 * The order lists send these with every line, worked out by the server from
 * the whole order - so a search that matched one book still shows what the
 * order comes to - and they are used when present. Otherwise they are worked
 * out here the way the API does: a cancelled book is not paid for, an order
 * with nothing left in it has no delivery to charge for, a discount is never
 * more than the books left, and the order stands where its least advanced
 * book does.
 */
export function orderTotals(lines: readonly TotalsLine[]) {
  const live = lines.filter((line) => line.status !== CANCELLED);
  const cancelled = lines.length - live.length;
  const sent = lines[0];
  if (sent && typeof sent.totalCost === 'number' && typeof sent.orderStatus === 'string') {
    return {
      itemTotal: Number(sent.booksTotal ?? 0),
      shipping: Number(sent.shippingCost ?? 0),
      discount: Number(sent.discount ?? 0),
      total: sent.totalCost,
      status: sent.orderStatus,
      cancelled,
    };
  }

  const itemTotal = live.reduce((sum, line) => sum + Number(line.price) * Number(line.quantity), 0);
  const shipping = live.length ? Number(lines[0]?.shippingCharge ?? 0) : 0;
  const discount = live.length ? Math.min(Number(lines[0]?.discount ?? 0), itemTotal) : 0;
  const least = live.reduce<string | null>((stage, line) => {
    const status = line.status || 'Order Confirmed';
    return stage === null || STAGES.indexOf(status) < STAGES.indexOf(stage) ? status : stage;
  }, null);
  return {
    itemTotal,
    shipping,
    discount,
    total: itemTotal + shipping - discount,
    /** Where the order stands: its least advanced live book, or Cancelled when none are left. */
    status: least ?? CANCELLED,
    cancelled,
  };
}
