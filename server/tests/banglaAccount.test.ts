import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createUser, createUserWithToken, PASSWORD } from './helpers/factories.js';
import { requestedLanguage } from '../utils/language.js';
import User from '../models/user.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('requestedLanguage', () => {
  const ask = (header: string) => requestedLanguage({ headers: { 'accept-language': header } });

  it('reads the language a browser prefers', () => {
    expect(ask('bn-BD,bn;q=0.9,en;q=0.8')).toBe('bn');
    expect(ask('en-US,en;q=0.9,bn;q=0.5')).toBe('en');
  });

  it('is null for a language the site does not speak', () => {
    expect(ask('fr')).toBeNull();
    expect(requestedLanguage({ headers: {} })).toBeNull();
  });
});

describe('answers in Bangla when asked', () => {
  it('refuses a wrong password in Bangla', async () => {
    await createUser({ email: 'rahim@test.com' });

    const res = await request
      .post('/auth/signin')
      .set('Accept-Language', 'bn')
      .send({ email: 'rahim@test.com', password: 'Not-The-Right-One-1!' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('ই-মেইল বা পাসওয়ার্ড ভুল');
  });

  it('gives validation errors in Bangla, in the same shape', async () => {
    const res = await request
      .post('/auth/signin')
      .set('Accept-Language', 'bn')
      .send({ email: 'not-an-address', password: PASSWORD });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('দেওয়া তথ্যে ভুল আছে');
    expect(res.body.errors).toContainEqual({ path: 'body.email', message: 'সঠিক ই-মেইল ঠিকানা দিন' });
  });

  it('keeps English for a request that names no language', async () => {
    const res = await request.post('/auth/signin').send({ email: 'not-an-address', password: PASSWORD });

    expect(res.body.message).toBe('Validation failed');
    expect(res.body.errors).toContainEqual({ path: 'body.email', message: 'Must be a valid email address' });
  });
});

describe('the language kept on the account', () => {
  it('PUT /user/me/language stores it', async () => {
    const { user, auth } = await createUserWithToken({ email: 'karim@test.com' });

    const res = await request.put('/user/me/language').set('Authorization', auth).send({ language: 'bn' });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ language: 'bn' });
    expect((await User.findById(user._id).lean())?.language).toBe('bn');
  });

  it('a sign-in in Bangla stores bn on the account', async () => {
    const user = await createUser({ email: 'salma@test.com' });

    const res = await request
      .post('/auth/signin')
      .set('Accept-Language', 'bn-BD,bn;q=0.9')
      .send({ email: 'salma@test.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect((await User.findById(user._id).lean())?.language).toBe('bn');
  });
});
