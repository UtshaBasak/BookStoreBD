import { randomUUID } from 'crypto';

import bcryptjs from 'bcryptjs';

import type { BookAttributes, BookDocument } from '../../models/AddBook.model.js';
import type { UserAttributes, UserDocument } from '../../models/user.model.js';
import type { PrefixedRequest } from './testApp.js';

export const PASSWORD = 'Tangerine-Lantern-42!';

/**
 * A real 1x1 PNG.
 *
 * Uploads are checked against the file's own first bytes, so a buffer of
 * arbitrary text named `cover.png` is refused - which is the point of the
 * check, and why this constant exists.
 */
export const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** Anything a test wants to pin down about the user it is creating. */
export type UserOverrides = Partial<UserAttributes> & { password?: string };

/**
 * The delivery details checkout requires, for a test that is about something
 * else. Spread first, so a test can still override any of them.
 */
export const CHECKOUT = {
  contactName: 'Test Buyer',
  contactPhone: '01711112222',
  deliveryDivision: 'Dhaka',
  deliveryDistrict: 'Dhaka',
  deliveryAddress: 'House 1, Road 2, Dhanmondi',
} as const;

/** Marks the seller accounts `createBook` makes on its own, so a test can still create that address itself. */
const STAND_IN = 'standin_';

/** Creates a user directly, bypassing the OTP flow that sign-up requires. */
export const createUser = async (overrides: UserOverrides = {}): Promise<UserDocument> => {
  const User = (await import('../../models/user.model.js')).default;
  const suffix = randomUUID().slice(0, 8);
  // A test creating a seller whose book it made first takes over from the stand-in.
  if (overrides.email) {
    await User.deleteOne({ email: overrides.email.toLowerCase(), username: { $regex: `^${STAND_IN}` } });
  }

  return User.create({
    username: overrides.username ?? `user_${suffix}`,
    email: overrides.email ?? `user_${suffix}@test.com`,
    password: bcryptjs.hashSync(overrides.password ?? PASSWORD, 10),
    role: overrides.role ?? 'user',
    ...(overrides.address ? { address: overrides.address } : {}),
    ...(overrides.phone ? { phone: overrides.phone } : {}),
    // A seller needs one before listing; pass null for an account without.
    ...(overrides.bkashMerchant === null
      ? {}
      : { bkashMerchant: overrides.bkashMerchant ?? '01710000009' }),
    ...(overrides.gender ? { gender: overrides.gender } : {}),
    ...(overrides.profilePicture ? { profilePicture: overrides.profilePicture } : {}),
  });
};

export const createBook = async (
  overrides: Partial<BookAttributes> = {},
  /** `seller: false` lists it with no account behind it, as an orphaned listing would be. */
  { seller = true }: { seller?: boolean } = {}
): Promise<BookDocument> => {
  const AddBook = (await import('../../models/AddBook.model.js')).default;
  const User = (await import('../../models/user.model.js')).default;

  /*
   * Checkout only sells books whose seller has an account and a bKash number
   * to be paid to. A test that lists a book without making its seller gets a
   * stand-in seller, which `createUser` replaces if the test makes one later.
   */
  const sellerEmail = String(overrides.sellerEmail ?? 'seller@test.com').toLowerCase();
  if (seller && !(await User.exists({ email: sellerEmail }))) {
    await User.create({
      username: `${STAND_IN}${randomUUID().slice(0, 8)}`,
      email: sellerEmail,
      password: bcryptjs.hashSync(PASSWORD, 4),
      role: 'user',
      bkashMerchant: '01710000009',
    }).catch(() => undefined);
  }

  return AddBook.create({
    title: 'The C++ Programming Language',
    author: 'Bjarne Stroustrup',
    publisher: 'Addison-Wesley',
    country: 'Bangladesh',
    language: 'English',
    isbn: '9780321563842',
    pages: 1368,
    price: 1200,
    desc: 'A reference for the language.',
    category: ['programming'],
    bookType: 'new',
    stock: 5,
    sellerEmail: 'seller@test.com',
    images: ['data:image/png;base64,AAA', 'data:image/png;base64,BBB'],
    ...overrides,
  });
};

/** Signs in and returns the access token. */
export const signIn = async (
  request: PrefixedRequest,
  email: string,
  password: string = PASSWORD
): Promise<string> => {
  const res = await request.post('/auth/signin').send({ email, password });
  return res.body.token;
};

export interface SignedInUser {
  user: UserDocument;
  token: string;
  auth: string;
}

/** Creates a user and returns them together with a fresh token. */
export const createSignedInUser = async (
  request: PrefixedRequest,
  overrides: UserOverrides = {}
): Promise<SignedInUser> => {
  const user = await createUser(overrides);
  const token = await signIn(request, user.email, overrides.password);
  return { user, token, auth: `Bearer ${token}` };
};

/**
 * A user with a token minted directly rather than by signing in. The sign-in
 * route is rate limited per address, and a file that signs a dozen people in
 * runs into its own limit; the token is the same one sign-in would issue.
 */
export const createUserWithToken = async (overrides: UserOverrides = {}): Promise<SignedInUser> => {
  const { signAccessToken } = await import('../../utils/jwt.js');
  const user = await createUser(overrides);
  const token = signAccessToken({ _id: user._id, email: user.email, role: user.role });
  return { user, token, auth: `Bearer ${token}` };
};
