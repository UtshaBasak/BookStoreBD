import { fileURLToPath } from 'url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      // Matches the `paths` entry in tsconfig.json. Types only, so nothing
      // actually resolves here at run time - but Vite needs the mapping to
      // agree with the compiler's.
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globalSetup: './tests/setup/globalSetup.ts',
    setupFiles: ['./tests/setup/testEnv.ts'],
    include: ['tests/**/*.test.ts'],
    // Starting mongod is the slow part; one instance is shared by every file
    // and each file gets its own database, so files can still run in parallel.
    testTimeout: 30000,
    hookTimeout: 60000,
    restoreMocks: true,
  },
});
