import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Starts one in-memory MongoDB for the whole run and hands its URI to the test
 * workers through Vitest's provide/inject channel.
 *
 * One shared instance rather than one per file: starting mongod is by far the
 * slowest part of the suite, and its default 10s launch timeout has been seen
 * to expire on Windows.
 */
export default async function setup({ provide }) {
  const mongod = await MongoMemoryServer.create({
    instance: { launchTimeout: 60000 },
  });

  provide('mongoUri', mongod.getUri());

  return async () => {
    await mongod.stop();
  };
}
