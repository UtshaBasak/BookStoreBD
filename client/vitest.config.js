import { mergeConfig, defineConfig } from 'vitest/config';

import viteConfig from './vite.config.js';

// Merged rather than replaced so tests run through the same React plugin and
// resolution rules as the app itself.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.js'],
      include: ['src/**/*.test.{js,jsx}'],
      restoreMocks: true,
    },
  })
);
