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
const FILTERABLE_FIELDS = [
  'title',
  'author',
  'publisher',
  'country',
  'language',
  'isbn',
  'category',
  'bookType',
  'condition',
  'sellerEmail',
];

export const filterSchemas = {
  filter: {
    body: z.object({
      // An enum rather than a free string: the field name reaches a query key,
      // so it must never be attacker-chosen.
      filter_key: z.enum(FILTERABLE_FIELDS),
      filter_input: shortText,
    }),
  },
  search: {
    body: z.object({ search_input: shortText.default('') }),
  },
};

// --------------------------------------------------------------- order
export const orderSchemas = {
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
  create: {
    body: z.object({
      bookId: objectId,
      defectDescription: mediumText.min(1, 'A description is required'),
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
      pages: nonNegativeInt,
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
  deleteMe: {
    body: z.object({
      password: z.string().min(1, 'Your password is required to delete the account').max(200),
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

export { FILTERABLE_FIELDS };

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

export type SignupBody = z.infer<typeof authSchemas.signup.body>;
export type SigninBody = z.infer<typeof authSchemas.signin.body>;
export type SendOtpBody = z.infer<typeof authSchemas.sendOtp.body>;
export type VerifyOtpBody = z.infer<typeof authSchemas.verifyOtp.body>;
export type ResetPasswordBody = z.infer<typeof authSchemas.resetPassword.body>;

export type IdParams = z.infer<typeof objectIdParam>;
export type EmailParams = z.infer<typeof emailParam>;
export type UpdateStockBody = z.infer<typeof bookSchemas.updateStock.body>;
export type UpdatePriceBody = z.infer<typeof bookSchemas.updatePrice.body>;

export type FilterBody = z.infer<typeof filterSchemas.filter.body>;
export type SearchBody = z.infer<typeof filterSchemas.search.body>;

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
