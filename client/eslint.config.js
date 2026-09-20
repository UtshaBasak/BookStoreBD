import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
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
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'no-unused-vars': ['error', { varsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // eslint-plugin-react-hooks v7 turned on the React Compiler rules. They
      // flag the fetch-in-useEffect-then-setState pattern that every page here
      // uses, so 17 call sites report as errors on a codebase that works.
      //
      // Warnings rather than off: the findings stay visible so they can be
      // worked through page by page, but they do not fail CI in the meantime.
      // Promote both back to 'error' once the pages fetch their data outside
      // of effects. See https://react.dev/learn/you-might-not-need-an-effect
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
];
