/**
 * Promo codes are priced by the server.
 *
 * The one code there was lived in the checkout page, which worked out the
 * discount and sent it; the server stored whatever it was given. It has been
 * removed, and the rules kept for when a promotion runs again.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createBook, createSignedInUser } from './helpers/factories.js';
import Order from '../models/Order.model.js';
import { PROMOTIONS, applyPromotion, findPromotion, type Promotion } from '../config/promotions.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const checkout = async (body: Record<string, unknown>) => {
  const { auth } = await createSignedInUser(request, { email: 'buyer@test.com' });
  const book = await createBook({ price: 300, stock: 5 });
  const res = await request
    .post('/order/decrease-stock')
    .set('Authorization', auth)
    .send({ items: [{ bookId: String(book._id), quantity: 1 }], deliveryDistrict: 'Dhaka', ...body });
  return { res, book, line: await Order.findOne({ orderNumber: res.body.orderNumber }).lean() };
};

describe('with no promotion running', () => {
  it('there are none', () => {
    // The old "BookStore" code is gone.
    expect(PROMOTIONS).toHaveLength(0);
    expect(findPromotion('BookStore')).toBeUndefined();
  });

  it('a discount sent by the browser is ignored', async () => {
    const { line } = await checkout({ discount: 250, promoApplied: true });

    expect(line?.discount).toBe(0);
    expect(line?.promoApplied).toBe(false);
  });

  it('a code is refused before any stock is taken', async () => {
    const { res, book } = await checkout({ promo: 'BookStore' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not valid/);
    const AddBook = (await import('../models/AddBook.model.js')).default;
    expect((await AddBook.findById(book._id).lean())?.stock).toBe(5);
  });

  it('checking a code says it is not valid', async () => {
    const { auth } = await createSignedInUser(request, { email: 'buyer@test.com' });

    const res = await request
      .post('/order/promo')
      .set('Authorization', auth)
      .send({ code: 'BookStore', booksTotal: 300 });

    expect(res.status).toBe(400);
  });
});

/** The rules, for when a promotion is added. */
describe('the rules a promotion follows', () => {
  const fixed: Promotion = {
    code: 'WELCOME50',
    description: '50 Tk off your first order',
    discount: { kind: 'fixed', amount: 50 },
    firstOrderOnly: true,
  };
  const percent: Promotion = {
    code: 'BOOKS10',
    description: '10% off',
    discount: { kind: 'percent', percent: 10 },
    minBooksTotal: 500,
    endsAt: new Date('2030-01-01'),
  };

  it('matches a code however it is typed', () => {
    expect(findPromotion(' welcome 50 ', [fixed])).toBe(fixed);
  });

  it('takes a fixed amount or a share of the books', () => {
    expect(applyPromotion(fixed, { booksTotal: 300, isFirstOrder: true })).toMatchObject({ ok: true, discount: 50 });
    expect(applyPromotion(percent, { booksTotal: 850, isFirstOrder: false })).toMatchObject({
      ok: true,
      discount: 85,
    });
  });

  it('never takes more than the books cost', () => {
    expect(applyPromotion(fixed, { booksTotal: 30, isFirstOrder: true })).toMatchObject({ discount: 30 });
  });

  it('keeps to its conditions', () => {
    expect(applyPromotion(fixed, { booksTotal: 300, isFirstOrder: false })).toMatchObject({ ok: false });
    expect(applyPromotion(percent, { booksTotal: 400, isFirstOrder: false })).toMatchObject({ ok: false });
    expect(
      applyPromotion(percent, { booksTotal: 900, isFirstOrder: false }, new Date('2031-01-01'))
    ).toMatchObject({ ok: false, message: 'That code has expired.' });
  });
});
