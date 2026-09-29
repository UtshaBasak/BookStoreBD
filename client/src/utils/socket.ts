import type { Socket } from 'socket.io-client';
import type { ChatMessage } from '@shared/api.js';

import { getToken } from './auth.js';

/**
 * Live chat messages for the signed-in person, for as long as a page wants
 * them. Returns the function that stops them.
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
 *
 * The Socket.IO client is loaded here, when a signed-in page first asks for
 * it, rather than with the site: a visitor who is not signed in never uses it,
 * and it was a third of the JavaScript every first visit downloaded unused.
 */
export const subscribeToMessages = (onMessage: (message: ChatMessage) => void): (() => void) => {
  let closed = false;
  let socket: Socket | undefined;
  let retry: ReturnType<typeof setTimeout> | undefined;

  void import('socket.io-client')
    .then(({ io }) => {
      if (closed) return;

      const base = import.meta.env.VITE_API_URL as string | undefined;
      const origin = base ? new URL(base, window.location.href).origin : window.location.origin;

      const live = io(origin, { auth: (send) => send({ token: getToken() ?? '' }) });
      socket = live;
      live.on('receive_message', onMessage);
      live.on('connect_error', () => {
        if (live.active) return; // the library is already retrying
        clearTimeout(retry);
        retry = setTimeout(() => {
          if (!closed) live.connect();
        }, 15000);
      });
    })
    .catch(() => {
      // Offline, or a deploy replaced the file: messages still arrive with the
      // next fetch of the thread, just not live.
    });

  return () => {
    closed = true;
    clearTimeout(retry);
    socket?.disconnect();
  };
};

export default subscribeToMessages;
