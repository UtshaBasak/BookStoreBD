import dotenv from 'dotenv';

// quiet: dotenv 17+ otherwise prints a promotional banner on every boot.
dotenv.config({ quiet: true });

const parseOrigins = (value) =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const DEFAULT_ORIGINS = ['http://localhost:5173'];

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS).length
    ? parseOrigins(process.env.CORS_ORIGINS)
    : DEFAULT_ORIGINS,
  // Serve the built client from this process, making the app same-origin.
  // On in production; in development the Vite dev server proxies instead, and
  // under test it stays off so route behaviour does not depend on whether a
  // build happens to be sitting on disk.
  serveClient: process.env.SERVE_CLIENT
    ? process.env.SERVE_CLIENT === 'true'
    : process.env.NODE_ENV === 'production',
  // Explicit level wins; otherwise logger.js picks one from the environment.
  logLevel: process.env.LOG_LEVEL,
  // Optional. Error reporting stays switched off when this is unset.
  sentryDsn: process.env.SENTRY_DSN,
  jwt: {
    secret: process.env.JWT_SECRET,
    // Short-lived on purpose: an access token cannot be revoked, so the window
    // in which a stolen one is useful should be small. The refresh token,
    // which can be revoked, is what keeps a session alive.
    expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    refreshTtlMs: Number(process.env.REFRESH_TOKEN_TTL_DAYS ?? 30) * 24 * 60 * 60 * 1000,
  },
  cookies: {
    // Same-origin in every environment, so Lax is enough and the third-party
    // cookie restrictions in Safari and Firefox never come into play.
    secure: process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production',
    sameSite: process.env.COOKIE_SAME_SITE ?? 'lax',
  },
  // Accounts promoted to admin the first time they sign in. Lets the existing
  // deployment keep its administrator without a database migration.
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  // Optional image hosting. With none of these set the app stores covers as
  // base64 on the document, exactly as it did before.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  smtp: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    service: process.env.SMTP_SERVICE ?? 'gmail',
  },
  uploads: {
    maxFileSizeBytes: Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024,
    maxFilesPerRequest: Number(process.env.MAX_UPLOAD_FILES) || 10,
  },
};

export const assertRequiredEnv = () => {
  const missing = [];
  if (!config.mongoUri) missing.push('MONGO');
  if (!config.jwt.secret) missing.push('JWT_SECRET');

  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. ` +
        'Copy .env.example to .env and fill in the values.'
    );
  }

  // A short secret is brute-forceable offline, and a forged token is a full
  // account takeover, so refuse to start rather than run with a weak one.
  if (config.jwt.secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters. ' +
        'Generate one with: openssl rand -hex 48'
    );
  }
};

export default config;
