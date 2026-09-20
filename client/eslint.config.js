import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Deliberately still JavaScript: a TypeScript config file would need a loader
// installed purely to read it, for no benefit.
export default tseslint.config(
  { ignores: ['dist'] },

  {
    // Build and tooling config runs in Node, not the browser.
    files: ['*.config.{js,ts}', 'src/test/**'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,

      // The base rule cannot see type-only syntax, so the TypeScript-aware one
      // replaces it rather than running alongside.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Back at 'error' now that data fetching has moved to TanStack Query and
      // the remaining derived state is computed during render. These were
      // demoted to warnings while 17 call sites still fetched inside effects.
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/immutability': 'error',
    },
  }
);
