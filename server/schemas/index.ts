import {
  z,
  email,
  password,
  username,
  otpCode,
  objectId,
  objectIdParam,
  emailParam,
  orderNumber,
  nonNegativeInt,
  nonNegativeAmount,
  positiveInt,
  boundedInt,
  shortText,
  mediumText,
  repeatable,
  urlText,
  bdMobile,
} from './common.js';

/**
 * One schema per endpoint, grouped by domain.
 *
 * Anything not described here is stripped: Zod objects drop unknown keys by
 * default, so a body cannot smuggle extra fields into a Mongoose document.
 */

// ---------------------------------------------------------------- auth
export const authSchemas = {
  signup: {
    body: z.object({
      username,
      email,
      password,
      // Accepted but unused; the OTP is checked against the store, not this.
      otp: otpCode.optional(),
    }),
  },
  signin: {
    body: z.object({
      email,
      // Not `password` here: an existing account may pre-date the length rule,
      // and a minimum on sign-in would lock those users out.
      password: z.string().min(1, 'Password is required').max(200),
      /** From the bot check on the page, when it is on. */
      captchaToken: z.string().max(4096).optional(),
    }),
  },
  sendOtp: {
    body: z.object({
      email,
      username: username.optional(),
      purpose: z.enum(['register', 'reset']).optional(),
      captchaToken: z.string().max(4096).optional(),
    }),
  },
  verifyOtp: {
    body: z.object({ email, code: otpCode }),
  },
  resetPassword: {
    body: z.object({ email, otp: otpCode, newPassword: password }),
  },
  /** Whether a password would be accepted, before the sign-up code is sent. */
  passwordCheck: {
    body: z.object({
      password,
      email: z.string().trim().max(254).optional(),
      username: z.string().trim().max(40).optional(),
    }),
  },
};

// ---------------------------------------------------------------- book
export const bookSchemas = {
  byId: { params: objectIdParam },
  /**
   * The cover endpoint needs its index declared here, not only in the path.
   * `validate` replaces `req.params` with what the schema parsed, so a key the
   * schema does not mention is stripped and `/cover/3` would read as
   * `/cover/0`.
   */
  cover: { params: z.object({ id: objectId, index: nonNegativeInt.optional() }) },
  /**
   * The administrator's table: one page of every listing, searchable by the
   * seller as well as the book, because "who put this here" is the question
   * being asked of it.
   */
  adminList: {
    query: z.object({
      search: shortText.optional(),
      bookType: z.enum(['new', 'old']).optional(),
      stock: z.enum(['in', 'out', 'low']).optional(),
      deals: z.enum(['yes', 'no']).optional(),
      sort: z.enum(['newest', 'oldest', 'priceHigh', 'priceLow', 'stockLow', 'titleAZ']).default('newest'),
      page: positiveInt.default(1),
      pageSize: boundedInt(1, 100).default(25),
    }),
  },
  bySeller: { params: emailParam },
  updateStock: { params: objectIdParam, body: z.object({ stock: nonNegativeInt }) },
  updatePrice: { params: objectIdParam, body: z.object({ price: nonNegativeInt }) },
  /** A seller's discount: a percentage or an amount of taka off, or none. */
  updateDiscount: {
    params: objectIdParam,
    body: z.discriminatedUnion('type', [
      z.object({ type: z.literal('none') }),
      z.object({ type: z.enum(['percent', 'amount']), value: z.coerce.number().int().min(1).max(100000) }),
    ]),
  },
};

// ------------------------------------------------------- cart / wishlist
// The owner comes from the token, so only the book being acted on is a param.
export const cartSchemas = {
  mutate: { params: objectIdParam },
  /** Adding a book; a quantity sets how many copies, and is capped by the stock. */
  add: { params: objectIdParam, body: z.object({ quantity: boundedInt(1, 99).optional() }).default({}) },
  setQuantity: { params: objectIdParam, body: z.object({ quantity: boundedInt(1, 99) }) },
};

export const wishlistSchemas = cartSchemas;

// -------------------------------------------------------------- filter
/**
 * The catalogue, as the browse page asks for it.
 *
 * Every filter is a named parameter with its own type, so the caller never
 * supplies a document path that could become a query operator.
 */
export const filterSchemas = {
  catalogue: {
    query: z.object({
      search: shortText.optional(),
      bookType: z.enum(['new', 'old']).optional(),
      condition: shortText.optional(),
      // `?category=a&category=b` arrives as an array; one of them as a string.
      category: repeatable(shortText).optional(),
      minPrice: nonNegativeAmount.optional(),
      maxPrice: nonNegativeAmount.optional(),
      /** A floor, not a match: 4 means "four stars and up". */
      rating: boundedInt(1, 5).optional(),
      // A query string carries '1'; a typed client passes true. Both mean the
      // same thing, and the handler should not have to know which it got.
      inStock: z
        .union([z.literal('1'), z.literal('0'), z.boolean()])
        .transform((value) => value === true || value === '1')
        .optional(),
      // Only books a seller has discounted: the catalogue's Quick deals.
      deals: z
        .union([z.literal('1'), z.literal('0'), z.boolean()])
        .transform((value) => value === true || value === '1')
        .optional(),
      // 'relevant' puts the biggest deals first, then the newest.
      sort: z
        .enum(['relevant', 'newest', 'rated', 'priceLowHigh', 'priceHighLow', 'dealPercent', 'dealAmount'])
        .default('relevant'),
      page: positiveInt.default(1),
      // One seller's books, by their username: the seller's shop page.
      seller: shortText.optional(),
      // Bounded, so one request cannot ask for the whole database.
      pageSize: boundedInt(1, 50).default(20),
    }),
  },
  /** What the search box suggests while somebody types. */
  suggest: {
    query: z.object({
      q: z.string().trim().min(1, 'Type something to search for').max(100),
      books: boundedInt(0, 12).default(6),
      sellers: boundedInt(0, 12).default(3),
    }),
  },
  /**
   * Books by id, in the order given, for a visitor's Recently viewed - kept in
   * their browser - and the Top picks worked out from it.
   */
  byIds: {
    query: z.object({
      ids: z
        .string()
        .trim()
        .max(25 * 25)
        .transform((value) => value.split(',').filter(Boolean))
        .pipe(z.array(objectId).max(24)),
    }),
  },
  forYou: {
    query: z.object({
      // What the visitor has been looking at, from the same browser list.
      seen: z
        .string()
        .trim()
        .max(25 * 25)
        .transform((value) => value.split(',').filter(Boolean))
        .pipe(z.array(objectId).max(24))
        .optional(),
    }),
  },
  /** The homepage strip: the newest few, one per title. */
  featured: {
    query: z.object({ limit: boundedInt(1, 24).default(10) }),
  },
};

// --------------------------------------------------------------- order
/** One page of a table, with a search box over it. */
const pagedList = (maxPageSize = 100) => ({
  query: z.object({
    search: shortText.optional(),
    page: positiveInt.default(1),
    pageSize: boundedInt(1, maxPageSize).default(25),
  }),
});

/** A page of orders, with the status filter, date range and order an administrator asks for. */
const orderList = () => ({
  query: pagedList().query.extend({
    status: z.enum(['Order Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled']).optional(),
    from: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    sort: z.enum(['newest', 'oldest', 'totalHigh', 'totalLow']).default('newest'),
  }),
});

export const orderSchemas = {
  /**
   * Paged by order, not by line: an order of three books is three rows, and a
   * page that cut between them would show part of a purchase.
   */
  list: orderList(),
  create: {
    body: z.object({
      items: z
        .array(z.object({ bookId: objectId, quantity: positiveInt }))
        .min(1, 'At least one item is required')
        .max(100),
      // A code, not a discount: what it is worth is the server's to work out.
      promo: shortText.max(40).optional(),
      paymentMethod: shortText.optional(),
      contactName: shortText.optional(),
      contactPhone: shortText.optional(),
      deliveryDivision: shortText.optional(),
      deliveryDistrict: shortText.optional(),
      deliveryAddress: mediumText.optional(),
      // A few words to the seller - "please call before delivery". Short,
      // because it is a note, not a conversation; that is what chat is for.
      buyerNote: z.string().trim().max(300, 'Keep the note to 300 characters').optional(),
    }),
  },
  byOrderNumber: { params: z.object({ orderNumber }) },
  updateStatus: {
    params: z.object({ orderNumber }),
    body: z.object({ status: shortText.min(1, 'Status is required') }),
  },
  /** Calling an order off; the reason is optional and shown to the others in it. */
  cancel: {
    params: z.object({ orderNumber }),
    body: z.object({ reason: shortText.optional() }).default({}),
  },
  byId: { params: objectIdParam },
  /** What a promo code is worth on a basket, before the order is placed. */
  checkPromo: {
    body: z.object({
      code: shortText.min(1, 'Enter a code').max(40),
      booksTotal: nonNegativeAmount,
    }),
  },
  /** The administrator's payouts table: what is owed, or what has been paid. */
  payouts: {
    query: z.object({
      // 'upcoming': delivered, but still inside the buyer's return window.
      state: z.enum(['due', 'upcoming', 'paid']).default('due'),
      search: shortText.optional(),
      sort: z.enum(['oldest', 'newest', 'amountHigh', 'amountLow']).optional(),
      page: positiveInt.default(1),
      pageSize: boundedInt(1, 100).default(25),
    }),
  },
  /** Recording that a seller has been paid for their books in one order. */
  markPaid: {
    body: z.object({
      orderNumber,
      sellerEmail: email,
      // The bKash transaction ID, so a payment can be traced if it is queried.
      reference: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9]{6,20}$/, 'Enter the bKash transaction ID, e.g. 8N7A2B3C4D')
        .transform((value) => value.toUpperCase()),
    }),
  },
};

// -------------------------------------------------------------- return
export const returnSchemas = {
  list: {
    query: pagedList().query.extend({
      status: z.enum(['pending', 'approved', 'rejected']).optional(),
      sort: z.enum(['newest', 'oldest']).default('newest'),
    }),
  },
  image: { params: z.object({ id: objectId, index: nonNegativeInt.optional() }) },
  create: {
    body: z.object({
      // The order line, not the book: the same title can be bought twice.
      // Several lines at once to return a whole order, under one description.
      orderId: repeatable(objectId).pipe(z.array(objectId).min(1).max(50)),
      defectDescription: mediumText.min(1, 'A description is required'),
      refundBkash: bdMobile,
      // Present only when image hosting is configured; the browser uploads to
      // Cloudinary itself and reports back what it got. Otherwise the files
      // arrive as multipart and never touch the body.
      images: repeatable(urlText).optional(),
      imagePublicIds: repeatable(shortText).optional(),
    }),
  },
  updateStatus: {
    params: objectIdParam,
    body: z.object({ status: z.enum(['pending', 'approved', 'rejected']) }),
  },
};

// ------------------------------------------------------------ purchase
export const purchaseSchemas = {
  create: {
    body: z.object({ bookId: objectId, quantity: positiveInt.optional() }),
  },
};

// ---------------------------------------------------------------- chat
export const chatSchemas = {
  /** One attachment, served to the two people in the thread. */
  image: { params: objectIdParam },
  messages: {
    query: z.object({
      sender: email,
      receiver: email,
      page: positiveInt.optional().default(1),
      limit: boundedInt(1, 100).optional().default(20),
    }),
  },
  send: {
    body: z.object({ receiver: email, message: mediumText.optional().default('') }),
  },
  markRead: { body: z.object({ sender: email }) },
  remove: { body: z.object({ user1: email, user2: email }) },
};

// ---------------------------------------------------------------- user
export const userSchemas = {
  profileQuery: { query: z.object({ email: email.optional() }) },
  /**
   * A new listing, posted as multipart so every value arrives as a string.
   *
   * `sellerEmail` and `stock` are deliberately absent: the route sets both
   * from the token and the schema strips anything else, so a body cannot
   * publish a listing under someone else's name.
   */
  addBook: {
    body: z.object({
      title: shortText.min(1, 'Title is required'),
      author: shortText.min(1, 'Author is required'),
      publisher: shortText.min(1, 'Publisher is required'),
      country: shortText.min(1, 'Country is required'),
      language: shortText.min(1, 'Language is required'),
      isbn: shortText.min(1, 'ISBN is required'),
      // Optional, because the form does not mark it required and a seller
      // listing a second-hand book often does not know the page count.
      pages: nonNegativeInt.optional(),
      price: nonNegativeInt,
      desc: mediumText.min(1, 'A description is required'),
      category: repeatable(shortText)
        .pipe(z.array(shortText.min(1)).min(1, 'At least one category is required').max(20)),
      bookType: z.enum(['new', 'old']),
      condition: shortText.optional(),
      conditionDetails: mediumText.optional(),
      // Present only when image hosting is configured; the browser uploads to
      // Cloudinary itself and reports back what it got.
      images: repeatable(urlText).optional(),
      imagePublicIds: repeatable(shortText).optional(),
      // An optional discount from the start. Checked against the price by the
      // handler, which is the only place both are known.
      discountType: z.enum(['percent', 'amount', '']).optional(),
      discountValue: nonNegativeInt.optional(),
    }),
  },
  updateProfile: {
    body: z.object({
      username: username.optional(),
      password: password.optional(),
      /** Needed to change the password or the bKash number. */
      currentPassword: z.string().max(200).optional(),
      address: shortText.optional(),
      phone: shortText.optional(),
      // Empty clears it; anything else must be a real number.
      bkashMerchant: z.union([z.literal(''), bdMobile]).optional(),
      dateOfBirth: z.string().trim().max(40).optional(),
      // Empty clears it, as for every optional field. The form sends every
      // field, so refusing an empty value would stop anyone without a gender
      // set from saving their profile.
      gender: z.union([z.literal(''), z.enum(['male', 'female'])]).optional(),
      // Sent empty to remove a banner; a new one arrives as a file.
      buyerBanner: z.literal('').optional(),
      sellerBanner: z.literal('').optional(),
      profilePicture: z.string().optional(),
    }),
  },
  byId: { params: objectIdParam },
  /** Somebody's profile picture, by address rather than inline. */
  avatar: { params: emailParam },
  banner: { params: emailParam.extend({ role: z.enum(['buyer', 'seller']) }) },
  shop: { params: z.object({ username: z.string().trim().min(1).max(60) }) },
  /**
   * Deleting your own account asks for the password again.
   *
   * Not `password` from common.ts: an account made before the length rule
   * exists would otherwise be unable to close itself.
   */
  /**
   * The administrator's user table: one page of the accounts it may act on,
   * searchable by name or e-mail.
   */
  adminList: {
    query: z.object({
      search: shortText.optional(),
      // A seller here is somebody who has given a bKash number to be paid on.
      kind: z.enum(['sellers', 'buyers']).optional(),
      sort: z.enum(['newest', 'oldest', 'nameAZ', 'nameZA']).default('newest'),
      page: positiveInt.default(1),
      pageSize: boundedInt(1, 100).default(25),
    }),
  },
  deleteMe: {
    body: z.object({
      password: z.string().min(1, 'Your password is required to delete the account').max(200),
    }),
  },
  /** Inviting friends who are not members yet. */
  invite: {
    body: z.object({
      emails: z.array(email).min(1, 'Add an e-mail address').max(5, 'Up to five at a time'),
      note: z.string().trim().max(300).optional(),
    }),
  },
  /** What a person wants to hear about. Unknown categories are dropped on save. */
  notifications: {
    body: z.object({
      prefs: z.record(z.string().max(30), z.object({ inApp: z.boolean(), email: z.boolean() })),
    }),
  },
  /** Two-step sign-in on or off. The password is checked when turning it off. */
  twoFactor: {
    body: z.object({
      enabled: z.boolean(),
      password: z.string().max(200).optional(),
    }),
  },
};

/** Writing and removing a review. */
export const reviewSchemas = {
  byBook: { params: objectIdParam },
  write: {
    params: objectIdParam,
    body: z.object({
      rating: boundedInt(1, 5),
      // Optional on purpose: a star on its own is a perfectly good review, and
      // demanding prose is how a rating box gets left empty.
      title: shortText.optional(),
      body: mediumText.optional(),
    }),
  },
  remove: {
    params: objectIdParam,
    query: z.object({ email: email.optional() }),
  },
  /** The seller's answer to one review. */
  reply: {
    params: objectIdParam,
    body: z.object({ body: mediumText.min(1, 'A reply needs something in it') }),
  },
  /** Reporting one. The reason is optional: "this is abuse" is often enough. */
  flag: {
    params: objectIdParam,
    body: z.object({ reason: shortText.optional() }),
  },
  /** The administrator's queue of reported reviews. */
  flagged: {
    query: pagedList().query.extend({
      rating: boundedInt(1, 5).optional(),
      sort: z.enum(['mostReported', 'newest', 'oldest', 'ratingLow', 'ratingHigh']).default('mostReported'),
    }),
  },
  /** Every review, for the administrator: searched, filtered and ordered. */
  adminList: {
    query: pagedList().query.extend({
      rating: boundedInt(1, 5).optional(),
      replied: z.enum(['yes', 'no']).optional(),
      reported: z.enum(['yes', 'no']).optional(),
      sort: z.enum(['newest', 'oldest', 'ratingHigh', 'ratingLow', 'mostReported']).default('newest'),
    }),
  },
};

/** The Wanted board: books people are asking for. */
export const wantedSchemas = {
  list: {
    query: pagedList(50).query.extend({
      status: z.enum(['open', 'found']).default('open'),
      sort: z.enum(['popular', 'newest']).default('popular'),
      mine: z.enum(['1']).optional(),
    }),
  },
  create: {
    body: z.object({
      title: z.string().trim().min(2, 'Give the title').max(200),
      author: z.string().trim().max(120).optional(),
      isbn: z.string().trim().max(20).regex(/^[0-9Xx\- ]*$/, 'An ISBN is digits, perhaps with an X').optional(),
      details: z.string().trim().max(300).optional(),
    }),
  },
  byId: { params: objectIdParam },
};

/** The bell: a page of a person's notifications, and marking them read. */
// ---------------------------------------------------------------- admin messages
const audience = z.enum(['users', 'buyers', 'sellers', 'all']);

export const adminSchemas = {
  /** A notification or e-mail from the shop, to chosen people or a whole group. */
  message: {
    body: z
      .object({
        channel: z.enum(['notification', 'email', 'both']),
        audience,
        emails: z.array(email).max(500).optional(),
        title: z.string().trim().min(1, 'Give it a title').max(120),
        body: z.string().trim().min(1, 'Write the message').max(3000),
        // A page on this site, so a message cannot send people elsewhere.
        link: z
          .union([z.literal(''), z.string().trim().max(300).regex(/^\/(?!\/)/, 'A page on this site, starting with /')])
          .optional(),
      })
      .refine((value) => value.audience !== 'users' || (value.emails?.length ?? 0) > 0, {
        message: 'Choose at least one person',
        path: ['emails'],
      }),
  },
  audience: { query: z.object({ audience }) },
  analytics: { query: z.object({ range: z.enum(['7d', '30d', '90d', '12m', 'all']).default('30d') }) },
};

export const notificationSchemas = {
  list: {
    query: z.object({
      page: positiveInt.default(1),
      pageSize: boundedInt(1, 50).default(20),
      unreadOnly: z
        .union([z.literal('1'), z.literal('0'), z.boolean()])
        .transform((value) => value === true || value === '1')
        .optional(),
    }),
  },
  // No ids: all of them.
  markRead: { body: z.object({ ids: z.array(objectId).max(100).optional() }) },
};

/**
 * A report from somebody's browser.
 *
 * Every field bounded, because this is an unauthenticated endpoint and a
 * stack trace is the kind of thing that arrives megabytes long.
 */
export const clientErrorSchemas = {
  report: {
    body: z.object({
      context: shortText.min(1),
      message: shortText.min(1),
      stack: mediumText.optional(),
      url: urlText.optional(),
      userAgent: shortText.optional(),
    }),
  },
};

/** Reading the audit trail, newest first. */
export const auditSchemas = {
  list: {
    query: z.object({
      action: shortText.optional(),
      actorEmail: email.optional(),
      limit: boundedInt(1, 200).optional(),
      skip: nonNegativeInt.optional(),
    }),
  },
};

// ---------------------------------------------------------------------------
// Types
//
// Inferred from the schemas above rather than written out again, so a handler
// reading `req.body.quantity` is typed by the same declaration that validated
// it. A schema and its type cannot drift apart, because there is only one.
//
// `z.infer` is the *output* of a schema: after trimming, lower-casing,
// coercion and defaults. That is what a handler sees, which is the point.
// ---------------------------------------------------------------------------

export type DeleteMeBody = z.infer<typeof userSchemas.deleteMe.body>;
export type TwoFactorBody = z.infer<typeof userSchemas.twoFactor.body>;
export type WantedListQuery = z.infer<typeof wantedSchemas.list.query>;
export type CreateWantedBody = z.infer<typeof wantedSchemas.create.body>;
export type NotificationSettingsBody = z.infer<typeof userSchemas.notifications.body>;
export type InviteBody = z.infer<typeof userSchemas.invite.body>;
export type AuditListQuery = z.infer<typeof auditSchemas.list.query>;
export type WriteReviewBody = z.infer<typeof reviewSchemas.write.body>;

export type SignupBody = z.infer<typeof authSchemas.signup.body>;
export type SigninBody = z.infer<typeof authSchemas.signin.body>;
export type SendOtpBody = z.infer<typeof authSchemas.sendOtp.body>;
export type VerifyOtpBody = z.infer<typeof authSchemas.verifyOtp.body>;
export type ResetPasswordBody = z.infer<typeof authSchemas.resetPassword.body>;

export type IdParams = z.infer<typeof objectIdParam>;
export type EmailParams = z.infer<typeof emailParam>;
export type UpdateStockBody = z.infer<typeof bookSchemas.updateStock.body>;
export type UpdatePriceBody = z.infer<typeof bookSchemas.updatePrice.body>;
export type UpdateDiscountBody = z.infer<typeof bookSchemas.updateDiscount.body>;

export type AdminBookQuery = z.infer<typeof bookSchemas.adminList.query>;
export type AdminUserQuery = z.infer<typeof userSchemas.adminList.query>;
export type OrderListQuery = z.infer<typeof orderSchemas.list.query>;
export type ReturnListQuery = z.infer<typeof returnSchemas.list.query>;
export type ReviewListQuery = z.infer<typeof reviewSchemas.flagged.query>;
export type ClientErrorBody = z.infer<typeof clientErrorSchemas.report.body>;
export type FlaggedReviewQuery = z.infer<typeof reviewSchemas.flagged.query>;
export type AdminReviewQuery = z.infer<typeof reviewSchemas.adminList.query>;
export type NotificationListQuery = z.infer<typeof notificationSchemas.list.query>;
export type MarkNotificationsBody = z.infer<typeof notificationSchemas.markRead.body>;
export type CatalogueQuery = z.infer<typeof filterSchemas.catalogue.query>;
export type SuggestQuery = z.infer<typeof filterSchemas.suggest.query>;
export type FeaturedQuery = z.infer<typeof filterSchemas.featured.query>;
export type ByIdsQuery = z.infer<typeof filterSchemas.byIds.query>;
export type ForYouQuery = z.infer<typeof filterSchemas.forYou.query>;

export type CreateOrderBody = z.infer<typeof orderSchemas.create.body>;
export type OrderNumberParams = z.infer<typeof orderSchemas.byOrderNumber.params>;
export type UpdateOrderStatusBody = z.infer<typeof orderSchemas.updateStatus.body>;
export type CheckPromoBody = z.infer<typeof orderSchemas.checkPromo.body>;
export type CancelOrderBody = z.infer<typeof orderSchemas.cancel.body>;
export type PayoutsQuery = z.infer<typeof orderSchemas.payouts.query>;
export type MarkPaidBody = z.infer<typeof orderSchemas.markPaid.body>;

export type CreateReturnBody = z.infer<typeof returnSchemas.create.body>;
export type UpdateReturnStatusBody = z.infer<typeof returnSchemas.updateStatus.body>;

export type CreatePurchaseBody = z.infer<typeof purchaseSchemas.create.body>;

export type ChatMessagesQuery = z.infer<typeof chatSchemas.messages.query>;
export type SendChatBody = z.infer<typeof chatSchemas.send.body>;
export type MarkReadBody = z.infer<typeof chatSchemas.markRead.body>;
export type DeleteConversationBody = z.infer<typeof chatSchemas.remove.body>;

export type AddBookBody = z.infer<typeof userSchemas.addBook.body>;
export type ProfileQuery = z.infer<typeof userSchemas.profileQuery.query>;
export type UpdateProfileBody = z.infer<typeof userSchemas.updateProfile.body>;
export type AdminMessageBody = z.infer<typeof adminSchemas.message.body>;
export type AudienceQuery = z.infer<typeof adminSchemas.audience.query>;
export type AnalyticsQuery = z.infer<typeof adminSchemas.analytics.query>;
