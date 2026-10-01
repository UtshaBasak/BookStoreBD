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
 */
export const site = {
  name: 'BookStoreBD',
  tagline: 'New and second-hand books, bought and sold across Bangladesh.',

  /**
   * The tagline as a search result shows it. Google truncates a title at about
   * 60 characters, and the full one with the shop's name in front is longer.
   */
  seoTagline: 'New and second-hand books across Bangladesh',

  /** The person who runs the shop - the "we" of the policy pages. */
  owner: 'Utsha Basak',

  /** The one way to reach a human. There is deliberately no phone line. */
  email: 'support.utsha@gmail.com',

  /** Where the shop is. Returns are sent to an address given on approval. */
  location: 'Dhaka, Bangladesh',

  /** Who may hold an account. Buying is a contract, and that is the age for it. */
  minimumAge: 18,

  payment: 'Cash on delivery',

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
    firstOrder: { code: 'BookStoreBD', description: '50 Tk off your first order' },
    freeDelivery: {
      code: 'FreeDelivery',
      description: 'Free delivery on orders of 1000 Tk or more',
      /** Taka of books the code needs. */
      minBooksTotal: 1000,
    },
  },

  /** The date the policy pages were last reviewed. */
  policiesUpdated: '2 October 2026',
} as const;

/**
 * The delivery charge for a district, as the API will work it out. Free
 * delivery is the FreeDelivery code, applied on top of this.
 */
export const deliveryChargeFor = (district: string): number =>
  district.trim().toLowerCase() === 'dhaka' ? site.delivery.insideDhaka : site.delivery.outsideDhaka;

export default site;
