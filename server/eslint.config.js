import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Deliberately still JavaScript: a TypeScript config file would need a loader
// installed purely to read it, for no benefit.
export default tseslint.config(
  { ignores: ['node_modules', 'dist'] },

  {
    files: ['**/*.ts'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
    rules: {
      // The base rule cannot see type-only syntax, so the TypeScript-aware one
      // replaces it rather than running alongside.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_|^next$' }],
    },
  },

  {
    // This file itself.
    files: ['*.js'],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node,
    },
  }
);
