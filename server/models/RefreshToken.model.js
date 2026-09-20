import mongoose from 'mongoose';

const RefreshTokenSchema = new mongoose.Schema(
  {
    // Only the SHA-256 of the token is stored. A leaked database dump then
    // yields nothing that can be presented to /auth/refresh.
    tokenHash: { type: String, required: true, unique: true, index: true },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'UserTable',
      required: true,
      index: true,
    },

    // Every token minted from one sign-in shares a family id. If a already-used
    // token is presented again - the signature of a stolen token - the whole
    // family is revoked, which logs that session out everywhere.
    family: { type: String, required: true, index: true },

    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },

    // Set when this token is exchanged, so replay can be detected.
    rotatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Expired rows are removed by MongoDB itself rather than piling up.
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

RefreshTokenSchema.methods.isUsable = function isUsable() {
  return !this.revokedAt && !this.rotatedAt && this.expiresAt > new Date();
};

export default mongoose.model('RefreshToken', RefreshTokenSchema);
