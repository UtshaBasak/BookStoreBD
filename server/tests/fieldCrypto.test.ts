/**
 * Encryption at rest: phone numbers, addresses and bKash numbers are stored
 * encrypted, and read back as they were written, whichever way they are read.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  process.env.DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
});

import { createTestContext, clearDatabase, closeTestContext, type PrefixedRequest } from './helpers/testApp.js';
import { createUserWithToken } from './helpers/factories.js';
import User from '../models/user.model.js';
import { decryptValue, encryptValue } from '../utils/fieldCrypto.js';

let request: PrefixedRequest;
beforeAll(async () => {
  ({ request } = await createTestContext());
});
afterAll(closeTestContext);
beforeEach(clearDatabase);

const raw = (email: string) => User.collection.findOne({ email }) as Promise<Record<string, unknown> | null>;

describe('encryption at rest', () => {
  it('stores the fields encrypted, with a fresh nonce each time, and reads them back', () => {
    const once = encryptValue('01710000001');
    const twice = encryptValue('01710000001');
    expect(once).toMatch(/^enc:v1:/);
    expect(once).not.toBe(twice);
    expect(decryptValue(once)).toBe('01710000001');
    // Values from before the key was set are read as they are.
    expect(decryptValue('01710000001')).toBe('01710000001');
  });

  it('refuses a value that has been tampered with', () => {
    const value = String(encryptValue('01710000001'));
    const tampered = `${value.slice(0, -4)}AAAA`;
    expect(decryptValue(tampered)).toBe('');
  });

  it('keeps a profile’s phone, address and payout number encrypted in the database', async () => {
    const seller = await createUserWithToken({ email: 'seller@test.com', phone: '01710000002', address: '9 Banani, Dhaka' });
    const stored = await raw('seller@test.com');
    expect(String(stored?.phone)).toMatch(/^enc:v1:/);
    expect(String(stored?.address)).toMatch(/^enc:v1:/);
    expect(String(stored?.bkashMerchant)).toMatch(/^enc:v1:/);
    expect(JSON.stringify(stored)).not.toContain('Banani');

    // Every way the code reads it gets the plain value.
    expect((await User.findOne({ email: 'seller@test.com' }))?.phone).toBe('01710000002');
    expect((await User.findOne({ email: 'seller@test.com' }).lean())?.address).toBe('9 Banani, Dhaka');
    const profile = await request.get('/user/profile').set('Authorization', seller.auth);
    expect(profile.body).toMatchObject({ phone: '01710000002', address: '9 Banani, Dhaka' });

    // And an update through the API is encrypted too.
    await request.put('/user/profile').set('Authorization', seller.auth).field('phone', '01710000099');
    expect(String((await raw('seller@test.com'))?.phone)).toMatch(/^enc:v1:/);
    expect((await User.findOne({ email: 'seller@test.com' }).lean())?.phone).toBe('01710000099');
  });

  it('still answers whether a payout number is set', async () => {
    await createUserWithToken({ email: 'seller@test.com' });
    await createUserWithToken({ email: 'buyer@test.com', bkashMerchant: null });
    const sellers = await User.find({ bkashMerchant: { $nin: [null, ''] } }, { email: 1 }).lean();
    expect(sellers.map((user) => user.email)).toEqual(['seller@test.com']);
  });
});
