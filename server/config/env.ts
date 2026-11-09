import dotenv from 'dotenv';

// Skipped under Vitest so tests are hermetic. Without this a developer's own
// server/.env would leak in and a suite could pass or fail depending on which
// optional integrations they happened to have configured.
if (!process.env.VITEST) {
  // quiet: dotenv 17+ otherwise prints a promotional banner on every boot.
  dotenv.config({ quiet: true });
}

const parseOrigins = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((origin) => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);

const DEFAULT_ORIGINS = ['http://localhost:5173'];

/** What `res.cookie` accepts, so the value cannot drift into a typo. */
export type SameSite = 'lax' | 'strict' | 'none';

const SAME_SITE_VALUES: readonly SameSite[] = ['lax', 'strict', 'none'];

const parseSameSite = (value: string | undefined): SameSite => {
  const normalised = (value ?? 'lax').toLowerCase();
  return SAME_SITE_VALUES.includes(normalised as SameSite) ? (normalised as SameSite) : 'lax';
};

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT) || 4000,
  mongoUri: process.env.MONGO,
  /*
   * The site's own address is always allowed. Browsers send an Origin header
   * on a same-origin POST too, so without it every sign-in, order and form on
   * the site's own pages would be refused. Render supplies
   * RENDER_EXTERNAL_URL; PUBLIC_SITE_URL covers a custom domain.
   */
  corsOrigins: [
    ...new Set([
      ...(parseOrigins(process.env.CORS_ORIGINS).length
        ? parseOrigins(process.env.CORS_ORIGINS)
        : DEFAULT_ORIGINS),
      ...parseOrigins(process.env.PUBLIC_SITE_URL),
      ...parseOrigins(process.env.RENDER_EXTERNAL_URL),
    ]),
  ],
  // Serve the built client from this process, making the app same-origin.
  // On in production; in development the Vite dev server proxies instead, and
  // under test it stays off so route behaviour does not depend on whether a
  // build happens to be sitting on disk.
  serveClient: process.env.SERVE_CLIENT
    ? process.env.SERVE_CLIENT === 'true'
    : process.env.NODE_ENV === 'production',
  // The canonical origin, for the absolute URLs in the sitemap and robots.txt.
  // Left unset the request's own host is used, which is right until the site
  // answers on more than one hostname. Trailing slash trimmed so joining a path
  // never produces a double slash.
  publicSiteUrl: (process.env.PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, ''),
  // Explicit level wins; otherwise logger.ts picks one from the environment.
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
    sameSite: parseSameSite(process.env.COOKIE_SAME_SITE),
  },
  // Accounts promoted to admin the first time they sign in. Lets the existing
  // deployment keep its administrator without a database migration.
  adminEmails: (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
  // Optional image hosting. With none of these set the app stores covers as
  // base64 on the document.
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  smtp: {
    // The address mail is sent from, whichever way it is sent.
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    service: process.env.SMTP_SERVICE ?? 'gmail',
  },
  /*
   * Gmail's web API, over HTTPS. Used when all three are set, and needed on
   * Render's free plan, which blocks the SMTP ports. The refresh token comes
   * from `npm run gmail:token`.
   */
  gmailApi: {
    clientId: process.env.GMAIL_CLIENT_ID,
    clientSecret: process.env.GMAIL_CLIENT_SECRET,
    refreshToken: process.env.GMAIL_REFRESH_TOKEN,
  },
  uploads: {
    maxFileSizeBytes: Number(process.env.MAX_UPLOAD_BYTES) || 5 * 1024 * 1024,
    maxFilesPerRequest: Number(process.env.MAX_UPLOAD_FILES) || 10,
  },
};

export type AppConfig = typeof config;

const numberFrom = (value: string | undefined, fallback: number, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}): number => {
  const parsed = Number(value);
  return value !== undefined && value.trim() !== '' && Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
};

export type ModerationMode = 'off' | 'shadow' | 'on';
export type ThinkingLevel = 'minimal' | 'low' | 'medium' | 'high';

/**
 * The Gemini API (Google AI Studio), behind the shopping assistant and the
 * model layer of moderation.
 *
 * Off until GEMINI_API_KEY is set, like the bot check: without it the
 * assistant is hidden and moderation runs its rules only. Model names and
 * budgets change over time, so every one is a variable, and none of them is
 * needed. Read when used, not at start-up, so a key can be added without a
 * code change and a test can set one for itself.
 */
export const geminiSettings = () => {
  const thinking = (process.env.GEMINI_THINKING_LEVEL ?? 'minimal').trim().toLowerCase();
  return {
    apiKey: process.env.GEMINI_API_KEY?.trim() || null,
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    moderationModel: process.env.GEMINI_MODERATION_MODEL?.trim() || process.env.GEMINI_MODEL?.trim() || 'gemini-3.5-flash-lite',
    embeddingModel: process.env.GEMINI_EMBEDDING_MODEL?.trim() || 'gemini-embedding-001',
    /** Empty to leave thinking at the model's default (older models refuse the setting). */
    thinkingLevel: (['minimal', 'low', 'medium', 'high'].includes(thinking) ? thinking : null) as ThinkingLevel | null,
    /** The shop-wide ceilings, kept under the key's free-tier limits. */
    requestsPerMinute: numberFrom(process.env.GEMINI_RPM, 10, { min: 1 }),
    requestsPerDay: numberFrom(process.env.GEMINI_RPD, 500, { min: 1 }),
    /** The part of both ceilings moderation may use; the assistant has the rest, and priority. */
    moderationShare: numberFrom(process.env.GEMINI_MODERATION_SHARE, 0.2, { min: 0, max: 1 }),
    timeoutMs: numberFrom(process.env.GEMINI_TIMEOUT_MS, 20_000, { min: 1000 }),
    maxConcurrent: numberFrom(process.env.GEMINI_MAX_CONCURRENT, 4, { min: 1 }),
  };
};

export type GeminiSettings = ReturnType<typeof geminiSettings>;

/** The shopping assistant's own switch and limits. It also needs the Gemini key. */
export const assistantSettings = () => ({
  enabled: process.env.ASSISTANT_ENABLED !== 'false',
  /** Questions a signed-in person may ask in a day. */
  perUserDaily: numberFrom(process.env.ASSISTANT_USER_DAILY, 60, { min: 1 }),
  /** Questions a visitor who is not signed in may ask in a day, per address. */
  perIpDaily: numberFrom(process.env.ASSISTANT_IP_DAILY, 30, { min: 1 }),
  /** Questions a minute from one address, before the limiter answers 429. */
  perMinute: numberFrom(process.env.ASSISTANT_PER_MINUTE, 12, { min: 1 }),
});

/**
 * Automatic moderation: `off`, `shadow` (flags recorded but not shown to
 * admins, for a trial) or `on`. Off unless set, so nothing changes until the
 * owner turns it on; render.yaml starts it in shadow.
 */
/** Rule codes switched off, from MODERATION_DISABLED_RULES (comma-separated). */
export const disabledModerationRules = (): Set<string> =>
  new Set(
    (process.env.MODERATION_DISABLED_RULES ?? '')
      .split(',')
      .map((code) => code.trim())
      .filter(Boolean)
  );

export const moderationMode = (): ModerationMode => {
  const mode = (process.env.MODERATION_MODE ?? 'off').trim().toLowerCase();
  return mode === 'on' || mode === 'shadow' ? mode : 'off';
};

export const assertRequiredEnv = (): void => {
  const missing: string[] = [];
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
  if ((config.jwt.secret as string).length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters. ' +
        'Generate one with: openssl rand -hex 48'
    );
  }
};

/**
 * Reads a required variable, failing loudly if it is missing.
 *
 * assertRequiredEnv() runs at boot, so by the time anything calls these the
 * values are present. Going through an accessor is what turns that runtime
 * guarantee into one the compiler can see, instead of scattering non-null
 * assertions across the modules that need them.
 */
const required = (value: string | undefined, name: string): string => {
  if (!value) {
    throw new Error(`${name} is not set; call assertRequiredEnv() during start-up`);
  }
  return value;
};

export const mongoUri = (): string => required(config.mongoUri, 'MONGO');
export const jwtSecret = (): string => required(config.jwt.secret, 'JWT_SECRET');

export default config;
