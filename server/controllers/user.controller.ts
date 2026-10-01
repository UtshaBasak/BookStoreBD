import bcryptjs from 'bcryptjs';
import type { Request, Response } from 'express';

import type { OwnProfile, ProfileResponse, PublicProfile } from '@shared/api.js';

import User, { type UserDocument } from '../models/user.model.js';
import { API_PREFIX } from '../config/apiPaths.js';
import { destroyAssets, isCloudinaryConfigured, uploadImage } from '../config/cloudinary.js';
import type { ProfileQuery, UpdateProfileBody } from '../schemas/index.js';
import { createLogger } from '../config/logger.js';
import { sellerRatingOf } from './sellerReview.controller.js';
import { newPasswordProblem } from '../utils/breachedPassword.js';
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
            buyerBanner: bannerUrl(user, 'buyer'),
            sellerBanner: bannerUrl(user, 'seller'),
            sellerRating: await sellerRatingOf(user.email),
        };

        const ownProfile: OwnProfile = {
            ...publicProfile,
            address: user.address,
            phone: user.phone,
            bkashMerchant: user.bkashMerchant,
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

type BannerRole = 'buyer' | 'seller';
const BANNER_FIELDS = { buyer: 'buyerBanner', seller: 'sellerBanner' } as const;

/** A banner's address: hosted as it is, or the endpoint that serves it. */
const bannerUrl = (user: UserDocument, role: BannerRole): string | null => {
    const stored = user[BANNER_FIELDS[role]];
    if (!stored) return null;
    if (/^https?:\/\//.test(stored)) return stored;
    // The version makes a replaced banner a new address, so a browser holding
    // the old one for its day of cache does not keep showing it.
    const version = user.updatedAt ? user.updatedAt.getTime() : 0;
    return `${API_PREFIX}/user/${encodeURIComponent(user.email)}/banner/${role}?v=${version}`;
};

/**
 * Banners are wide photographs, and bigger than an avatar. The page scales
 * them down before sending; this is the ceiling for anything that did not.
 */
const MAX_BANNER_BYTES = 3 * 1024 * 1024;

/** Stores a banner: on Cloudinary when it is configured, inline otherwise. */
const storeBanner = async (file: Express.Multer.File): Promise<{ url: string; publicId: string | null }> => {
    const dataUri = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
    if (!isCloudinaryConfigured()) return { url: dataUri, publicId: null };
    const uploaded = await uploadImage(dataUri, { folder: 'bookstorebd/banners' });
    return { url: uploaded.secure_url, publicId: uploaded.public_id };
};

/** Fields a profile update may clear outright, rather than only replace. */
const CAN_BE_UNSET = ['address', 'phone', 'bkashMerchant', 'dateOfBirth', 'gender', 'profilePicture'] as const;

/** Fields that must never be sent as an empty value. */
const REQUIRED_FIELDS = ['username', 'email', 'password'] as const;

/** Fields a caller may set on their own profile. */
const UPDATABLE_FIELDS = ['username', 'address', 'phone', 'bkashMerchant', 'dateOfBirth', 'gender'] as const;

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
            const weak = await newPasswordProblem(req.body.password, {
                email,
                username: typeof body.username === 'string' ? body.username : req.user?.username,
            });
            if (weak) {
                res.status(400).json({ message: weak });
                return;
            }
            updateFields.password = bcryptjs.hashSync(req.body.password, 10);
        }

        // Pictures arrive as named files: the one profile picture, and a
        // banner for each role.
        const files = (req.files ?? {}) as Record<string, Express.Multer.File[] | undefined>;

        // Handle profile picture as base64
        const picture = files.profilePicture?.[0];
        if (picture) {
            updateFields.profilePicture = `data:${picture.mimetype};base64,${picture.buffer.toString('base64')}`;
        } else if (Object.prototype.hasOwnProperty.call(body, 'profilePicture') && req.body.profilePicture === '') {
            unsetFields.profilePicture = '';
        }

        const bannerChanges: BannerRole[] = [];
        for (const role of ['buyer', 'seller'] as const) {
            const field = BANNER_FIELDS[role];
            const upload = files[field]?.[0];
            if (upload && upload.size > MAX_BANNER_BYTES) {
                res.status(413).json({ message: 'A banner can be at most 3 MB' });
                return;
            }
            if (upload || body[field] === '') bannerChanges.push(role);
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

        // Only now, once the update is known to be going ahead: an upload
        // for a request that is then refused would be an orphan on Cloudinary.
        const replacedAssets: (string | undefined)[] = [];
        for (const role of bannerChanges) {
            const field = BANNER_FIELDS[role];
            const upload = files[field]?.[0];
            replacedAssets.push(currentUser[`${field}PublicId`] ?? undefined);
            if (upload) {
                const stored = await storeBanner(upload);
                updateFields[field] = stored.url;
                if (stored.publicId) updateFields[`${field}PublicId`] = stored.publicId;
                else unsetFields[`${field}PublicId`] = '';
            } else {
                unsetFields[field] = '';
                unsetFields[`${field}PublicId`] = '';
            }
        }

        const updateQuery: Record<string, unknown> = {};
        if (Object.keys(updateFields).length > 0) updateQuery.$set = updateFields;
        if (Object.keys(unsetFields).length > 0) updateQuery.$unset = unsetFields;

        // Without the password hash, which must never reach the browser or
        // anything logging responses there.
        const user = await User.findOneAndUpdate(
            { email },
            updateQuery,
            { returnDocument: 'after', projection: { password: 0 } }
        );
        if (!user) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        // The pictures they replace, once the new ones are saved.
        await destroyAssets(replacedAssets);
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
