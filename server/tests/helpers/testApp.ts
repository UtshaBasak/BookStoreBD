import { randomUUID } from 'crypto';

import mongoose from 'mongoose';
import supertest, { type Response, type Test } from 'supertest';
import { inject } from 'vitest';

const METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head'] as const;

export type HttpMethod = (typeof METHODS)[number];

type Method = HttpMethod;

/** The same verbs supertest offers, with the API namespace already applied. */
export type PrefixedRequest = Record<Method, (path: string) => Test>;

export interface TestContext {
  request: PrefixedRequest;
  agent: ReturnType<typeof supertest>;
  mongoose: typeof mongoose;
}

/**
 * Boots the API against the shared in-memory MongoDB.
 *
 * Each test file connects to its own database on that instance, so files stay
 * independent and can run in parallel without clearing each other's data.
 */
export const createTestContext = async (): Promise<TestContext> => {
  process.env.JWT_SECRET ??= 'test-secret-long-enough-for-the-32-char-minimum';
  process.env.ADMIN_EMAILS ??= 'admin@test.com';
  process.env.NODE_ENV = 'test';

  const uri = inject('mongoUri');
  await mongoose.connect(uri, { dbName: `test_${randomUUID().slice(0, 8)}` });

  // Imported after connecting so the models bind to this connection.
  const { createApp } = await import('../../app.js');
  const { API_PREFIX, ROOT_PATHS } = await import('../../config/apiPaths.js');

  const agent = supertest(createApp());

  /**
   * Prefixes API paths so tests can keep saying `/cart` rather than
   * `/api/cart`. The namespace is a routing decision, not something every
   * assertion should have to restate.
   */
  const withPrefix = (path: string): string => {
    const [pathname] = path.split('?');
    if (ROOT_PATHS.includes(pathname) || path.startsWith(API_PREFIX)) return path;
    return `${API_PREFIX}${path}`;
  };

  const request = Object.fromEntries(
    METHODS.map((method) => [method, (path: string) => agent[method](withPrefix(path))])
  ) as PrefixedRequest;

  return { request, agent, mongoose };
};

/**
 * The Set-Cookie header, always as a list.
 *
 * It is the one header Node keeps as an array rather than folding into a
 * single string, which the response declarations do not capture.
 */
export const setCookies = (res: Response): string[] => {
  const raw: unknown = res.headers['set-cookie'];
  if (!raw) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
};

/** Empties every collection between tests. */
export const clearDatabase = async (): Promise<void> => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

export const closeTestContext = async (): Promise<void> => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};
