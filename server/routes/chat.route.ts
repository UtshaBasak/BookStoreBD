import express, { type Request, type Response } from 'express';

import ChatMessage from '../models/Chat.model.js';
import User from '../models/user.model.js';
import { actingUser, requireAuth, type WithUser } from '../middleware/auth.js';
import { imageUpload, verifyImageBytes } from '../middleware/imageUpload.js';
import { createLogger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';
import { validate, validatedQuery } from '../middleware/validate.js';
import {
  chatSchemas,
  type ChatMessagesQuery,
  type DeleteConversationBody,
  type MarkReadBody,
  type SendChatBody,
} from '../schemas/index.js';

const log = createLogger('chat');

const router = express.Router();


// A conversation is private to its two participants.
router.use(requireAuth);

/** True when the signed-in user is one of the two people in a thread. */
const isParticipant = (req: WithUser, ...emails: string[]): boolean => {
    const actor = actingUser(req);
    return actor.role === 'admin' || emails.includes(actor.email);
};

// Get chat messages between two users
router.get(
    '/messages',
    validate(chatSchemas.messages),
    async (req, res) => {
    try {
        const { sender, receiver, page, limit } = validatedQuery<ChatMessagesQuery>(req);
        if (!isParticipant(req, sender, receiver)) {
            res.status(403).json({ message: 'Not a participant in this conversation' });
            return;
        }

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
        res.status(500).json({ message: errorMessage(error) });
    }
});

// Get chat history/users
router.get('/history/:email', async (req, res) => {
    try {
        // Always the caller's own conversation list.
        const { email } = actingUser(req);

        // Find all messages where user is sender or receiver
        const messages = await ChatMessage.find({
            $or: [{ sender: email }, { receiver: email }]
        }).sort({ timestamp: -1 });

        // Get unique users from messages
        const users = new Set<string>();
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
        chatUsers.sort(
            (a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime()
        );

        res.json(chatUsers);
    } catch (error) {
        log.error({ err: error }, 'Chat history error');
        res.status(500).json({ message: errorMessage(error) });
    }
});

// Save new message (handles both text and image messages)
router.post(
    '/message',
    imageUpload.single('image'),
    verifyImageBytes,
    validate(chatSchemas.send),
    async (req: Request<unknown, unknown, SendChatBody>, res: Response) => {
    try {
        // The sender is the signed-in user, never a body field: otherwise
        // anyone could post messages as somebody else.
        const sender = actingUser(req).email;
        const { receiver, message } = req.body;

        let imageData: string | null = null;
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
        log.error({ err: error }, 'Chat message error');
        res.status(500).json({ message: errorMessage(error) });
    }
});

// Delete conversation between two users
router.delete(
    '/delete',
    validate(chatSchemas.remove),
    async (req: Request<unknown, unknown, DeleteConversationBody>, res: Response) => {
    try {
        const { user1, user2 } = req.body;
        if (!isParticipant(req, user1, user2)) {
            res.status(403).json({ message: 'Not a participant in this conversation' });
            return;
        }

        await ChatMessage.deleteMany({
            $or: [
                { sender: user1, receiver: user2 },
                { sender: user2, receiver: user1 }
            ]
        });

        res.status(200).json({ message: 'Conversation deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: errorMessage(error) });
    }
});

// Get unread message count for a user
router.get('/unread/:email', async (req, res) => {
  try {
    // Always the caller's own unread count.
    const { email } = actingUser(req);
    const unreadMessages = await ChatMessage.countDocuments({
      receiver: email,
      read: false
    });
    res.json({ count: unreadMessages });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
});

// Mark messages as read
router.post(
  '/read',
  validate(chatSchemas.markRead),
  async (req: Request<unknown, unknown, MarkReadBody>, res: Response) => {
  try {
    const { sender } = req.body;
    // Only the recipient can mark a thread as read.
    const receiver = actingUser(req).email;
    await ChatMessage.updateMany(
      { sender, receiver, read: false },
      { $set: { read: true } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ message: errorMessage(error) });
  }
});

export default router;
