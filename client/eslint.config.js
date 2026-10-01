import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

// Deliberately JavaScript: a TypeScript config file would need a loader
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

      // User-facing messages go through `useToast`; `alert()` blocks the tab
      // and cannot be styled. The rule also covers `confirm`, which a few call
      // sites use deliberately, with a disable comment, where a confirmation
      // needs an answer. Planned: a dialog component to replace them.
      'no-alert': 'error',

      // Data fetching goes through TanStack Query and derived state is
      // computed during render, so state is never set inside an effect.
      'react-hooks/set-state-in-effect': 'error',
      'react-hooks/immutability': 'error',
    },
  }
);
