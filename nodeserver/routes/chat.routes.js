import express from 'express';
import multer from 'multer';
import ChatMessage from '../models/Chat.model.js';
import User from '../models/user.model.js';

const router = express.Router();

// Configure multer for memory storage
const upload = multer({ 
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    } 
});

// Get chat messages between two users
router.get('/messages', async (req, res) => {
    try {
        const { sender, receiver, page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        const messages = await ChatMessage.find({
            $or: [
                { sender, receiver },
                { sender: receiver, receiver: sender }
            ]
        })
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

        res.json({
            messages: messages.reverse(),
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// Get chat history/users
router.get('/history/:email', async (req, res) => {
    try {
        const { email } = req.params;
        
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
        const { sender, receiver, message } = req.body;
        if (!sender || !receiver) {
            return res.status(400).json({ message: 'Sender and receiver are required' });
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
        const { user1, user2 } = req.body;
        
        await Message.deleteMany({
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
    const { email } = req.params;
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
    const { sender, receiver } = req.body;
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
