import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Provides the MongoDB the suite runs against, through Vitest's provide/inject
 * channel.
 *
 * `MONGO_TEST_URI` takes precedence when set, which is how the suite runs
 * inside the Docker stack: mongodb-memory-server has no mongod build for
 * Alpine's musl libc, but the stack already has a real MongoDB service.
 *
 * Otherwise one in-memory instance is started for the whole run. One shared
 * instance rather than one per file: starting mongod is by far the slowest
 * part of the suite, and its default 10s launch timeout has been seen to
 * expire on Windows.
 */
export default async function setup({ provide }) {
  const external = process.env.MONGO_TEST_URI;

  if (external) {
    provide('mongoUri', external);
    return () => {};
  }

  const mongod = await MongoMemoryServer.create({
    instance: { launchTimeout: 60000 },
  });

  provide('mongoUri', mongod.getUri());

  return async () => {
    await mongod.stop();
  };
}
