import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * A single-use value handed to the Android app before it asks Google for an
 * ID token. Google writes it into the token, and the token is accepted only
 * once, with a nonce issued here and not yet used: a token copied from
 * somewhere else, or presented twice, is refused.
 */
const AuthNonceSchema = new Schema({
  /** A SHA-256 of the nonce; the value itself is never stored. */
  hash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
});

// MongoDB removes it once it has expired; the code checks the date itself too.
AuthNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type AuthNonceAttributes = InferSchemaType<typeof AuthNonceSchema>;
export type AuthNonceDocument = HydratedDocument<AuthNonceAttributes>;

export default defineModel<AuthNonceAttributes>('AuthNonce', AuthNonceSchema);
