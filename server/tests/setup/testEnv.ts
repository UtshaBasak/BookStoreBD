/**
 * Runs in every test worker before any test file is imported.
 *
 * Clears the optional integrations so the suite starts from a known baseline.
 * `config/env.js` already skips `.env` under Vitest; this covers the other
 * route in, a variable exported in the developer's shell. A test that needs one
 * of these sets it itself.
 */
/*
 * The required ones, before any module snapshots `process.env`.
 *
 * `config/env.ts` reads the environment once at import, and `createTestContext`
 * sets these when it is *called* - which is too late for a test file that
 * imports something reading the secret directly rather than through the app.
 * Setting them here removes the ordering question: this file runs before any
 * test file is imported.
 */
process.env.JWT_SECRET ??= 'test-secret-long-enough-for-the-32-char-minimum';
process.env.ADMIN_EMAILS ??= 'admin@test.com';

const OPTIONAL_INTEGRATION_VARS = [
  'CLOUDINARY_CLOUD_NAME',
  'CLOUDINARY_API_KEY',
  'CLOUDINARY_API_SECRET',
  'SENTRY_DSN',
  'SMTP_USER',
  'SMTP_PASS',
  'SERVE_CLIENT',
  'LOG_LEVEL',
];

for (const name of OPTIONAL_INTEGRATION_VARS) {
  delete process.env[name];
}
