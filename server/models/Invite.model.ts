import { Schema, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

/**
 * One member inviting one address to join. Kept so the inviter can see who
 * joined, hears when they do, and so an address is not invited over and over.
 */
const InviteSchema = new Schema(
  {
    inviterEmail: { type: String, required: true, index: true },
    inviteeEmail: { type: String, required: true, index: true },
    /** Whether an e-mail went: none goes to an address that already has an account. */
    emailed: { type: Boolean, default: false },
    joinedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

InviteSchema.index({ inviterEmail: 1, inviteeEmail: 1 }, { unique: true });

export type InviteAttributes = InferSchemaType<typeof InviteSchema>;

export default defineModel<InviteAttributes>('Invite', InviteSchema);
