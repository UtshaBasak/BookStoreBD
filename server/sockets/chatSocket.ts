import type { Server as HttpServer } from 'http';

import { Server } from 'socket.io';

import type { ChatMessage } from '@shared/api.js';
import { socketCorsOptions } from '../config/cors.js';
import { createLogger } from '../config/logger.js';
import { verifyAccessToken } from '../utils/jwt.js';

const log = createLogger('socket');

let io: Server | null = null;

/** Everything addressed to one person arrives in their own room. */
export const userRoom = (email: string): string => `user:${email.trim().toLowerCase()}`;

/**
 * Live delivery for the buyer/seller chat.
 *
 * A connection has to carry a valid access token, and is put in its owner's
 * room and nowhere else. It used to take anyone, and let them join whatever
 * room they named and relay whatever they sent - and a room's name was the
 * two e-mail addresses, so listening in on a conversation took knowing who
 * was in it. Nothing is sent over the socket by a browser now: a message is
 * saved through the API, and the server delivers the saved message to the
 * person it is for (`deliverChatMessage`).
 */
export const registerChatSocket = (httpServer: HttpServer): Server => {
  io = new Server(httpServer, { cors: socketCorsOptions });

  io.use((socket, next) => {
    const token: unknown = socket.handshake.auth?.token;
    const payload = typeof token === 'string' && token ? verifyAccessToken(token) : null;
    if (!payload?.email) {
      next(new Error('unauthorized'));
      return;
    }
    socket.data.email = payload.email;
    next();
  });

  io.on('connection', (socket) => {
    const email = String(socket.data.email);
    void socket.join(userRoom(email));
    log.debug({ socketId: socket.id }, 'Socket connected');

    socket.on('disconnect', () => {
      log.debug({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
};

/**
 * Sends a saved message to its receiver's open pages: the chat, the chat
 * window on a book, and the unread badge in the header. The sender's own page
 * has the message already, from the response to sending it.
 */
export const deliverChatMessage = (message: ChatMessage): void => {
  io?.to(userRoom(message.receiver)).emit('receive_message', message);
};
