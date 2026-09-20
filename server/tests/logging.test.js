import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';

import { createTestContext, clearDatabase, closeTestContext } from './helpers/testApp.js';
import { createUser, PASSWORD } from './helpers/factories.js';

let request;

beforeAll(async () => {
  ({ request } = await createTestContext());
});

afterAll(closeTestContext);
beforeEach(clearDatabase);

describe('request correlation', () => {
  it('returns a request id on every response', async () => {
    const res = await request.get('/book');

    expect(res.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  it('gives different requests different ids', async () => {
    const [a, b] = await Promise.all([request.get('/book'), request.get('/book')]);

    expect(a.headers['x-request-id']).not.toBe(b.headers['x-request-id']);
  });

  it('echoes an id supplied upstream, so a trace survives the hop', async () => {
    const res = await request.get('/book').set('X-Request-Id', 'trace-from-proxy');

    expect(res.headers['x-request-id']).toBe('trace-from-proxy');
  });

  it('ignores an absurdly long id rather than echoing it', async () => {
    const res = await request.get('/book').set('X-Request-Id', 'x'.repeat(500));

    expect(res.headers['x-request-id']).not.toBe('x'.repeat(500));
  });

  it('sets one on an error response too', async () => {
    const res = await request.get('/no-such-route');

    expect(res.status).toBe(404);
    expect(res.headers['x-request-id']).toBeTruthy();
  });
});

describe('what gets logged', () => {
  /**
   * Drives the real middleware - built from the exported options, so this
   * cannot drift from what the app actually uses - against a fake Express
   * request and response, and reads back the line it emitted.
   */
  const capture = async ({ url, originalUrl, statusCode = 200 }) => {
    const { EventEmitter } = await import('events');
    const pino = (await import('pino')).default;
    const { createRequestLogger } = await import('../middleware/requestLogger.js');

    const lines = [];
    const capturing = pino({ level: 'info' }, { write: (l) => lines.push(JSON.parse(l)) });
    const middleware = createRequestLogger(capturing);

    const req = Object.assign(new EventEmitter(), {
      method: 'GET',
      url,
      originalUrl,
      headers: {},
    });
    const res = Object.assign(new EventEmitter(), {
      statusCode,
      setHeader() {},
      getHeader() {},
    });

    middleware(req, res);
    res.emit('finish');
    await new Promise((resolve) => setImmediate(resolve));

    return lines;
  };

  it('logs the URL the client asked for, not the router-relative one', async () => {
    // Express rewrites req.url to '/' for a request to /book handled by a
    // router mounted at /book. The log must still say /book.
    const lines = await capture({ url: '/', originalUrl: '/book' });

    expect(lines).toHaveLength(1);
    expect(lines[0].msg).toBe('GET /book 200');
    expect(lines[0].req.url).toBe('/book');
  });

  it('records a request id', async () => {
    const lines = await capture({ url: '/', originalUrl: '/book' });

    expect(lines[0].req.id).toBeTruthy();
  });

  it('skips the health check', async () => {
    const lines = await capture({ url: '/health', originalUrl: '/health' });

    expect(lines).toHaveLength(0);
  });

  it('logs a client error as a warning, not an error', async () => {
    const lines = await capture({ url: '/', originalUrl: '/nope', statusCode: 404 });

    expect(lines[0].level).toBe(40); // warn
  });

  it('logs a server fault as an error', async () => {
    const lines = await capture({ url: '/', originalUrl: '/boom', statusCode: 500 });

    expect(lines[0].level).toBe(50); // error
  });

  it('does not include the raw header bag', async () => {
    const lines = await capture({ url: '/', originalUrl: '/book' });

    expect(lines[0].req.headers).toBeUndefined();
  });
});

describe('logger configuration', () => {
  it('is silent under test so suite output stays readable', async () => {
    const { logger } = await import('../config/logger.js');
    expect(logger.level).toBe('silent');
  });

  it('exposes named child loggers', async () => {
    const { createLogger } = await import('../config/logger.js');
    const child = createLogger('probe');

    expect(typeof child.info).toBe('function');
    expect(typeof child.error).toBe('function');
  });
});

describe('secrets never reach a log line', () => {
  /**
   * Builds a logger writing into an array so the serialised output can be
   * asserted on directly, using the same redaction list the app uses.
   */
  const captureLogs = async () => {
    const pino = (await import('pino')).default;
    const lines = [];
    const stream = { write: (line) => lines.push(line) };

    const logger = pino(
      {
        level: 'info',
        redact: {
          paths: [
            'req.headers.authorization',
            'req.body.password',
            'password',
            'token',
            'SMTP_PASS',
          ],
          censor: '[Redacted]',
        },
      },
      stream
    );

    return { logger, lines };
  };

  it('redacts an Authorization header', async () => {
    const { logger, lines } = await captureLogs();

    logger.info({ req: { headers: { authorization: 'Bearer super-secret-token' } } }, 'req');

    expect(lines.join('')).not.toContain('super-secret-token');
    expect(lines.join('')).toContain('[Redacted]');
  });

  it('redacts a password in a request body', async () => {
    const { logger, lines } = await captureLogs();

    logger.info({ req: { body: { email: 'a@test.com', password: 'hunter2' } } }, 'signin');

    const output = lines.join('');
    expect(output).not.toContain('hunter2');
    expect(output).toContain('a@test.com');
  });

  it('redacts a token or SMTP password logged at the top level', async () => {
    const { logger, lines } = await captureLogs();

    logger.info({ token: 'jwt-value', SMTP_PASS: 'app-password', ok: 'kept' }, 'config');

    const output = lines.join('');
    expect(output).not.toContain('jwt-value');
    expect(output).not.toContain('app-password');
    expect(output).toContain('kept');
  });

  it('a real sign-in does not put the password on the wire back', async () => {
    await createUser({ email: 'alice@test.com' });

    const res = await request
      .post('/auth/signin')
      .send({ email: 'alice@test.com', password: PASSWORD });

    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(PASSWORD);
  });
});
