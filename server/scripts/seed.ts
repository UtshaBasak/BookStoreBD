/**
 * Populates a database with enough data to use the app immediately: an
 * administrator, a seller, a buyer, and a small catalogue.
 *
 * Idempotent — existing accounts and listings are left alone, so it is safe to
 * re-run. Pass --reset to empty the collections it manages first.
 *
 *   npm run seed
 *   npm run seed -- --reset
 */
import mongoose from 'mongoose';
import bcryptjs from 'bcryptjs';

import type { BookType, UserRole } from '@shared/api.js';

import { assertRequiredEnv, mongoUri } from '../config/env.js';
import User from '../models/user.model.js';
import { errorMessage } from '../utils/error.js';
import AddBook from '../models/AddBook.model.js';

const DEMO_PASSWORD = process.env.SEED_PASSWORD ?? '***REMOVED***';

/** Annotated rather than inferred, so `role` stays the union the schema uses. */
interface SeedAccount {
  username: string;
  email: string;
  role: UserRole;
  address?: string;
  phone?: string;
  /** A seller cannot list without one. */
  bkashMerchant?: string;
}

interface SeedBook {
  title: string;
  author: string;
  publisher: string;
  isbn: string;
  pages: number;
  price: number;
  category: string[];
  bookType: BookType;
  stock: number;
  desc: string;
  condition?: string;
  conditionDetails?: string;
}

const ACCOUNTS: SeedAccount[] = [
  { username: 'admin', email: 'admin@bookstorebd.local', role: 'admin' },
  {
    username: 'seller',
    email: 'seller@bookstorebd.local',
    role: 'user',
    address: '14 New Market, Dhaka',
    phone: '01710000001',
    bkashMerchant: '01710000001',
  },
  {
    username: 'buyer',
    email: 'buyer@bookstorebd.local',
    role: 'user',
    address: '9 Banani, Dhaka',
    phone: '01710000002',
  },
];

const SELLER_EMAIL = 'seller@bookstorebd.local';

const BOOKS: SeedBook[] = [
  {
    title: 'The C Programming Language',
    author: 'Brian W. Kernighan, Dennis M. Ritchie',
    publisher: 'Prentice Hall',
    isbn: '9780131103627',
    pages: 272,
    price: 850,
    category: ['programming'],
    bookType: 'new',
    stock: 7,
    desc: 'The original reference for C, still the shortest route to understanding the language.',
  },
  {
    title: 'Clean Code',
    author: 'Robert C. Martin',
    publisher: 'Prentice Hall',
    isbn: '9780132350884',
    pages: 464,
    price: 1250,
    category: ['programming', 'craft'],
    bookType: 'new',
    stock: 4,
    desc: 'A handbook of agile software craftsmanship.',
  },
  {
    title: 'Designing Data-Intensive Applications',
    author: 'Martin Kleppmann',
    publisher: "O'Reilly Media",
    isbn: '9781449373320',
    pages: 616,
    price: 2100,
    category: ['databases', 'architecture'],
    bookType: 'new',
    stock: 3,
    desc: 'How modern data systems actually behave under load and failure.',
  },
  {
    title: 'A Brief History of Time',
    author: 'Stephen Hawking',
    publisher: 'Bantam',
    isbn: '9780553380163',
    pages: 212,
    price: 600,
    category: ['science'],
    bookType: 'old',
    condition: 'Good',
    conditionDetails: 'Slight shelf wear, pages clean.',
    stock: 2,
    desc: 'Cosmology for the general reader.',
  },
  {
    title: 'Pather Panchali',
    author: 'Bibhutibhushan Bandyopadhyay',
    publisher: 'Mitra & Ghosh',
    isbn: '9788172930295',
    pages: 352,
    price: 450,
    category: ['fiction', 'bangla'],
    bookType: 'old',
    condition: 'Fair',
    conditionDetails: 'Spine creased, previous owner name inside cover.',
    stock: 1,
    desc: 'A classic of Bengali literature.',
  },
  {
    title: 'Out of stock example',
    author: 'Nobody',
    publisher: 'Nowhere',
    isbn: '0000000000000',
    pages: 100,
    price: 300,
    category: ['fiction'],
    bookType: 'new',
    stock: 0,
    desc: 'Present so the out-of-stock path is visible without editing data by hand.',
  },
];

// Deliberately console rather than the pino logger: this is a CLI whose
// output is read by a person, and structured JSON would be worse here.
const log = (...args: unknown[]): void => console.log('[seed]', ...args);

const seedAccounts = async () => {
  const hashed = bcryptjs.hashSync(DEMO_PASSWORD, 10);
  let created = 0;

  for (const account of ACCOUNTS) {
    const existing = await User.findOne({ email: account.email });
    if (existing) continue;

    await User.create({ ...account, password: hashed });
    created += 1;
  }

  log(`accounts: ${created} created, ${ACCOUNTS.length - created} already present`);
};

const seedBooks = async () => {
  let created = 0;

  for (const book of BOOKS) {
    const existing = await AddBook.findOne({ isbn: book.isbn });
    if (existing) continue;

    await AddBook.create({
      ...book,
      country: 'Bangladesh',
      language: 'English',
      sellerEmail: SELLER_EMAIL,
      // No cover, so the client falls back to its own placeholder. This was a
      // data-URI described as a transparent pixel; it decodes to half-opaque
      // green, and every seeded listing rendered as a bright green block.
      images: [],
    });
    created += 1;
  }

  log(`books: ${created} created, ${BOOKS.length - created} already present`);
};

const reset = async () => {
  const emails = ACCOUNTS.map((a) => a.email);
  const isbns = BOOKS.map((b) => b.isbn);

  const { deletedCount: users } = await User.deleteMany({ email: { $in: emails } });
  const { deletedCount: books } = await AddBook.deleteMany({ isbn: { $in: isbns } });

  log(`reset: removed ${users} seeded account(s) and ${books} seeded listing(s)`);
};

export const runSeed = async ({ withReset = false } = {}) => {
  if (withReset) await reset();
  await seedAccounts();
  await seedBooks();

  log('');
  // Printing the password is the entire point of this script: it is a known
  // demo value for local accounts, and you cannot sign in without being told
  // it. A scanner will flag it as clear-text logging regardless.
  log('Sign in with any of these:');
  for (const account of ACCOUNTS) {
    log(`  ${account.role.padEnd(5)}  ${account.email}  /  ${DEMO_PASSWORD}`);
  }
};

const main = async () => {
  assertRequiredEnv();
  const uri = mongoUri();
  await mongoose.connect(uri);
  log(`connected to ${uri.replace(/\/\/[^@]*@/, '//***@')}`);

  await runSeed({ withReset: process.argv.includes('--reset') });

  await mongoose.disconnect();
  log('done');
};

// Only self-execute when run directly, so tests can import runSeed.
// Either extension: `tsx scripts/seed.ts` in development, or
// `node dist/scripts/seed.js` from a build.
const invokedDirectly = /scripts\/seed\.(ts|js)$/.test(
  process.argv[1]?.replace(/\\/g, '/') ?? ''
);
if (invokedDirectly) {
  main().catch(async (error: unknown) => {
    console.error('[seed] failed:', errorMessage(error));
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
}
