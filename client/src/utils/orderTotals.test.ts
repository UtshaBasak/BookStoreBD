import { describe, expect, it } from 'vitest';

import { orderTotals } from './orderTotals.js';

const line = (status: string, price: number, quantity = 1) => ({
  status,
  price,
  quantity,
  shippingCharge: 70,
  discount: 50,
});

describe('orderTotals', () => {
  it('leaves a cancelled book out of what the buyer pays', () => {
    const totals = orderTotals([line('Processing', 300, 2), line('Cancelled', 500)]);

    expect(totals.itemTotal).toBe(600);
    expect(totals.total).toBe(600 + 70 - 50);
    expect(totals.status).toBe('Processing');
    expect(totals.cancelled).toBe(1);
  });

  it('charges nothing, delivery included, once every book is cancelled', () => {
    const totals = orderTotals([line('Cancelled', 300), line('Cancelled', 500)]);

    expect(totals.total).toBe(0);
    expect(totals.shipping).toBe(0);
    expect(totals.status).toBe('Cancelled');
  });

  it('never takes off more than the books left', () => {
    const totals = orderTotals([line('Order Confirmed', 30), line('Cancelled', 300)]);

    expect(totals.discount).toBe(30);
    expect(totals.total).toBe(70);
  });

  it('stands where its least advanced book does', () => {
    expect(orderTotals([line('Shipped', 100), line('Processing', 100)]).status).toBe('Processing');
  });

  it("uses the server's totals for the whole order when a list sends them", () => {
    const matched = { ...line('Shipped', 100), booksTotal: 900, shippingCost: 70, discount: 0, totalCost: 970, orderStatus: 'Processing' };

    expect(orderTotals([matched])).toMatchObject({ itemTotal: 900, total: 970, status: 'Processing' });
  });
});
