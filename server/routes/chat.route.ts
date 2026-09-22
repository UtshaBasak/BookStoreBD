import express, { type Request, type Response } from 'express';

import ChatMessage from '../models/Chat.model.js';
import User from '../models/user.model.js';
import { actingUser, requireAuth, type WithUser } from '../middleware/auth.js';
import { imageUpload, verifyImageBytes } from '../middleware/imageUpload.js';
import { displayNameFor } from '../utils/anonymous.js';
import { createLogger } from '../config/logger.js';
import { errorMessage } from '../utils/error.js';
import { validate, validatedQuery } from '../middleware/validate.js';
import { serveStoredImage } from '../utils/serveImage.js';
import { API_PREFIX } from '../config/apiPaths.js';
import {
  chatSchemas,
  type ChatMessagesQuery,
  type IdParams,
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
        // `image` is checked for presence, never sent: an attachment is stored
        // on the document as base64, so selecting it put every picture in the
        // thread into every page of it.
        .select('sender receiver message timestamp image')
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

        res.json({
            messages: messages.reverse().map((msg) => ({
                ...msg,
                image: msg.image ? `${API_PREFIX}/chat/messages/${String(msg._id)}/image` : null,
            })),
            page,
            limit
        });
    } catch (error) {
        res.status(500).json({ message: errorMessage(error) });
    }
});

/**
 * One attachment.
 *
 * Only the two people in the thread, and an administrator. Served as its own
 * request with a cache header, so a conversation's pictures are fetched when
 * they are looked at rather than with every page of the thread.
 */
router.get(
    '/messages/:id/image',
    validate(chatSchemas.image),
    async (req: Request<IdParams>, res: Response, next) => {
    try {
        const message = await ChatMessage.findById(req.params.id)
            .select('sender receiver image')
            .lean();

        if (!message) {
            res.status(404).json({ message: 'Message not found' });
            return;
        }

        if (!isParticipant(req, message.sender, message.receiver)) {
            res.status(403).json({ message: 'Not a participant in this conversation' });
            return;
        }

        if (!serveStoredImage(req, res, message.image)) {
            res.status(404).json({ message: 'No attachment on that message' });
        }
    } catch (error) {
        next(error);
    }
});

// Get chat history/users
router.get('/history/:email', async (req, res) => {
    try {
        // Always the caller's own conversation list.
        const { email } = actingUser(req);

        /*
         * One aggregation rather than every message this account has ever sent
         * or received.
         *
         * This used to load them all - bodies, and the base64 attachments with
         * them - to work out a list of names and a last line each, then ran two
         * more queries per conversation. The sidebar cost the whole history.
         */
        const conversations = await ChatMessage.aggregate<{
            _id: string;
            lastMessage: string;
            lastWasImage: boolean;
            lastMessageTime: Date;
            unreadCount: number;
        }>([
            { $match: { $or: [{ sender: email }, { receiver: email }] } },
            { $sort: { timestamp: -1 } },
            {
                $group: {
                    _id: { $cond: [{ $eq: ['$sender', email] }, '$receiver', '$sender'] },
                    lastMessage: { $first: '$message' },
                    lastWasImage: { $first: { $cond: [{ $ifNull: ['$image', false] }, true, false] } },
                    lastMessageTime: { $first: '$timestamp' },
                    unreadCount: {
                        $sum: {
                            $cond: [
                                { $and: [{ $eq: ['$receiver', email] }, { $eq: ['$read', false] }] },
                                1,
                                0,
                            ],
                        },
                    },
                },
            },
            { $sort: { lastMessageTime: -1 } },
            { $limit: 200 },
        ]);

        const emails = conversations.map((row) => row._id);

        /*
         * Names, and whether there is a picture - not the picture. A profile
         * photograph is a base64 data URI too, so twenty conversations meant
         * twenty of them in a list that draws each one 40 pixels wide.
         */
        const people = await User.aggregate<{ email: string; username: string; hasAvatar: boolean }>([
            { $match: { email: { $in: emails } } },
            {
                $project: {
                    email: 1,
                    username: 1,
                    hasAvatar: { $gt: [{ $strLenCP: { $ifNull: ['$profilePicture', ''] } }, 0] },
                },
            },
        ]);
        const byEmail = new Map(people.map((person) => [person.email, person]));

        res.json(
            conversations.map((row) => {
                const person = byEmail.get(row._id);
                return {
                    email: row._id,
                    // Never the raw tombstone: somebody who closed their account
                    // shows up as "Deleted user", and the thread still reads.
                    username: displayNameFor(row._id, person?.username),
                    profilePicture: person?.hasAvatar
                        ? `${API_PREFIX}/user/${encodeURIComponent(row._id)}/avatar`
                        : undefined,
                    lastMessage: row.lastMessage || (row.lastWasImage ? 'Photo' : ''),
                    lastMessageTime: row.lastMessageTime,
                    unreadCount: row.unreadCount,
                };
            })
        );
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

        // One or the other. An empty message with nothing attached is not a
        // message; a picture on its own is.
        if (!message?.trim() && !req.file) {
            res.status(400).json({ message: 'Write something or attach a picture' });
            return;
        }

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
