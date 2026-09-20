import { Server } from 'socket.io';
import { socketCorsOptions } from '../config/cors.js';

/** Wires the buyer/seller chat rooms onto an existing HTTP server. */
export const registerChatSocket = (httpServer) => {
  const io = new Server(httpServer, { cors: socketCorsOptions });

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join_chat', (room) => {
      socket.join(room);
      console.log(`User ${socket.id} joined room: ${room}`);
    });

    socket.on('send_message', (data) => {
      socket.to(data.room).emit('receive_message', data);
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
};
