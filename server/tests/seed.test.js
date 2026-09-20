import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';

let runSeed;
let User;
let AddBook;

beforeAll(async () => {
  await createTestContext();
  ({ runSeed } = await import('../scripts/seed.js'));
  User = (await import('../models/user.model.js')).default;
  AddBook = (await import('../models/AddBook.model.js')).default;
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('seed', () => {
  it('creates the demo accounts and catalogue', async () => {
    await runSeed();

    expect(await User.countDocuments({})).toBe(3);
    expect(await AddBook.countDocuments({})).toBe(6);
  });

  it('creates exactly one administrator', async () => {
    await runSeed();

    const admins = await User.find({ role: 'admin' });
    expect(admins).toHaveLength(1);
    expect(admins[0].email).toBe('admin@bookstorebd.local');
  });

  it('hashes the demo password rather than storing it in the clear', async () => {
    await runSeed();

    const admin = await User.findOne({ role: 'admin' });
    expect(admin.password).not.toBe('***REMOVED***');
    expect(admin.password).toMatch(/^\$2[aby]\$/);
  });

  it('is idempotent', async () => {
    await runSeed();
    await runSeed();
    await runSeed();

    expect(await User.countDocuments({})).toBe(3);
    expect(await AddBook.countDocuments({})).toBe(6);
  });

  it('attributes every listing to the seller account', async () => {
    await runSeed();

    const books = await AddBook.find({});
    for (const book of books) {
      expect(book.sellerEmail).toBe('seller@bookstorebd.local');
    }
  });

  it('includes an out-of-stock listing so that path is reachable', async () => {
    await runSeed();

    expect(await AddBook.countDocuments({ stock: 0 })).toBe(1);
  });

  it('includes both new and second-hand listings', async () => {
    await runSeed();

    expect(await AddBook.countDocuments({ bookType: 'new' })).toBeGreaterThan(0);
    expect(await AddBook.countDocuments({ bookType: 'old' })).toBeGreaterThan(0);
  });

  it('produces listings that pass schema validation', async () => {
    await runSeed();

    const books = await AddBook.find({});
    for (const book of books) {
      await expect(book.validate()).resolves.toBeUndefined();
    }
  });

  it('--reset removes the seeded rows before recreating them', async () => {
    await runSeed();
    const before = await User.findOne({ role: 'admin' });

    await runSeed({ withReset: true });
    const after = await User.findOne({ role: 'admin' });

    expect(await User.countDocuments({})).toBe(3);
    expect(String(after._id)).not.toBe(String(before._id));
  });

  it('leaves accounts it did not create alone', async () => {
    await User.create({
      username: 'real_user',
      email: 'real@example.com',
      password: 'hashed',
    });

    await runSeed({ withReset: true });

    expect(await User.findOne({ email: 'real@example.com' })).not.toBeNull();
  });
});
