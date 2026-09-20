import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import type { Types } from 'mongoose';

import { config, jwtSecret } from '../config/env.js';

/** The parts of a user record the access token is built from. */
export interface AccessTokenSubject {
  _id: Types.ObjectId | string;
  email: string;
  role: string;
}

/** What comes back out of a valid token. */
export interface AccessTokenPayload extends JwtPayload {
  sub: string;
  email: string;
  role: string;
}

/**
 * Signs the access token. The payload deliberately carries only what the API
 * needs to authorise a request - never the password hash or profile data,
 * since a JWT payload is readable by anyone holding the token.
 */
export const signAccessToken = (user: AccessTokenSubject): string =>
  jwt.sign(
    { sub: String(user._id), email: user.email, role: user.role },
    jwtSecret(),
    // JWT_EXPIRES_IN is free-form configuration, while the declarations narrow
    // this to a template literal such as `15m`. The library parses the string
    // at run time and rejects anything it cannot read.
    { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] }
  );

/** Returns the decoded payload, or null when the token is missing or invalid. */
export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    const decoded = jwt.verify(token, jwtSecret());
    // A token signed with a string payload decodes to a string; ours never is,
    // so anything that shape is not one of ours.
    return typeof decoded === 'string' ? null : (decoded as AccessTokenPayload);
  } catch {
    return null;
  }
};

/** Pulls the bearer token out of an Authorization header. */
export const extractBearerToken = (header: unknown): string | null => {
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};
