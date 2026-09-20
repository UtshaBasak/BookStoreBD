/**
 * Runs in every test worker before any test file is imported.
 *
 * Clears the optional integrations so the suite starts from a known baseline.
 * `config/env.js` already skips `.env` under Vitest; this covers the other
 * route in, a variable exported in the developer's shell. A test that needs one
 * of these sets it itself.
 */
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
