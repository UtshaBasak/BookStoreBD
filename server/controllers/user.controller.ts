import bcryptjs from 'bcryptjs';
import type { Request, Response } from 'express';

import type { OwnProfile, ProfileResponse, PublicProfile } from '@shared/api.js';

import User from '../models/user.model.js';
import type { ProfileQuery, UpdateProfileBody } from '../schemas/index.js';
import { createLogger } from '../config/logger.js';
import { errorMessage, isDuplicateKeyError } from '../utils/error.js';

const log = createLogger('user');

// Fetch user profile
export const getUserProfile = async (
    req: Request<unknown, unknown, unknown, ProfileQuery>,
    res: Response
): Promise<void> => {
    try {
        // A profile may be viewed by its owner, an administrator, or
        // anyone looking at a seller's public details on a listing.
        const requested = req.query.email;
        const email = requested || req.user?.email;
        if (!email) {
            res.status(400).json({ message: 'Email required' });
            return;
        }
        const user = await User.findOne({ email: String(email) });
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }

        // Anyone may see the handle and avatar attached to a listing. The
        // contact details are only for the owner and administrators - without
        // this split, any address, phone number and date of birth in the
        // database could be read by e-mail address alone.
        const isOwnerOrAdmin =
            req.user?.role === 'admin' || req.user?.email === user.email;

        const publicProfile: PublicProfile = {
            username: user.username,
            email: user.email,
            profilePicture: user.profilePicture || null,
        };

        const ownProfile: OwnProfile = {
            ...publicProfile,
            address: user.address,
            phone: user.phone,
            dateOfBirth: user.dateOfBirth?.toISOString(),
            gender: user.gender,
            role: user.role,
        };

        const body: ProfileResponse = isOwnerOrAdmin ? ownProfile : publicProfile;
        res.status(200).json(body);
    } catch (error) {
        log.error({ err: error }, 'Error fetching profile');
        res.status(500).json({ message: 'Server error' });
    }
};

/** Fields a profile update may clear outright, rather than only replace. */
const CAN_BE_UNSET = ['address', 'phone', 'dateOfBirth', 'gender', 'profilePicture'] as const;

/** Fields that must never be sent as an empty value. */
const REQUIRED_FIELDS = ['username', 'email', 'password'] as const;

/** Fields a caller may set on their own profile. */
const UPDATABLE_FIELDS = ['username', 'address', 'phone', 'dateOfBirth', 'gender'] as const;

// Update user profile
export const updateUserProfile = async (
    req: Request<unknown, unknown, UpdateProfileBody>,
    res: Response
): Promise<void> => {
    try {
        // Always the caller's own profile - a body-supplied e-mail would
        // let anyone rewrite another account.
        const email = req.user?.email;
        const body = req.body as Record<string, unknown>;
        const updateFields: Record<string, unknown> = {};
        const unsetFields: Record<string, string> = {};

        // Check for required fields (must not be empty string or undefined/null)
        for (const field of REQUIRED_FIELDS) {
            if (Object.prototype.hasOwnProperty.call(body, field)) {
                if (body[field] === '' || body[field] === undefined || body[field] === null) {
                    res.status(400).json({ message: `${field.charAt(0).toUpperCase() + field.slice(1)} cannot be empty` });
                    return;
                }
            }
        }

        // Handle updatable fields
        for (const field of UPDATABLE_FIELDS) {
            if (!Object.prototype.hasOwnProperty.call(body, field)) continue;

            const value = body[field];
            if (value === '' && (CAN_BE_UNSET as readonly string[]).includes(field)) {
                unsetFields[field] = '';
            } else if (value !== '' && value !== undefined && value !== null) {
                updateFields[field] = value;
            }
        }

        // Handle password: only update if provided and non-empty. Always hash;
        // storing the raw value here would leave plaintext passwords in the
        // database for every profile update.
        if (typeof req.body.password === 'string' && req.body.password !== '') {
            updateFields.password = bcryptjs.hashSync(req.body.password, 10);
        }

        // Handle profile picture as base64
        if (req.file) {
            updateFields.profilePicture = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        } else if (Object.prototype.hasOwnProperty.call(body, 'profilePicture') && req.body.profilePicture === '') {
            unsetFields.profilePicture = '';
        }

        // Check for unique username/email if changed
        const currentUser = await User.findOne({ email });
        if (!currentUser) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        if (updateFields.username && updateFields.username !== currentUser.username) {
            const usernameExists = await User.findOne({ username: updateFields.username });
            if (usernameExists) {
                res.status(409).json({ message: 'Username already exists' });
                return;
            }
        }

        const updateQuery: Record<string, unknown> = {};
        if (Object.keys(updateFields).length > 0) updateQuery.$set = updateFields;
        if (Object.keys(unsetFields).length > 0) updateQuery.$unset = unsetFields;

        const user = await User.findOneAndUpdate(
            { email },
            updateQuery,
            { returnDocument: 'after' }
        );
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (error) {
        // Handle duplicate key error (in case of race condition)
        if (isDuplicateKeyError(error)) {
            if (error.keyPattern?.username) {
                res.status(409).json({ message: 'Username already exists' });
                return;
            }
            if (error.keyPattern?.email) {
                res.status(409).json({ message: 'Email already exists' });
                return;
            }
        }
        res.status(500).json({ message: 'Server error', error: errorMessage(error) });
    }
};
