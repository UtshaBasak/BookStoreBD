/**
 * A chat attachment is stored on the message as base64.
 *
 * So the thread carried every picture in it, in every page of it - and the
 * conversation list was worse: it loaded every message this account had ever
 * sent or received, attachments included, to work out a list of names and a
 * last line each.
 *
 * They are addresses now, behind the check that the asker is in the thread.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import {
  createTestContext,
  clearDatabase,
  closeTestContext,
  type PrefixedRequest,
} from './helpers/testApp.js';
import { createSignedInUser, createUser, PNG_PIXEL } from './helpers/factories.js';
import ChatMessage from '../models/Chat.model.js';

let request: PrefixedRequest;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

const ALICE = 'alice@test.com';
const BOB = 'bob@test.com';

const PNG_URI = `data:image/png;base64,${PNG_PIXEL.toString('base64')}`;

const sent = async (overrides: Record<string, unknown> = {}) =>
  ChatMessage.create({
    sender: ALICE,
    receiver: BOB,
    message: 'Here it is',
    image: PNG_URI,
    timestamp: new Date(),
    ...overrides,
  });

describe('a page of a conversation', () => {
  it('carries an address, not the picture', async () => {
    const message = await sent();
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request
      .get(`/chat/messages?sender=${ALICE}&receiver=${BOB}`)
      .set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.body.messages[0].image).toBe(`/api/chat/messages/${String(message._id)}/image`);
    expect(JSON.stringify(res.body)).not.toContain('base64');
  });

  it('and null when a message has none', async () => {
    await sent({ image: null, message: 'Just words' });
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request
      .get(`/chat/messages?sender=${ALICE}&receiver=${BOB}`)
      .set('Authorization', alice.auth);

    expect(res.body.messages[0].image).toBeNull();
  });
});

describe('one attachment', () => {
  it('is served to the person who sent it', async () => {
    const message = await sent();
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request
      .get(`/chat/messages/${String(message._id)}/image`)
      .set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.body).toEqual(PNG_PIXEL);
  });

  it('and to the person it was sent to', async () => {
    const message = await sent();
    const bob = await createSignedInUser(request, { email: BOB });

    expect(
      (
        await request
          .get(`/chat/messages/${String(message._id)}/image`)
          .set('Authorization', bob.auth)
      ).status
    ).toBe(200);
  });

  it('and to nobody else', async () => {
    const message = await sent();
    const stranger = await createSignedInUser(request, { email: 'stranger@test.com' });

    // A conversation is private to its two participants, and so is what is in
    // it. This was never an issue while the bytes rode along inside a response
    // only they could read - it is one the moment there is a URL.
    expect(
      (
        await request
          .get(`/chat/messages/${String(message._id)}/image`)
          .set('Authorization', stranger.auth)
      ).status
    ).toBe(403);
  });

  it('not at all when signed out', async () => {
    const message = await sent();

    expect((await request.get(`/chat/messages/${String(message._id)}/image`)).status).toBe(401);
  });

  it('can be cached and revalidated', async () => {
    const message = await sent();
    const alice = await createSignedInUser(request, { email: ALICE });
    const url = `/chat/messages/${String(message._id)}/image`;

    const first = await request.get(url).set('Authorization', alice.auth);
    expect(first.headers['cache-control']).toMatch(/public, max-age=\d+/);

    const again = await request
      .get(url)
      .set('Authorization', alice.auth)
      .set('If-None-Match', first.headers.etag);

    expect(again.status).toBe(304);
  });

  it('404s for a message with no attachment', async () => {
    const message = await sent({ image: null });
    const alice = await createSignedInUser(request, { email: ALICE });

    expect(
      (
        await request
          .get(`/chat/messages/${String(message._id)}/image`)
          .set('Authorization', alice.auth)
      ).status
    ).toBe(404);
  });
});

describe('the conversation list', () => {
  it('carries no pictures at all', async () => {
    await sent();
    await createUser({ email: BOB, username: 'Bob', profilePicture: PNG_URI });
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request.get(`/chat/history/${ALICE}`).set('Authorization', alice.auth);

    expect(res.status).toBe(200);
    // Neither the attachments nor the avatars, both of which are base64.
    expect(JSON.stringify(res.body)).not.toContain('base64');
    expect(res.body[0].profilePicture).toBe(`/api/user/${encodeURIComponent(BOB)}/avatar`);
  });

  it('leaves the picture out entirely for somebody who has none', async () => {
    await sent();
    await createUser({ email: BOB, username: 'Bob' });
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request.get(`/chat/history/${ALICE}`).set('Authorization', alice.auth);

    expect(res.body[0].profilePicture).toBeUndefined();
  });

  it('still says who, what was said last, and how many are unread', async () => {
    await sent({ image: null, message: 'First', read: true });
    await sent({ image: null, message: 'Second', sender: BOB, receiver: ALICE, read: false });
    await createUser({ email: BOB, username: 'Bob' });
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request.get(`/chat/history/${ALICE}`).set('Authorization', alice.auth);

    expect(res.body).toHaveLength(1);
    expect(res.body[0].email).toBe(BOB);
    expect(res.body[0].username).toBe('Bob');
    expect(res.body[0].lastMessage).toBe('Second');
    expect(res.body[0].unreadCount).toBe(1);
  });

  it('says "Photo" when the last message was one', async () => {
    await sent({ message: '' });
    await createUser({ email: BOB, username: 'Bob' });
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request.get(`/chat/history/${ALICE}`).set('Authorization', alice.auth);

    // An empty line in the list would look like an empty conversation.
    expect(res.body[0].lastMessage).toBe('Photo');
  });

  it('and somebody who closed their account still reads as a person', async () => {
    await sent();
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request.get(`/chat/history/${ALICE}`).set('Authorization', alice.auth);

    expect(res.body[0].username).toBeTruthy();
  });
});

describe('a profile picture', () => {
  it('is served as an image', async () => {
    await createUser({ email: BOB, username: 'Bob', profilePicture: PNG_URI });

    const res = await request.get(`/user/${encodeURIComponent(BOB)}/avatar`);

    // Public, like the profile endpoint that used to return the same bytes
    // inline - and cacheable, which a data URI in a JSON body never was.
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/image\/png/);
    expect(res.headers['cache-control']).toMatch(/public, max-age=\d+/);
  });

  it('404s for an account with none', async () => {
    await createUser({ email: BOB, username: 'Bob' });

    expect((await request.get(`/user/${encodeURIComponent(BOB)}/avatar`)).status).toBe(404);
  });

  it('and for an address with no account', async () => {
    expect((await request.get('/user/nobody@test.com/avatar')).status).toBe(404);
  });

  it('refuses to serve anything that is not an image', async () => {
    await createUser({
      email: BOB,
      username: 'Bob',
      profilePicture: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
    });

    expect((await request.get(`/user/${encodeURIComponent(BOB)}/avatar`)).status).toBe(404);
  });
});

describe('sending one', () => {
  it('accepts a picture with no words', async () => {
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', BOB)
      .field('message', '')
      .attach('image', PNG_PIXEL, 'photo.png');

    // `message` was `required`, and Mongoose's required check rejects an empty
    // string - so the attachment button answered 500 unless you also typed
    // something.
    expect(res.status).toBe(201);
  });

  it('but refuses a message that is neither', async () => {
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', BOB)
      .field('message', '   ');

    expect(res.status).toBe(400);
  });

  it('and still takes words with no picture', async () => {
    const alice = await createSignedInUser(request, { email: ALICE });

    const res = await request
      .post('/chat/message')
      .set('Authorization', alice.auth)
      .field('receiver', BOB)
      .field('message', 'Is this still available?');

    expect(res.status).toBe(201);
  });
});
