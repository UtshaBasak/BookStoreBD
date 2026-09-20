import { Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';

import { defineModel } from './defineModel.js';

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
        profilePicture: {
            type: String,
        },
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

export type UserAttributes = InferSchemaType<typeof UserSchema>;
export type UserDocument = HydratedDocument<UserAttributes>;

const User = defineModel<UserAttributes>('UserTable', UserSchema);
export default User;
