import express from 'express';
import multer from 'multer';
import ChatMessage from '../models/Chat.model.js';
import User from '../models/user.model.js';
import { config } from '../config/env.js';
import { asTrimmedString } from '../utils/sanitize.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();

// Attachments are kept in memory and stored on the document as base64.
const upload = multer({
    limits: { fileSize: config.uploads.maxFileSizeBytes }
});

// A conversation is private to its two participants.
router.use(requireAuth);

/** True when the signed-in user is one of the two people in a thread. */
const isParticipant = (req, ...emails) =>
    req.user.role === 'admin' || emails.includes(req.user.email);

// Get chat messages between two users
router.get('/messages', async (req, res) => {
    try {
        const sender = asTrimmedString(req.query.sender);
        const receiver = asTrimmedString(req.query.receiver);
        if (!sender || !receiver) {
            return res.status(400).json({ message: 'sender and receiver are required' });
        }
        if (!isParticipant(req, sender, receiver)) {
            return res.status(403).json({ message: 'Not a participant in this conversation' });
        }

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
        const skip = (page - 1) * limit;

        // Use index hint and only select needed fields
        const messages = await ChatMessage.find({
            $or: [
                { sender, receiver },
                { sender: receiver, receiver: sender }
            ]
        })
        .select('sender receiver message image timestamp')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        res.json({
            messages: messages.reverse(),
            page,
            limit
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get chat history/users
router.get('/history/:email', async (req, res) => {
    try {
        // Always the caller's own conversation list.
        const email = req.user.email;

        // Find all messages where user is sender or receiver
        const messages = await ChatMessage.find({
            $or: [{ sender: email }, { receiver: email }]
        }).sort({ timestamp: -1 });

        // Get unique users from messages
        const users = new Set();
        messages.forEach(msg => {
            if (msg.sender !== email) users.add(msg.sender);
            if (msg.receiver !== email) users.add(msg.receiver);
        });

        // Get user details and last message for each chat
        const chatUsers = await Promise.all(
            Array.from(users).map(async (userEmail) => {
                const user = await User.findOne({ email: userEmail });
                const lastMessage = messages.find(
                    msg => msg.sender === userEmail || msg.receiver === userEmail
                );

                // Count unread messages for this conversation
                const unreadCount = await ChatMessage.countDocuments({
                    sender: userEmail,
                    receiver: email,
                    read: false
                });

                return {
                    email: userEmail,
                    username: user?.username || userEmail,
                    profilePicture: user?.profilePicture,
                    lastMessage: lastMessage?.message || '',
                    lastMessageTime: lastMessage?.timestamp || new Date(),
                    unreadCount
                };
            })
        );

        // Sort by last message time
        chatUsers.sort((a, b) => new Date(b.lastMessageTime) - new Date(a.lastMessageTime));

        res.json(chatUsers);
    } catch (error) {
        console.error('Chat history error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Save new message (handles both text and image messages)
router.post('/message', upload.single('image'), async (req, res) => {
    try {
        // The sender is the signed-in user, never a body field: otherwise
        // anyone could post messages as somebody else.
        const sender = req.user.email;
        const receiver = asTrimmedString(req.body.receiver);
        const message = asTrimmedString(req.body.message);
        if (!receiver) {
            return res.status(400).json({ message: 'Receiver is required' });
        }

        let imageData = null;
        if (req.file) {
            imageData = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        const newMessage = new ChatMessage({
            sender,
            receiver,
            message: message || '',
            image: imageData,
            timestamp: new Date()
        });

        await newMessage.save();
        res.status(201).json(newMessage);
    } catch (error) {
        console.error('Chat message error:', error);
        res.status(500).json({ message: error.message });
    }
});

// Delete conversation between two users
router.delete('/delete', async (req, res) => {
    try {
        const user1 = asTrimmedString(req.body.user1);
        const user2 = asTrimmedString(req.body.user2);
        if (!user1 || !user2) {
            return res.status(400).json({ message: 'user1 and user2 are required' });
        }
        if (!isParticipant(req, user1, user2)) {
            return res.status(403).json({ message: 'Not a participant in this conversation' });
        }

        await ChatMessage.deleteMany({
            $or: [
                { sender: user1, receiver: user2 },
                { sender: user2, receiver: user1 }
            ]
        });

        res.status(200).json({ message: 'Conversation deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get unread message count for a user
router.get('/unread/:email', async (req, res) => {
  try {
    // Always the caller's own unread count.
    const email = req.user.email;
    const unreadMessages = await ChatMessage.countDocuments({
      receiver: email,
      read: false
    });
    res.json({ count: unreadMessages });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Mark messages as read
router.post('/read', async (req, res) => {
  try {
    const sender = asTrimmedString(req.body.sender);
    // Only the recipient can mark a thread as read.
    const receiver = req.user.email;
    await ChatMessage.updateMany(
      { sender, receiver, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

export default router;
