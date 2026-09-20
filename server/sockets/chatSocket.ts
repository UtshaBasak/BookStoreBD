import type { Server as HttpServer } from 'http';

import { Server } from 'socket.io';

import type { ChatSocketMessage } from '@shared/api.js';
import { socketCorsOptions } from '../config/cors.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('socket');

/** Wires the buyer/seller chat rooms onto an existing HTTP server. */
export const registerChatSocket = (httpServer: HttpServer): Server => {
  const io = new Server(httpServer, { cors: socketCorsOptions });

  io.on('connection', (socket) => {
    log.debug({ socketId: socket.id }, 'Socket connected');

    socket.on('join_chat', (room: string) => {
      socket.join(room);
      log.debug({ socketId: socket.id, room }, 'Socket joined room');
    });

    socket.on('send_message', (data: ChatSocketMessage) => {
      socket.to(data.room).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
      log.debug({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
};
