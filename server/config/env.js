import dotenv from 'dotenv';

// quiet: dotenv 17+ otherwise prints a promotional banner on every boot.
dotenv.config({ quiet: true });

const parseOrigins = (value) =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const DEFAULT_ORIGINS = ['http://localhost:5173', 'https://bookstorebd.vercel.app'];

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO,
  corsOrigins: parseOrigins(process.env.CORS_ORIGINS).length
    ? parseOrigins(process.env.CORS_ORIGINS)
    : DEFAULT_ORIGINS,
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN ?? '7d',
  },
  // Accounts promoted to admin the first time they sign in. Lets the existing
  // deployment keep its administrator without a database migration.
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
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
