import User from '../models/user.model.js';
import { errorHandler } from '../uits/error.js';
import SignUp from './pages/SignUp.js';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import SignIn from './pages/SignIn.js';
import Profile from './pages/Profile.js'; // Import Profile page

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
        res.status(200).json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};

// Update user profile
export const updateUserProfile = async (req, res) => {
    try {
        const { email, username, password, address, phone } = req.body; // Get updated data from request body
        const user = await User.findOneAndUpdate(
            { email }, // Find user by email
            { username, password, address, phone }, // Update fields
            { new: true } // Return the updated document
        );
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }
        res.status(200).json({ message: 'Profile updated successfully', user });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
};