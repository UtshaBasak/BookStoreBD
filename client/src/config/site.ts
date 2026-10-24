import { t } from '../utils/language.js';

/**
 * The business details that appear in the footer, the policy pages, the
 * contact page and checkout.
 *
 * One place on purpose, so the details cannot drift apart: change them here
 * and every page follows.
 *
 * The money rules - delivery charges, the return window - are enforced by the
 * API in `server/config/commerce.ts`. The figures here are what people are
 * told, so they must match it.
 *
 * Text that is shown has its Bangla beside it in a `...Bn` field, chosen where
 * it is shown - `t(site.tagline, site.taglineBn)` - so nothing here reads the
 * language when the module loads. The functions below do that choosing.
 */
export const site = {
  name: 'BookStoreBD',
  tagline: 'New and second-hand books, bought and sold across Bangladesh.',
  taglineBn: 'সারা বাংলাদেশে নতুন ও পুরোনো বই কেনাবেচা।',

  /**
   * The tagline as a search result shows it. Google truncates a title at about
   * 60 characters, and the full one with the shop's name in front is longer.
   */
  seoTagline: 'New and second-hand books across Bangladesh',
  seoTaglineBn: 'সারা বাংলাদেশে নতুন ও পুরনো বই',

  /** The person who runs the shop - the "we" of the policy pages. */
  owner: 'Utsha Basak',

  /** The one way to reach a human. There is deliberately no phone line. */
  email: 'support.utsha@gmail.com',

  /** Where the shop is. Returns are sent to an address given on approval. */
  location: 'Dhaka, Bangladesh',
  locationBn: 'ঢাকা, বাংলাদেশ',

  /** Who may hold an account. Buying is a contract, and that is the age for it. */
  minimumAge: 18,

  payment: 'Cash on delivery',
  paymentBn: 'ক্যাশ অন ডেলিভারি',

  delivery: {
    /** Taka. "Inside Dhaka" is Dhaka district, not the whole division. */
    insideDhaka: 70,
    outsideDhaka: 120,
    /** Working days from the order. */
    daysInsideDhaka: 3,
    daysOutsideDhaka: 5,
  },

  returns: {
    /** Days to ask for a return, counted from delivery. */
    windowDays: 7,
    /** Working days to refund by bKash, counted from when the book reaches us. */
    refundWorkingDays: 15,
  },

  /**
   * What a seller pays: nothing to list, this share of a sale's book total.
   * Paid by bKash to the seller's merchant number once the order's return
   * window has closed.
   */
  sellerFeePercent: 5,

  /**
   * Whether checkout shows a promo code box. Keep it off whenever
   * `server/config/promotions.ts` is empty: a box that can only say "not
   * valid" sends shoppers hunting for a code that does not exist.
   */
  promoCodes: true,

  /**
   * The codes running, as shoppers are told about them. The server holds the
   * rules and prices every code; a test pins these to its list.
   */
  promotions: {
    firstOrder: {
      code: 'BookStoreBD',
      description: '50 Tk off your first order',
      descriptionBn: 'প্রথম অর্ডারে ৫০ টাকা ছাড়',
    },
    freeDelivery: {
      code: 'FreeDelivery',
      description: 'Free delivery on orders of 1000 Tk or more',
      descriptionBn: '১০০০ টাকা বা তার বেশি অর্ডারে ফ্রি ডেলিভারি',
      /** Taka of books the code needs. */
      minBooksTotal: 1000,
    },
  },

  /** The date the policy pages were last reviewed. */
  // Shown through formatDate, which writes it in Bangla when the site is.
  policiesUpdated: '24 October 2026',
} as const;

/**
 * The delivery charge for a district, as the API will work it out. Free
 * delivery is the FreeDelivery code, applied on top of this.
 */
export const deliveryChargeFor = (district: string): number =>
  district.trim().toLowerCase() === 'dhaka' ? site.delivery.insideDhaka : site.delivery.outsideDhaka;

/** The shown text in the language being shown. Functions, so they read it when called. */
export const siteTagline = (): string => t(site.tagline, site.taglineBn);
export const siteSeoTagline = (): string => t(site.seoTagline, site.seoTaglineBn);
export const siteLocation = (): string => t(site.location, site.locationBn);
export const sitePayment = (): string => t(site.payment, site.paymentBn);
/** The date the policies last changed; LegalPage writes it in the language shown. */
export const sitePoliciesUpdated = (): string => site.policiesUpdated;
export const promotionDescription = (promotion: { description: string; descriptionBn: string }): string =>
  t(promotion.description, promotion.descriptionBn);

export default site;
