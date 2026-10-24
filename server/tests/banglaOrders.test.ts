/**
 * Orders in Bangla: a request that asks for Bangla is answered in it, one
 * that names no language still gets the English, and a notification about an
 * order is kept in both so each person reads it in their own.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createBook, createUserWithToken, CHECKOUT } from './helpers/factories.js';
import Notification from '../models/Notification.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const BUYER = 'buyer@test.com';
const SELLER = 'seller@test.com';

describe('an order error', () => {
  it('is in Bangla when the request asks for Bangla, and in English otherwise', async () => {
    const buyer = await createUserWithToken({ email: BUYER, username: 'reader' });

    const bn = await request.get('/order/NOSUCHORDER00000').set('Authorization', buyer.auth).set('Accept-Language', 'bn');
    expect(bn.status).toBe(404);
    expect(bn.body.message).toBe('অর্ডারটি পাওয়া যায়নি');

    const en = await request.get('/order/NOSUCHORDER00000').set('Authorization', buyer.auth);
    expect(en.status).toBe(404);
    expect(en.body.message).toBe('Order not found');
  });
});

describe('a notification about an order', () => {
  it('is stored in English and in Bangla', async () => {
    const buyer = await createUserWithToken({ email: BUYER, username: 'reader', bkashMerchant: null });
    await createUserWithToken({ email: SELLER, username: 'bookshop' });
    const book = await createBook({ sellerEmail: SELLER, stock: 3, title: 'Deyal' });

    const res = await request
      .post('/order/decrease-stock')
      .set('Authorization', buyer.auth)
      .set('Accept-Language', 'bn')
      .send({ ...CHECKOUT, items: [{ bookId: String(book._id), quantity: 2 }] });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('স্টক আপডেট হয়েছে ও অর্ডার সংরক্ষিত হয়েছে');
    const { orderNumber } = res.body as { orderNumber: string };

    const placed = await Notification.findOne({ recipient: BUYER, type: 'order-placed' }).lean();
    expect(placed?.title).toBe(`Order ${orderNumber} confirmed`);
    expect(placed?.titleBn).toBe(`অর্ডার ${orderNumber} নিশ্চিত হয়েছে`);
    expect(placed?.body).toMatch(/^2 books, /);
    expect(placed?.bodyBn).toMatch(/^২টি বই, /);

    const received = await Notification.findOne({ recipient: SELLER, type: 'order-received' }).lean();
    expect(received?.title).toBe('New order: Deyal × 2');
    expect(received?.titleBn).toBe('নতুন অর্ডার: Deyal × ২');
  });
});
