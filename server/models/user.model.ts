import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';
import { encryptedFields } from '../utils/fieldCrypto.js';

const UserSchema = new Schema(
    {
        username: {
            type: String,
            required: true,
            unique: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            // `as const` so the inferred type is the union rather than a bare
            // string: a handler comparing against 'admin' is then checked.
            type: String,
            enum: ['user', 'admin'] as const,
            default: 'user',
            index: true,
        },
        dateOfBirth: {
            type: Date,
        },
        gender: {
            type: String,
            enum: ['male', 'female'] as const,
        },
        address: {
            type: String,
        },
        phone: {
            type: String,
        },
        // The bKash merchant number a seller's sales are paid to, as the
        // eleven digits bKash uses. Required before listing a book: a seller
        // must be payable before anything of theirs can sell. Private - only
        // the owner and administrators see it.
        bkashMerchant: {
            type: String,
        },
        profilePicture: {
            type: String,
        },
        // The banners across the top of the profile: one for buying, one for
        // selling, so the two can look different. A Cloudinary address when
        // image hosting is configured, otherwise base64, as the avatar is.
        buyerBanner: { type: String },
        buyerBannerPublicId: { type: String },
        sellerBanner: { type: String },
        sellerBannerPublicId: { type: String },
        // Two-step sign-in: after the password, a one-time code sent to the
        // account's e-mail address. Off until the owner turns it on.
        twoFactor: { type: Boolean, default: false },
        // The Google account it is linked to, once the owner has signed in
        // with Google. Google's own id for them, not a credential.
        googleId: { type: String, index: true, sparse: true },
        // False for an account made through Google until its owner chooses a
        // password: there is no current one to ask for before they do.
        passwordSet: { type: Boolean, default: true },
        // The browsers this account has been signed in from, as HMACs of a
        // cookie (utils/deviceAlert.ts), so a new one can be reported.
        knownDevices: { type: [String], default: [] },
        // What they want to hear about, by category and channel; anything
        // missing is on. See utils/notificationPrefs.ts.
        notificationPrefs: { type: Schema.Types.Mixed, default: {} },
        wishlist: [{
            type: Schema.Types.ObjectId,
            ref: 'AddBook'
        }],
        cart: [{
            type: Schema.Types.ObjectId,
            ref: 'Cart'
        }]
    }, 
    { timestamps: true }
);

/*
 * The administrator's user table lists everyone who is not an administrator,
 * newest first, a page at a time. `_id` is on the end for the same reason as
 * on the book indexes: the table sorts by `{ createdAt, _id }` so accounts
 * created in the same second cannot swap between pages, and a sort is only
 * served by an index when it is a prefix of that index's keys.
 */
UserSchema.index({ role: 1, createdAt: -1, _id: -1 });

// Encrypted at rest: a copy of the database alone does not give away where
// someone lives, their phone number, or where their money is paid.
encryptedFields(UserSchema, ['address', 'phone', 'bkashMerchant']);

export type UserAttributes = InferSchemaType<typeof UserSchema>;
export type UserDocument = HydratedDocument<UserAttributes>;

const User = defineModel<UserAttributes>('UserTable', UserSchema);
export default User;
