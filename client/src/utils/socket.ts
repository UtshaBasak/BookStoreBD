import type { Socket } from 'socket.io-client';
import type { ChatMessage, NotificationItem } from '@shared/api.js';

import { getToken } from './auth.js';

/**
 * The live connection: chat messages and notifications for the signed-in
 * person, for as long as some page wants them.
 *
 * Pointed at the API's origin, never at `API_BASE_URL` itself: Socket.IO reads
 * the path of the address it is given as a *namespace*, so `io('/api')` asked
 * the server for a namespace called "/api", was refused, and tore the
 * connection down straight away.
 *
 * The server only takes a connection with a valid access token, and delivers
 * to each person what is addressed to them. `auth` is a function so a
 * reconnection sends the token as it is then, after a refresh. A refused
 * connection is not retried by the library, so it is tried again a little
 * later, when the API has had the chance to refresh the token.
 *
 * One connection is shared by every subscriber on the page - the header's
 * bell, its chat badge and an open conversation - and closed when the last of
 * them goes. The Socket.IO client itself is loaded only then, so a visitor who
 * is not signed in never downloads it.
 */
let shared: { socket: Promise<Socket | undefined>; users: number } | null = null;
let retry: ReturnType<typeof setTimeout> | undefined;

const connect = (): Promise<Socket | undefined> =>
  import('socket.io-client')
    .then(({ io }) => {
      const base = import.meta.env.VITE_API_URL as string | undefined;
      const origin = base ? new URL(base, window.location.href).origin : window.location.origin;
      const live = io(origin, { auth: (send) => send({ token: getToken() ?? '' }) });
      live.on('connect_error', () => {
        if (live.active) return; // the library is already retrying
        clearTimeout(retry);
        retry = setTimeout(() => {
          if (shared) live.connect();
        }, 15000);
      });
      return live;
    })
    .catch(() => undefined); // Offline, or a deploy replaced the file: things still arrive on the next fetch.

/** Listens for one event on the shared connection. Returns the function that stops. */
const subscribe = <T>(event: string, handler: (payload: T) => void): (() => void) => {
  if (!shared) shared = { socket: connect(), users: 0 };
  const current = shared;
  current.users += 1;
  let stopped = false;
  void current.socket.then((socket) => {
    if (!stopped) socket?.on(event, handler);
  });

  return () => {
    if (stopped) return;
    stopped = true;
    void current.socket.then((socket) => socket?.off(event, handler));
    current.users -= 1;
    if (current.users === 0 && shared === current) {
      shared = null;
      clearTimeout(retry);
      void current.socket.then((socket) => socket?.disconnect());
    }
  };
};

/** Live chat messages addressed to the signed-in person. */
export const subscribeToMessages = (onMessage: (message: ChatMessage) => void): (() => void) =>
  subscribe('receive_message', onMessage);

/** Live notifications for the signed-in person: the bell. */
export const subscribeToNotifications = (onNotification: (item: NotificationItem) => void): (() => void) =>
  subscribe('notification', onNotification);

export default subscribeToMessages;
