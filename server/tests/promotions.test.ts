/**
 * Promo codes are priced by the server.
 *
 * The first code there was lived in the checkout page, which worked out the
 * discount and sent it; the server stored whatever it was given. Codes live
 * in server/config/promotions.ts now: "BookStoreBD", 50 Tk off a first order,
 * and "FreeDelivery", which waives delivery on 1000 Tk of books - automatic
 * before, a code now.
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

const signedInBuyer = () => createSignedInUser(request, { email: 'buyer@test.com' });

const checkout = async (
  auth: string,
  body: Record<string, unknown>,
  { price = 300, district = 'Sylhet' } = {}
) => {
  const book = await createBook({ price, stock: 5 });
  const res = await request
    .post('/order/decrease-stock')
    .set('Authorization', auth)
    .send({ items: [{ bookId: String(book._id), quantity: 1 }], deliveryDistrict: district, ...body });
  return { res, book, line: await Order.findOne({ orderNumber: res.body.orderNumber }).lean() };
};

const stockOf = async (id: unknown) => {
  const AddBook = (await import('../models/AddBook.model.js')).default;
  return (await AddBook.findById(id).lean())?.stock;
};

describe('the codes running', () => {
  it('are BookStoreBD and FreeDelivery, and the old "BookStore" is gone', () => {
    expect(PROMOTIONS.map((promo) => promo.code)).toEqual(['BookStoreBD', 'FreeDelivery']);
    expect(findPromotion('BookStore')).toBeUndefined();
  });

  it('a discount sent by the browser is ignored', async () => {
    const { auth } = await signedInBuyer();
    const { line } = await checkout(auth, { discount: 250, promoApplied: true });

    expect(line?.discount).toBe(0);
    expect(line?.promoApplied).toBe(false);
  });

  it('an unknown code is refused before any stock is taken', async () => {
    const { auth } = await signedInBuyer();
    const { res, book } = await checkout(auth, { promo: 'BookStore' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/not valid/);
    expect(await stockOf(book._id)).toBe(5);
  });
});

describe('BookStoreBD: 50 Tk off a first order', () => {
  it('takes 50 Tk off the books on a first order', async () => {
    const { auth } = await signedInBuyer();
    const { res, line } = await checkout(auth, { promo: 'bookstorebd' });

    expect(res.status).toBe(200);
    expect(res.body.discount).toBe(50);
    expect(line).toMatchObject({ discount: 50, promo: 'BookStoreBD', promoApplied: true, shippingCharge: 120 });
  });

  it('is refused on a second order, with the reason, and nothing is taken', async () => {
    const { auth } = await signedInBuyer();
    await checkout(auth, {});

    const { res, book } = await checkout(auth, { promo: 'BookStoreBD' });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/first order/);
    expect(await stockOf(book._id)).toBe(5);
  });

  it('knows a first order from the server, not from the browser', async () => {
    // It used to be a flag in localStorage, so clearing it made any order a first order.
    const { auth } = await signedInBuyer();
    await checkout(auth, {});

    const res = await request
      .post('/order/promo')
      .set('Authorization', auth)
      .send({ code: 'BookStoreBD', booksTotal: 300 });

    expect(res.status).toBe(400);
  });
});

describe('FreeDelivery: no delivery charge on 1000 Tk of books', () => {
  it('waives the charge on an order of 1000 Tk or more', async () => {
    const { auth } = await signedInBuyer();
    const { res, line } = await checkout(auth, { promo: 'FreeDelivery' }, { price: 1000 });

    expect(res.body.shippingCharge).toBe(0);
    expect(line).toMatchObject({ shippingCharge: 0, discount: 0, promo: 'FreeDelivery', promoApplied: true });
  });

  it('is needed: 1000 Tk of books without it pays for delivery', async () => {
    const { auth } = await signedInBuyer();
    const { line } = await checkout(auth, {}, { price: 1000 });

    expect(line?.shippingCharge).toBe(120);
  });

  it('is refused under 1000 Tk, with the reason, before stock is taken', async () => {
    const { auth } = await signedInBuyer();
    const { res, book } = await checkout(auth, { promo: 'FreeDelivery' }, { price: 999 });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/1000 Tk/);
    expect(await stockOf(book._id)).toBe(5);
  });

  it('says what it does when checked at checkout', async () => {
    const { auth } = await signedInBuyer();

    const res = await request
      .post('/order/promo')
      .set('Authorization', auth)
      .send({ code: 'freedelivery', booksTotal: 1200 });

    expect(res.body).toMatchObject({ code: 'FreeDelivery', discount: 0, freeDelivery: true });
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
