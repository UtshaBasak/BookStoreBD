import { fileURLToPath } from 'url';

import { mergeConfig, defineConfig } from 'vitest/config';

import viteConfig from './vite.config.js';

// Merged rather than replaced so tests run through the same React plugin and
// resolution rules as the app itself.
export default mergeConfig(
  viteConfig,
  defineConfig({
    resolve: {
      alias: {
        // Matches the `paths` entry in tsconfig.json. The shared contract is
        // types only, so nothing resolves here at run time; the mapping is
        // here so Vite and the compiler cannot disagree.
        '@shared': fileURLToPath(new URL('../server/shared', import.meta.url)),
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  })
);
