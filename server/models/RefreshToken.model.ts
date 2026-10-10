import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

const RefreshTokenSchema = new Schema(
  {
    // Only the SHA-256 of the token is stored. A leaked database dump then
    // yields nothing that can be presented to /auth/refresh.
    tokenHash: { type: String, required: true, unique: true, index: true },

    user: {
      type: Schema.Types.ObjectId,
      ref: 'UserTable',
      required: true,
      index: true,
    },

    // Every token minted from one sign-in shares a family id. If an already-used
    // token is presented again - the signature of a stolen token - the whole
    // family is revoked, which logs that session out everywhere.
    family: { type: String, required: true, index: true },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },

    // Set when this token is exchanged, so replay can be detected.
    rotatedAt: { type: Date, default: null },

    // The hash of the token this one was exchanged for.
    replacedBy: { type: String, default: null },

    /*
     * Which kind of client holds it. A website session lives in an httpOnly
     * cookie; an Android session is sent in request bodies and tied to a key in
     * the phone's keystore. Each is accepted only by its own endpoints, so a
     * script on the website can never turn its cookie into a token it could
     * carry away.
     */
    client: { type: String, enum: ['web', 'android'], default: 'web' },

    // Android only: the public half of the phone's key (base64 SPKI, P-256).
    deviceKey: { type: String, default: null },

    // Android only: the phone, as the app describes it, for the owner's lists.
    deviceName: { type: String, default: '' },
  },
  { timestamps: true }
);

// Expired rows are removed by MongoDB itself rather than piling up.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenAttributes = InferSchemaType<typeof RefreshTokenSchema>;
export type RefreshTokenDocument = HydratedDocument<RefreshTokenAttributes>;

export default defineModel<RefreshTokenAttributes>('RefreshToken', RefreshTokenSchema);
