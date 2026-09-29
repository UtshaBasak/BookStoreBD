/**
 * The business details that appear in the footer, the policy pages, the
 * contact page and checkout.
 *
 * One place on purpose: these used to be typed out in the homepage footer and
 * nowhere else, which is how they drifted into being placeholders nobody
 * noticed. Change them here and every page follows.
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
    /** Books totalling this many taka or more are delivered free. */
    freeFrom: 1000,
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

  /** What a seller pays: nothing to list, this share of a sale's book total. */
  sellerFeePercent: 5,

  /** The date the policy pages were last reviewed. */
  policiesUpdated: '29 September 2026',
} as const;

/** The delivery charge for a district, as the API will work it out. */
export const deliveryChargeFor = (district: string, booksTotal: number): number => {
  if (booksTotal >= site.delivery.freeFrom) return 0;
  return district.trim().toLowerCase() === 'dhaka'
    ? site.delivery.insideDhaka
    : site.delivery.outsideDhaka;
};

export default site;
