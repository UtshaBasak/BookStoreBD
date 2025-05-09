import User from '../models/user.model.js';
import { errorHandler } from '../uits/error.js';
import SignUp from './pages/SignUp.js';
// import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SignIn from './pages/SignIn.js';
import Profile from './pages/Profile.js'; // Import Profile page
import fs from 'fs';
import path from 'path';

export const test = (req,res) =>{
    res.json({
        message: 'Api route is working!',
        status: 'success'
    });
}

// Fetch user profile
export const getUserProfile = async (req, res) => {
    try {
        const { email } = req.query; // Get email from query parameters
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        // Explicitly return all fields, including profilePicture as base64 string
        res.status(200).json({
            username: user.username,
            email: user.email,
            address: user.address,
            phone: user.phone,
            dateOfBirth: user.dateOfBirth,
            gender: user.gender,
            profilePicture: user.profilePicture || null // Return base64 string if exists
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};

// Update user profile
export const updateUserProfile = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ message: 'Email is required' });
        }
        const updateFields = {};
        const unsetFields = {};

        // List of fields that are allowed to be unset (removed)
        const canBeUnset = ['address', 'phone', 'dateOfBirth', 'gender', 'profilePicture'];

        // Always require username, email, password to be non-empty
        const requiredFields = ['username', 'email', 'password'];

        // Check for required fields (must not be empty string or undefined/null)
        for (const field of requiredFields) {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                if (req.body[field] === '' || req.body[field] === undefined || req.body[field] === null) {
                    return res.status(400).json({ message: `${field.charAt(0).toUpperCase() + field.slice(1)} cannot be empty` });
                }
            }
        }

        // Handle updatable fields
        ['username', 'address', 'phone', 'dateOfBirth', 'gender'].forEach(field => {
            if (Object.prototype.hasOwnProperty.call(req.body, field)) {
                if (req.body[field] === '' && canBeUnset.includes(field)) {
                    unsetFields[field] = "";
                } else if (req.body[field] !== '' && req.body[field] !== undefined && req.body[field] !== null) {
                    updateFields[field] = req.body[field];
                }
            }
        });

        // Handle password: only update if provided and non-empty
        if (Object.prototype.hasOwnProperty.call(req.body, 'password')) {
            if (req.body.password && req.body.password !== '') {
                updateFields.password = req.body.password;
            }
        }

        // Handle profile picture as base64
        if (req.file) {
            updateFields.profilePicture = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        } else if (Object.prototype.hasOwnProperty.call(req.body, 'profilePicture') && req.body.profilePicture === '' && canBeUnset.includes('profilePicture')) {
            unsetFields.profilePicture = "";
        }

        // Check for unique username/email if changed
        const currentUser = await User.findOne({ email });
        if (!currentUser) {
            return res.status(404).json({ message: 'User not found' });
        }
        if (updateFields.username && updateFields.username !== currentUser.username) {
            const usernameExists = await User.findOne({ username: updateFields.username });
            if (usernameExists) {
                return res.status(409).json({ message: "Username already exists" });
            }
        }
        if (updateFields.email && updateFields.email !== currentUser.email) {
            const emailExists = await User.findOne({ email: updateFields.email });
            if (emailExists) {
                return res.status(409).json({ message: "Email already exists" });
            }
        }

        const updateQuery = {};
        if (Object.keys(updateFields).length > 0) updateQuery.$set = updateFields;
        if (Object.keys(unsetFields).length > 0) updateQuery.$unset = unsetFields;

        const user = await User.findOneAndUpdate(
            { email },
            updateQuery,
            { new: true }
        );
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (error) {
        // Handle duplicate key error (in case of race condition)
        if (error.code === 11000) {
            if (error.keyPattern?.username) {
                return res.status(409).json({ message: "Username already exists" });
            }
            if (error.keyPattern?.email) {
                return res.status(409).json({ message: "Email already exists" });
            }
        }
        res.status(500).json({ message: 'Server error', error: error.message });
    }
};

export const uploadDescriptionImages = async (req, res) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ message: 'No images uploaded' });
        }

        const uploadedImages = req.files.map(file => {
            const base64Image = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
            return base64Image;
        });

        res.status(200).json({ message: 'Images uploaded successfully', images: uploadedImages });
    } catch (error) {
        console.error('Error uploading images:', error);
        res.status(500).json({ message: 'Failed to upload images', error });
    }
};