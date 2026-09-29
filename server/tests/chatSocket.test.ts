/**
 * The live chat connection. It took anyone, let them join any room by naming
 * it - and a room's name was the two e-mail addresses - and relayed whatever
 * they sent. These pin the replacement: a connection needs a valid access
 * token, and a message reaches the person it is addressed to and nobody else.
 */
import { createServer, type Server as HttpServer } from 'http';
import type { AddressInfo } from 'net';

import { io as connect, type Socket } from 'socket.io-client';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { deliverChatMessage, registerChatSocket } from '../sockets/chatSocket.js';
import { signAccessToken } from '../utils/jwt.js';

let http: HttpServer;
let url: string;
const open: Socket[] = [];

beforeAll(async () => {
  http = createServer();
  registerChatSocket(http);
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}`;
});

afterEach(() => {
  for (const socket of open.splice(0)) socket.disconnect();
});

afterAll(async () => {
  await new Promise((resolve) => http.close(resolve));
});

const tokenFor = (email: string): string => signAccessToken({ _id: '0123456789abcdef01234567', email, role: 'user' });

/** Connects, and resolves once the server has accepted or refused. */
const join = (token?: string): Promise<{ socket: Socket; error?: Error }> =>
  new Promise((resolve) => {
    const socket = connect(url, { auth: token === undefined ? {} : { token }, reconnection: false, forceNew: true });
    open.push(socket);
    socket.once('connect', () => resolve({ socket }));
    socket.once('connect_error', (error) => resolve({ socket, error }));
  });

const message = {
  _id: 'abc',
  sender: 'buyer@test.com',
  receiver: 'seller@test.com',
  message: 'Is it still available?',
  image: null,
  timestamp: new Date().toISOString(),
};

describe('the chat socket', () => {
  it('refuses a connection without a token, or with a bad one', async () => {
    expect((await join()).error?.message).toBe('unauthorized');
    expect((await join('not-a-token')).error?.message).toBe('unauthorized');
  });

  it('delivers a message to its receiver, and only to them', async () => {
    const seller = (await join(tokenFor('seller@test.com'))).socket;
    const stranger = (await join(tokenFor('stranger@test.com'))).socket;

    const heardByStranger: unknown[] = [];
    stranger.on('receive_message', (m: unknown) => heardByStranger.push(m));

    const received = new Promise((resolve) => seller.once('receive_message', resolve));
    deliverChatMessage(message);

    expect(await received).toMatchObject({ message: 'Is it still available?', sender: 'buyer@test.com' });
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(heardByStranger).toEqual([]);
  });

  it('no longer takes room joins or relays from a browser', async () => {
    const seller = (await join(tokenFor('seller@test.com'))).socket;
    const snoop = (await join(tokenFor('snoop@test.com'))).socket;

    const heard: unknown[] = [];
    seller.on('receive_message', (m: unknown) => heard.push(m));

    // The old protocol: name the room, then send into it.
    snoop.emit('join_chat', 'buyer@test.com-seller@test.com');
    snoop.emit('send_message', { ...message, sender: 'buyer@test.com', room: 'buyer@test.com-seller@test.com' });

    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(heard).toEqual([]);
  });
});
