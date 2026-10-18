import { describe, expect, it } from 'vitest';

import type { OrderDetail } from '@shared/api.js';

import { orderPdfHtml } from './orderPdf.js';

const line = (id: string, title: string, price: number, returnStatus: 'approved' | 'pending' | null) => ({
  _id: id,
  orderNumber: 'ABCDEFGH12345678',
  status: 'Delivered',
  buyerEmail: 'buyer@test.com',
  sellerEmail: 'seller@test.com',
  bookId: `book-${id}`,
  title,
  price,
  quantity: 1,
  returnStatus,
});

const order = {
  ...line('1', 'Deyal', 500, null),
  books: [line('1', 'Deyal', 500, null), line('2', 'Sapiens', 300, 'approved')],
  booksTotal: 800,
  shippingCost: 70,
  totalCost: 870,
  canCancel: false,
  statusOptions: [],
} as unknown as OrderDetail;

describe("the seller's slip", () => {
  it('leaves a returned book out of what the seller receives, as the orders page does', () => {
    const html = orderPdfHtml(order, 'seller', 'seller@test.com');

    expect(html).toContain('Your books (not returned)');
    // 500 Tk of books, less the 5% fee: 475.
    expect(html).toContain('475.00');
    expect(html).toContain('returned');
  });
});
