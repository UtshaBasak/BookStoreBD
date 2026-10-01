/**
 * What an error report may carry.
 *
 * Sentry 11 made "more permissive data collection the default": request
 * bodies, headers, cookies, user details, database payloads and the values of
 * local variables in the frame that threw, all collected unless told otherwise.
 * For this application that includes a sign-in body with a password in it.
 *
 * These run the real SDK with the real options, through a transport that keeps
 * what it would have sent, and read it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as Sentry from '@sentry/node';

import { DATA_COLLECTION, sentryOptions } from '../config/sentry.js';

/** Everything that would have gone over the wire, as text. */
const sent: string[] = [];

const decode = (body: string | Uint8Array): string =>
  typeof body === 'string' ? body : new TextDecoder().decode(body);

beforeAll(() => {
  Sentry.init({
    ...sentryOptions('https://public@o0.ingest.sentry.io/0'),
    transport: (options) =>
      Sentry.createTransport(options, (request) => {
        sent.push(decode(request.body));
        return Promise.resolve({ statusCode: 200 });
      }),
  });
});

afterAll(async () => {
  await Sentry.close(2000);
});

const flushed = async (): Promise<string> => {
  await Sentry.flush(2000);
  return sent.join('\n');
};

describe('what the options say', () => {
  it('collects nothing about the person by default', () => {
    // Stated rather than inherited, so a release that changes a default cannot
    // turn one of these back on without this failing.
    expect(DATA_COLLECTION).toMatchObject({
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      databaseQueryData: false,
      stackFrameVariables: false,
    });
  });

  it('keeps query parameters, minus the ones that name somebody', () => {
    expect(DATA_COLLECTION.urlQueryParams).toEqual({
      deny: expect.arrayContaining(['email', 'password', 'token', 'otp', 'code']),
    });
  });
});

describe('what a report actually contains', () => {
  it('the error itself', async () => {
    Sentry.captureException(new Error('The thing that broke'));

    expect(await flushed()).toContain('The thing that broke');
  });

  it('not the Authorization header, the cookie, or a password in the body', async () => {
    // What the HTTP integration would attach to an event from a sign-in
    // request that failed.
    Sentry.captureEvent({
      message: 'Sign-in failed',
      request: {
        method: 'POST',
        url: 'https://shop.example/api/auth/signin',
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.a-real-session',
          cookie: 'refreshToken=a-real-refresh-token',
        },
        data: { email: 'shopper@example.com', password: 'hunter2-correct-horse' },
      },
    });

    const wire = await flushed();

    expect(wire).toContain('Sign-in failed');
    expect(wire).not.toContain('a-real-session');
    expect(wire).not.toContain('a-real-refresh-token');
    expect(wire).not.toContain('hunter2-correct-horse');
  });

  it('not the value of a local variable in the frame that threw', async () => {
    /*
     * Built at run time, not written out. Sentry also sends the source lines
     * around the frame, so a secret typed as a literal next to the throw would
     * turn up in those whatever this setting said, and read as a false leak.
     */
    const secret = ['local', 'variable', 'secret'].join('-');

    // Named exactly as it is in the auth controller.
    const verify = (password: string) => {
      if (password.length > 0) throw new Error('Could not verify the password');
    };

    try {
      verify(secret);
    } catch (error) {
      Sentry.captureException(error);
    }

    const wire = await flushed();

    expect(wire).toContain('Could not verify the password');
    expect(wire).not.toContain(secret);
  });
});
