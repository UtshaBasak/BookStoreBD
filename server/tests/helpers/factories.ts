import { randomUUID } from 'crypto';

import bcryptjs from 'bcryptjs';

import type { BookAttributes, BookDocument } from '../../models/AddBook.model.js';
import type { UserAttributes, UserDocument } from '../../models/user.model.js';
import type { PrefixedRequest } from './testApp.js';

export const PASSWORD = 'correct-horse-battery';

/**
 * A real 1x1 PNG.
 *
 * Uploads are checked against the file's own first bytes now, so a buffer of
 * arbitrary text named `cover.png` is refused - which is the point of the
 * check, and why this constant exists.
 */
export const PNG_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64'
);

/** Anything a test wants to pin down about the user it is creating. */
export type UserOverrides = Partial<UserAttributes> & { password?: string };

/** Creates a user directly, bypassing the OTP flow that sign-up requires. */
export const createUser = async (overrides: UserOverrides = {}): Promise<UserDocument> => {
  const User = (await import('../../models/user.model.js')).default;
  const suffix = randomUUID().slice(0, 8);

  return User.create({
    username: overrides.username ?? `user_${suffix}`,
    email: overrides.email ?? `user_${suffix}@test.com`,
    password: bcryptjs.hashSync(overrides.password ?? PASSWORD, 10),
    role: overrides.role ?? 'user',
    ...(overrides.address ? { address: overrides.address } : {}),
    ...(overrides.phone ? { phone: overrides.phone } : {}),
    ...(overrides.gender ? { gender: overrides.gender } : {}),
    ...(overrides.profilePicture ? { profilePicture: overrides.profilePicture } : {}),
  });
};

export const createBook = async (
  overrides: Partial<BookAttributes> = {}
): Promise<BookDocument> => {
  const AddBook = (await import('../../models/AddBook.model.js')).default;

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
