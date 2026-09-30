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
});
