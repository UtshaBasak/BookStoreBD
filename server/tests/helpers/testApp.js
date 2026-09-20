import { randomUUID } from 'crypto';

import mongoose from 'mongoose';
import supertest from 'supertest';
import { inject } from 'vitest';

/**
 * Boots the API against the shared in-memory MongoDB.
 *
 * Each test file connects to its own database on that instance, so files stay
 * independent and can run in parallel without clearing each other's data.
 */
export const createTestContext = async () => {
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
  const withPrefix = (path) => {
    if (typeof path !== 'string') return path;
    const [pathname] = path.split('?');
    if (ROOT_PATHS.includes(pathname) || path.startsWith(API_PREFIX)) return path;
    return `${API_PREFIX}${path}`;
  };

  const request = ['get', 'post', 'put', 'patch', 'delete', 'head'].reduce(
    (acc, method) => {
      acc[method] = (path, ...rest) => agent[method](withPrefix(path), ...rest);
      return acc;
    },
    {}
  );

  return { request, agent, mongoose };
};

/** Empties every collection between tests. */
export const clearDatabase = async () => {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
};

export const closeTestContext = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};
