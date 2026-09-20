import { createApp } from './app.js';
import { config, assertRequiredEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { registerChatSocket } from './sockets/chatSocket.js';

const start = async () => {
  assertRequiredEnv();
  await connectDatabase();

  const app = createApp();
  const server = app.listen(config.port, () => {
    console.log(`Server listening on port ${config.port} (${config.env})`);
  });

  registerChatSocket(server);

  const shutdown = async (signal) => {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
