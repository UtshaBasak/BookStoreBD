import { io, type Socket } from 'socket.io-client';

import { getToken } from './auth.js';

/**
 * The live connection for chat, opened by each page that shows messages.
 *
 * Pointed at the API's origin, never at `API_BASE_URL` itself: Socket.IO reads
 * the path of the address it is given as a *namespace*, so `io('/api')` asked
 * the server for a namespace called "/api", was refused, and tore the
 * connection down straight away. No message ever arrived live, and the console
 * showed "WebSocket is closed before the connection is established".
 *
 * The server only takes a connection with a valid access token, and delivers
 * to each person the messages addressed to them. `auth` is a function so a
 * reconnection sends the token as it is then, after a refresh, rather than the
 * one the page started with. A refused connection is not retried by the
 * library, so it is tried again a little later, when the API has had the
 * chance to refresh the token.
 */
export interface ChatSocket {
  socket: Socket;
  /** Closes the connection and cancels any retry still waiting. */
  close: () => void;
}

export const openSocket = (): ChatSocket => {
  const base = import.meta.env.VITE_API_URL as string | undefined;
  const origin = base ? new URL(base, window.location.href).origin : window.location.origin;

  const socket = io(origin, {
    auth: (send) => send({ token: getToken() ?? '' }),
  });

  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  socket.on('connect_error', () => {
    if (socket.active) return; // the library is already retrying
    clearTimeout(retry);
    retry = setTimeout(() => {
      if (!closed) socket.connect();
    }, 15000);
  });

  return {
    socket,
    close: () => {
      closed = true;
      clearTimeout(retry);
      socket.disconnect();
    },
  };
};

export default openSocket;
