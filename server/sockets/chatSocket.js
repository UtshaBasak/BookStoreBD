import { Server } from 'socket.io';
import { socketCorsOptions } from '../config/cors.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('socket');

/** Wires the buyer/seller chat rooms onto an existing HTTP server. */
export const registerChatSocket = (httpServer) => {
  const io = new Server(httpServer, { cors: socketCorsOptions });

  io.on('connection', (socket) => {
    log.debug({ socketId: socket.id }, 'Socket connected');

    socket.on('join_chat', (room) => {
      socket.join(room);
      log.debug({ socketId: socket.id, room }, 'Socket joined room');
    });

    socket.on('send_message', (data) => {
      socket.to(data.room).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
      log.debug({ socketId: socket.id }, 'Socket disconnected');
    });
  });

  return io;
};
