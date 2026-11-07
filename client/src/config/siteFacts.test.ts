/**
 * The figures the site quotes to shoppers (site.ts) are the ones the server
 * enforces and the shopping assistant repeats.
 */
import { describe, it, expect } from 'vitest';

import {
  DELIVERY,
  DELIVERY_DAYS,
  REFUND_WORKING_DAYS,
  RETURN_WINDOW_DAYS,
  SELLER_FEE_PERCENT,
} from '../../../server/config/commerce.js';
import { MINIMUM_AGE, SUPPORT_EMAIL } from '../../../server/config/contact.js';
import { site } from './site.js';

describe('site.ts figures match the server', () => {
  it('delivery charges', () => {
    expect(site.delivery.insideDhaka).toBe(DELIVERY.insideDhaka);
    expect(site.delivery.outsideDhaka).toBe(DELIVERY.outsideDhaka);
  });

  it('delivery days', () => {
    expect(site.delivery.daysInsideDhaka).toBe(DELIVERY_DAYS.insideDhaka);
    expect(site.delivery.daysOutsideDhaka).toBe(DELIVERY_DAYS.outsideDhaka);
  });

  it('returns and refunds', () => {
    expect(site.returns.windowDays).toBe(RETURN_WINDOW_DAYS);
    expect(site.returns.refundWorkingDays).toBe(REFUND_WORKING_DAYS);
  });

  it('seller fee', () => {
    expect(site.sellerFeePercent).toBe(SELLER_FEE_PERCENT);
  });

  it('minimum age and support e-mail', () => {
    expect(site.minimumAge).toBe(MINIMUM_AGE);
    expect(site.email).toBe(SUPPORT_EMAIL);
  });
});
