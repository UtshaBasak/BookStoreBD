import pino, { type Logger } from 'pino';

import { config } from './env.js';

/**
 * Anything listed here is replaced with [Redacted] before a log line is
 * written. Tokens and passwords must never reach a log file: logs get shipped,
 * shared in issues and pasted into chat far more readily than a database is.
 */
const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.newPassword',
  'req.body.otp',
  'req.body.code',
  'res.headers["set-cookie"]',
  'password',
  'token',
  'JWT_SECRET',
  'SMTP_PASS',
  'CLOUDINARY_API_SECRET',
  'apiSecret',
  'api_secret',
];

const isTest = config.env === 'test';
const isDevelopment = config.env === 'development';

/**
 * Pretty, human-readable output while developing; newline-delimited JSON
 * everywhere else, which is what log aggregators expect.
 *
 * Silent under test so a suite's output stays readable — an individual test
 * can still raise the level through LOG_LEVEL.
 */
const resolveLevel = (): string => {
  if (config.logLevel) return config.logLevel;
  if (isTest) return 'silent';
  return isDevelopment ? 'debug' : 'info';
};

export const logger = pino({
  level: resolveLevel(),
  redact: { paths: REDACTED_PATHS, censor: '[Redacted]' },
  base: { env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  ...(isDevelopment
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,env' },
        },
      }
    : {}),
});

/** A child logger tagged with the subsystem it belongs to. */
export const createLogger = (name: string): Logger => logger.child({ name });

export default logger;
