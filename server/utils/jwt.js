import jwt from 'jsonwebtoken';

import { config } from '../config/env.js';

/**
 * Signs the access token. The payload deliberately carries only what the API
 * needs to authorise a request - never the password hash or profile data,
 * since a JWT payload is readable by anyone holding the token.
 */
export const signAccessToken = (user) =>
  jwt.sign(
    { sub: String(user._id), email: user.email, role: user.role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn }
  );

/** Returns the decoded payload, or null when the token is missing or invalid. */
export const verifyAccessToken = (token) => {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch {
    return null;
  }
};

/** Pulls the bearer token out of an Authorization header. */
export const extractBearerToken = (header) => {
  if (typeof header !== 'string') return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
};
