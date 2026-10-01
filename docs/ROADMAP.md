# Upgrade roadmap

Eight upgrades that bring BookStoreBD in line with how a comparable production
service is built and run, each landed as a self-contained, revertible commit.
All eight are complete.

**Current baseline.** Lint, type-check, build and boot are green from a clean
`npm ci`, with zero dependency vulnerabilities in all three package roots.
**571 tests** (397 server, 174 client) gate every push. CodeQL reports five
findings, all confirmed false positives.

| Order | Task | Phase | Depends on | Outcome |
| ---: | --- | --- | --- | --- |
| 1 | [1 · Automated tests](#1--automated-tests) | Foundation | — | Vitest suites in both packages, gating CI |
| 2 | [7 · Docker Compose](#7--docker-compose) | Foundation | — | Development and production-like stacks |
| 3 | [5 · Structured logging](#5--structured-logging-and-error-tracking) | Foundation | — | pino with correlation ids, optional Sentry |
| 4 | [3 · Zod validation](#3--request-validation-with-zod) | Hardening | 1 | A schema on every endpoint |
| 5 | [2 · Refresh tokens](#2--refresh-tokens-and-logout) | Hardening | 1 | 15-minute access tokens, rotating refresh, real logout |
| 6 | [4 · Cloudinary](#4--image-storage-on-cloudinary) | Larger | 1 | Optional signed direct uploads to a CDN |
| 7 | [6 · TanStack Query](#6--tanstack-query) | Larger | 1 | Shared query cache, zero lint warnings |
| 8 | [8 · TypeScript](#8--typescript) | Larger | 1, 4 | Both packages under `strict`, one shared contract |

The order is local-first: the project runs cleanly on a laptop before
deployment work. Task numbers are stable; only the running order differs.

---

## Known CodeQL findings

**Five findings, all false positives**, dismissed in the Security tab rather
than changed in code. Measured on 22 September 2026 with CodeQL CLI 2.27.0,
using the workflow's `javascript-code-scanning` suite and
`javascript-typescript` language on a copy of the working tree without
`node_modules`.

| Rule | Count | Why it is not a defect |
| --- | ---: | --- |
| `js/xss-through-dom` | 3 | `URL.createObjectURL` can only produce a `blob:` URL; CodeQL models it as taint-propagating regardless. The only barriers the query accepts would corrupt a `blob:` or `data:` URL. The three sites are the file pickers in `ChatWindow`, `ChatPage` and `UpdateProfile`. |
| `js/missing-token-validation` | 1 | The refresh cookie is `SameSite=Lax` and both endpoints that read it are POST, so a browser will not attach it cross-site. Every other endpoint authenticates from the `Authorization` header, which a third-party page cannot set. Tests assert that the cookie alone authenticates nothing. |
| `js/insufficient-password-hash` | 1 | `server/utils/breachedPassword.ts` hashes a new password with SHA-1 to look it up in Have I Been Pwned, whose range API is keyed by SHA-1; only the first five characters of the hash are sent. Nothing is stored; passwords are stored as bcrypt hashes. Recorded 1 October 2026. |

**`js/sql-injection` was fixed in code.** The schemas narrow request values
several call frames before the query, beyond what the analyser follows, so the
code also narrows at the sink. Request-derived values in a query are wrapped in
`String(x)` or `Number(x)`: `String({ $ne: null })` is `"[object Object]"` and
`Number({ $gt: 0 })` is `NaN`, neither of which Mongo treats as an operator.
`otpStore`, nine of the alerts, keys records by an HMAC of the address, so no
request value reaches its query and the collection does not record who asked
for a code.

```text
                               before   22 Sep   current
js/sql-injection                   25        0         0
js/xss-through-dom                  3        3         3
js/missing-token-validation         1        1         1
js/insufficient-password-hash       -        -         1
                               ------   ------    ------
                                   29        4         5
```

**Dismissing.** Filter by **Rule** in the Security tab and dismiss each group
as **False positive** with the reason above. The rules stay enabled, since a
query filter would hide a real injection as readily as a false one. A large
refactor can change an alert's fingerprint and reopen it.

**Re-measuring.** The CLI bundle is a 663 MB download and a run takes about
ninety seconds. Analyse a copy of the working tree, not a `git clone`, which
would measure the last commit.

```bash
curl -sL -o codeql.tar.gz https://github.com/github/codeql-action/releases/download/codeql-bundle-v2.27.0/codeql-bundle-win64.tar.gz
tar -xzf codeql.tar.gz
./codeql/codeql database create db --language=javascript-typescript --source-root=<a copy without node_modules>
./codeql/codeql database analyze db javascript-code-scanning.qls --format=sarif-latest --output=out.sarif
```

---

## 1 · Automated tests

Tests underpin every later task: the defects in the initial audit (a 404 on
`/cart/clear` after checkout, an authentication bypass, PII readable by anyone)
were invisible to lint, build and CodeQL. The stack is Vitest 5 in both
packages, Supertest 7 against `createApp()`, mongodb-memory-server 11 for a
real MongoDB with no external service, and Testing Library 16 with jsdom.

- **Server:** the authorisation matrix (`401` anonymous, `403` wrong role or
  cross-user, forged tokens rejected), ownership, the cart lifecycle, stock
  reservation and the oversell `409`, NoSQL injection payloads, and profile PII
  scoping. `server/tests/regressions.test.ts` pins every audit defect.
- **Client:** `safeImageSrc`, session helpers, `apiFetch`, the error boundary,
  and page-level tests for the homepage, catalogue, listing forms and admin.
- One `mongodb-memory-server` per run, started in `globalSetup` with
  `launchTimeout: 60000` (the 10 s default can time out on Windows); CI caches
  the binary. No coverage threshold gates the build, so a red CI always means a
  failing behaviour.

The suite landed with 66 server and 44 client tests (about 14 s).

---

## 7 · Docker Compose

`docker compose up` runs MongoDB, the API and the client with no local Node or
MongoDB, and reproduces a production-like build locally.

- **`docker-compose.yml`** (development): nodemon and the Vite dev server, the
  source bind-mounted, and a named database volume.
- **`docker-compose.prod.yml`** (production-like): the bundle served by nginx,
  the API unprivileged with a health check on `/health`.
- Multi-stage Dockerfiles with `.dockerignore`. `docker compose run --rm seed`
  loads demo accounts and a catalogue; `docker compose run --rm test` runs the
  server suite.
- `NODE_ENV` is set only in final stages, so dependency stages keep
  devDependencies. Watchers poll in the containers, as Windows filesystem
  events do not reach Linux containers. `mongodb-memory-server` has no Alpine
  build, so in Compose the suite uses `MONGO_TEST_URI`; the host still uses the
  in-memory server.

---

## 5 · Structured logging and error tracking

- `pino` and `pino-http`, with `pino-pretty` in development. `LOG_LEVEL`
  defaults to `info` in production and `debug` in development.
- All 27 application `console` calls are named child loggers;
  `scripts/seed.ts`, a CLI, keeps `console` by design.
- Each request has a correlation id, returned as `X-Request-Id` and reused from
  an upstream proxy. The access log skips health checks and records
  `req.originalUrl`, since Express rewrites `req.url` under a router.
- `Authorization`, cookies, passwords, OTP codes and tokens are redacted.
- Sentry is optional: without `SENTRY_DSN` nothing leaves the process. On the
  client, an error boundary renders a recovery page.

---

## 3 · Request validation with Zod

Every endpoint validates body, query and params through
`middleware/validate.ts` with schemas in `server/schemas/`. Failures share one
shape:

```json
{ "message": "Validation failed", "errors": [{ "path": "email", "message": "Invalid email" }] }
```

- Zod's `.string()` and `.number()` keep operator objects such as
  `{"$ne": null}` out of Mongoose queries, with clear errors.
  `utils/sanitize.js` and its 31 call sites were retired;
  `middleware/sanitizeRequest.ts` remains as defence in depth.
- `z.infer` provides static types, which is why this preceded TypeScript.
- The multipart `POST /user/add-book` has a schema that also normalises
  `category` to an array and `pages` and `price` to numbers.
- Express 5 defines `req.query` as a getter, so parsed values are assigned with
  `Object.defineProperty`; a test guards it.
- `z.coerce.number()` accepts `[]` (`Number([]) === 0`), so numeric primitives
  narrow through a union first.
- An operator object in `filter_input` returns `400` with the reason.

---

## 2 · Refresh tokens and logout

Access tokens last 15 minutes (previously 7 days, unrevocable). Sessions use
an opaque refresh token, stored only as a SHA-256 hash with an expiry, rotated
on every use, and sent in an httpOnly cookie scoped to `/api/auth`. Presenting
an exchanged token revokes the whole family. `POST /auth/logout` revokes the
session; a password reset revokes all of the account's sessions. The client
retries a `401` once through `/auth/refresh`, sharing one in-flight refresh so
a busy page does not trip reuse detection.

**Same-origin.** An httpOnly refresh cookie works cleanly, and stays
first-party for Safari ITP, only when client and API share an origin. Both
shapes are tested:

| Shape | How |
| --- | --- |
| **Proxy** | The Vite dev server or nginx proxies the API prefixes. |
| **Single service** | `SERVE_CLIENT=true` makes Express serve `client/dist`, falling through to `index.html`. Used on Render; chosen over a Static Site with an `/api/*` rewrite as the simpler shape, with no CORS. |

With `SERVE_CLIENT` on and no bundle on disk, the API reports it at start-up.
The nginx stack sets `SERVE_CLIENT: 'false'` explicitly.

---

## 4 · Image storage on Cloudinary

Base64 covers grow documents towards MongoDB's 16 MB limit and cannot be
cached. List endpoints project `images: { $slice: 1 }`, as lists render only
the first cover: on 40 books with five covers each, **23.45 MB → 4.70 MB**.

Cloudinary is optional; with `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and
`CLOUDINARY_API_SECRET` unset, covers are stored inline and a fresh clone runs
without an account. When configured:

- the browser uploads directly with a signature from the API (the SDK's
  `api_sign_request`, verified against the live API), so image bytes never
  pass through the server;
- documents store the URL and `public_id`, and deleting a listing deletes its
  assets;
- each submitted URL must belong to this account's delivery host, and
  `safeImageSrc` still treats it as untrusted;
- a re-runnable script migrates existing base64 records.

Models register through a `mongoose.models.X ||` guard so tests can re-import
them after `vi.resetModules()`.

---

## 6 · TanStack Query

`eslint-plugin-react-hooks` v7 flagged the `useEffect` → `fetch` → `setState`
pattern 17 times across 15 files. Fetching now goes through
`@tanstack/react-query`, and lint reports zero warnings with
`react-hooks/set-state-in-effect` and `react-hooks/immutability` at `error`.

- `hooks/queries.ts` holds every query and mutation, with cache keys in one
  place. Derived state is computed during render.
- Pages that set state in `.then()` (not flagged by the rule) also use the
  shared queries: `admin/TransactionHistory`, `Profile`, `UpdateProfile`,
  `Cart`, `Wishlist`, `Filter`, `BookView` and both order-tracking pages. One
  request serves each resource across pages, and one invalidation updates all.
- By design, `ChatPage` and `ChatWindow` fetch directly (paged history, live
  socket updates), as do the three checkout writes in `Payment`.

**API under `/api`.** On one origin, `/cart`, `/wishlist`, `/book`, `/chat` and
`/filter` would each be both a page and an endpoint. The API is namespaced
under `/api`, and the refresh cookie scoped to `/api/auth` to match.

---

## 8 · TypeScript

Every source file in both packages is TypeScript under `strict`.

| | Server | Client |
| --- | --- | --- |
| Checked by | `tsc --noEmit`, tests included | `tsc --noEmit`, tests included |
| Built by | `tsc -p tsconfig.build.json` → `dist/` | Vite (strips types, does not check) |
| Run in development by | nodemon + `tsx` | the Vite dev server |
| Run in production by | `node dist/index.js` | nginx, or the API with `SERVE_CLIENT` |

Relative imports keep their `.js` extension (`./app.js` for `app.ts`), as the
specifier names the emitted module.

**The contract.** `server/shared/api.d.ts` declares every request and response.
Both packages compile against it, so a shape cannot change on one side alone,
and as a declaration file it adds no runtime dependency. `schemas/index.ts`
exports a `z.infer` type per endpoint, and `types/contracts.ts` asserts at
compile time that everything the client may send is accepted by its schema.

**Mismatches resolved during the migration**, none detectable by lint, tests or
CodeQL:

- The tracking pages read the order back after a status change, and take the
  role from the session's `userRole`.
- The catalogue table shows the seller's `username`.
- `AddBook`'s `InputField` forwards `min` and `step`.
- Removed: a `':hover'` key in an inline style, fields Mongoose drops silently
  (`quantity` on `POST /purchase`, `country` in the seed), and the unused
  `RefreshToken.isUsable()`.
- The `/user/signup` and `/user/signin` aliases run the same Zod schemas as
  `/auth`.
- The catalogue's rating controls had no data behind them; reviews were built
  to supply it (see [`AUDIT.md`](AUDIT.md#ratings-and-reviews)).

**Implementation notes.** The access-log serializer reads `req.remoteAddress`,
correct because pino-http passes custom serializers the serialised request; a
test pins it. `config/paths.ts` finds the package root by walking up to
`package.json`, so paths resolve identically from source and from `dist/`.
`noUncheckedIndexedAccess` is off by design: most indexes are `map` callbacks
and lookups of keys just set.

---

## Working agreement

- One task per commit, each self-contained and revertible.
- Before every commit: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build`, and a CodeQL run for changes to request handling. Only
  `npm run typecheck` checks types; `tsx` and Vite strip them.
- New environment variables go in the matching `.env.example` and the README
  table, and new endpoints in the README API reference, in the same commit.
