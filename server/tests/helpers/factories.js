import { randomUUID } from 'crypto';

import bcryptjs from 'bcryptjs';

export const PASSWORD = 'correct-horse-battery';

/** Creates a user directly, bypassing the OTP flow that sign-up requires. */
export const createUser = async (overrides = {}) => {
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
  });
};

export const createBook = async (overrides = {}) => {
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
export const signIn = async (request, email, password = PASSWORD) => {
  const res = await request.post('/auth/signin').send({ email, password });
  return res.body.token;
};

/** Creates a user and returns them together with a fresh token. */
export const createSignedInUser = async (request, overrides = {}) => {
  const user = await createUser(overrides);
  const token = await signIn(request, user.email, overrides.password);
  return { user, token, auth: `Bearer ${token}` };
};
