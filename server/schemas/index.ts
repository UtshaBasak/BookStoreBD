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
    }),
  },
  sendOtp: {
    body: z.object({
      email,
      username: username.optional(),
      purpose: z.enum(['register', 'reset']).optional(),
    }),
  },
  verifyOtp: {
    body: z.object({ email, code: otpCode }),
  },
  resetPassword: {
    body: z.object({ email, otp: otpCode, newPassword: password }),
  },
};

// ---------------------------------------------------------------- book
export const bookSchemas = {
  byId: { params: objectIdParam },
  /**
   * The cover endpoint needs its index declared here, not only in the path.
   * `validate` replaces `req.params` with what the schema parsed, so a key the
   * schema does not mention is stripped - which silently turned every
   * `/cover/3` into `/cover/0`.
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
      page: positiveInt.default(1),
      pageSize: boundedInt(1, 100).default(25),
    }),
  },
  bySeller: { params: emailParam },
  updateStock: { params: objectIdParam, body: z.object({ stock: nonNegativeInt }) },
  updatePrice: { params: objectIdParam, body: z.object({ price: nonNegativeInt }) },
};

// ------------------------------------------------------- cart / wishlist
// The owner comes from the token, so only the book being acted on is a param.
export const cartSchemas = {
  mutate: { params: objectIdParam },
};

export const wishlistSchemas = cartSchemas;

// -------------------------------------------------------------- filter
/**
 * The catalogue, as the browse page asks for it.
 *
 * Every filter is a named parameter with its own type, rather than the
 * `filter_key` + `filter_input` pair this used to take. That pair put a
 * document path in the caller's hands, which needed a whitelist to stop it
 * becoming a query operator; naming the fields removes the question.
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
      sort: z.enum(['newest', 'rated', 'priceLowHigh', 'priceHighLow']).default('newest'),
      page: positiveInt.default(1),
      // Bounded, so one request cannot ask for the whole database.
      pageSize: boundedInt(1, 48).default(12),
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

export const orderSchemas = {
  /**
   * Paged by order, not by line: an order of three books is three rows, and a
   * page that cut between them would show part of a purchase.
   */
  list: pagedList(),
  create: {
    body: z.object({
      items: z
        .array(z.object({ bookId: objectId, quantity: positiveInt }))
        .min(1, 'At least one item is required')
        .max(100),
      shippingCharge: nonNegativeInt.optional(),
      discount: nonNegativeInt.optional(),
      promo: shortText.optional(),
      promoApplied: z.boolean().optional(),
      paymentMethod: shortText.optional(),
      contactName: shortText.optional(),
      contactPhone: shortText.optional(),
      deliveryDivision: shortText.optional(),
      deliveryDistrict: shortText.optional(),
      deliveryAddress: mediumText.optional(),
    }),
  },
  byOrderNumber: { params: z.object({ orderNumber }) },
  updateStatus: {
    params: z.object({ orderNumber }),
    body: z.object({ status: shortText.min(1, 'Status is required') }),
  },
  byId: { params: objectIdParam },
};

// -------------------------------------------------------------- return
export const returnSchemas = {
  list: pagedList(),
  image: { params: z.object({ id: objectId, index: nonNegativeInt.optional() }) },
  create: {
    body: z.object({
      bookId: objectId,
      defectDescription: mediumText.min(1, 'A description is required'),
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
    }),
  },
  updateProfile: {
    body: z.object({
      username: username.optional(),
      password: password.optional(),
      address: shortText.optional(),
      phone: shortText.optional(),
      dateOfBirth: z.string().trim().max(40).optional(),
      gender: z.enum(['male', 'female']).optional(),
      profilePicture: z.string().optional(),
    }),
  },
  byId: { params: objectIdParam },
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
      page: positiveInt.default(1),
      pageSize: boundedInt(1, 100).default(25),
    }),
  },
  deleteMe: {
    body: z.object({
      password: z.string().min(1, 'Your password is required to delete the account').max(200),
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
  flagged: pagedList(),
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

export type AdminBookQuery = z.infer<typeof bookSchemas.adminList.query>;
export type AdminUserQuery = z.infer<typeof userSchemas.adminList.query>;
export type OrderListQuery = z.infer<typeof orderSchemas.list.query>;
export type ReturnListQuery = z.infer<typeof returnSchemas.list.query>;
export type ReviewListQuery = z.infer<typeof reviewSchemas.flagged.query>;
export type CatalogueQuery = z.infer<typeof filterSchemas.catalogue.query>;
export type FeaturedQuery = z.infer<typeof filterSchemas.featured.query>;

export type CreateOrderBody = z.infer<typeof orderSchemas.create.body>;
export type OrderNumberParams = z.infer<typeof orderSchemas.byOrderNumber.params>;
export type UpdateOrderStatusBody = z.infer<typeof orderSchemas.updateStatus.body>;

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
