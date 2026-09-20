import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: './tests/setup/globalSetup.js',
    setupFiles: ['./tests/setup/testEnv.js'],
    include: ['tests/**/*.test.js'],
    // Starting mongod is the slow part; one instance is shared by every file
    // and each file gets its own database, so files can still run in parallel.
    testTimeout: 30000,
    hookTimeout: 60000,
    restoreMocks: true,
  },
});
