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
};

export { FILTERABLE_FIELDS };
