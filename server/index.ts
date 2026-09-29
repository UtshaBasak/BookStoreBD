import { createApp } from './app.js';
import { config, assertRequiredEnv } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';
import { registerChatSocket } from './sockets/chatSocket.js';
import { logger } from './config/logger.js';
import { initErrorTracking } from './config/sentry.js';
import { mailTransport } from './utils/mailer.js';

const start = async () => {
  assertRequiredEnv();
  await initErrorTracking();
  await connectDatabase();

  const app = createApp();
  const server = app.listen(config.port, () => {
    // How mail goes, said once: a code that never arrives is otherwise only
    // explained by an error at the moment somebody asks for one.
    logger.info({ port: config.port, env: config.env, mail: mailTransport() }, 'Server listening');
  });

  registerChatSocket(server);

  const shutdown = (signal: NodeJS.Signals): void => {
    logger.info({ signal }, 'Shutting down gracefully');
    server.close(async () => {
      await disconnectDatabase();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((error) => {
  logger.fatal({ err: error }, 'Failed to start server');
  process.exit(1);
});
