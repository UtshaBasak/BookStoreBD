# Upgrade roadmap

Eight upgrades that move BookStoreBD closer to how a comparable service would
be built and run in industry. Each is self-contained and lands as its own
commit, so any one of them can be reverted without unpicking the others.

**Current baseline.** Lint, build and boot are green from a clean `npm ci`;
all three package roots report zero dependency vulnerabilities; CodeQL reports
five findings, all confirmed false positives in the same rule
(`js/xss-through-dom`). Authentication and authorisation are enforced
server-side, sessions use short access tokens with rotating refresh tokens, and
every endpoint validates its input against a Zod schema. Six of the eight tasks
are complete: **200 tests** (146 server, 54 client) gate every push, `docker
compose up` brings the whole stack up with no local Node or MongoDB install,
the API emits structured logs with a correlation id per request, and book
covers can be hosted on a CDN instead of living in the database.

---

## Sequence

Ordered for a local-first goal: the project should run smoothly on a laptop
before any deployment work resumes.

| Order | Task | Phase | Depends on | Risk |
| ----: | ---- | ----- | ---------- | ---- |
| ~~1~~ | ~~[Automated tests](#1--automated-tests)~~ **done** | Foundation | — | Low |
| ~~2~~ | ~~[Docker Compose](#7--docker-compose)~~ (task 7) **done** | Foundation | — | Low |
| ~~3~~ | ~~[Structured logging](#5--structured-logging-and-error-tracking)~~ (task 5) **done** | Foundation | — | Low |
| ~~4~~ | ~~[Zod validation](#3--request-validation-with-zod)~~ (task 3) **done** | Hardening | 1 | Medium |
| ~~5~~ | ~~[Refresh tokens](#2--refresh-tokens-and-logout)~~ (task 2) **done** | Hardening | 1 | High |
| ~~6~~ | ~~[Cloudinary image storage](#4--move-images-out-of-mongodb-cloudinary)~~ (task 4) **done** | Larger | 1 | Medium |
| 7 | [TanStack Query](#6--tanstack-query-and-the-17-lint-warnings) (task 6) | Larger | 1 | Medium-high |
| 8 | [TypeScript](#8--typescript) | Larger | 1, 4 | High volume |

Task numbers are stable throughout this document — only the running order
differs from the numbering.

---

## 1 · Automated tests — done

*Landed. 66 server tests and 44 client tests, ~14s, wired into CI.*

The single biggest gap. Every bug found during the recent audit — a 404 on
`/cart/clear` after checkout, an authentication bypass, PII readable by
anyone — would have been caught by a test, and none were caught by lint,
build or CodeQL.

**Stack**

| Tool | Version | Role |
| ---- | ------- | ---- |
| Vitest | 5.x | Runner for both packages (supports Vite 8) |
| Supertest | 7.x | HTTP assertions against `createApp()` |
| mongodb-memory-server | 11.x | Real MongoDB per test run, no external service |
| @testing-library/react + jsdom | 16.x | Component tests |

**Server coverage, in priority order**

- Auth matrix — token issued on sign-in, `401` anonymous, `403` wrong role,
  `403` cross-user, forged token rejected
- Ownership — a seller cannot touch another seller's listing; a buyer cannot
  read another buyer's order; a non-participant cannot read a conversation
- Cart lifecycle including `/cart/clear`
- Order stock reservation and the oversell `409`
- NoSQL injection payloads rejected on body and query
- Profile PII scoping: owner sees contact details, nobody else does

**Client coverage**

- `safeImageSrc` scheme validation
- `auth.js` session helpers
- `apiFetch` attaches the bearer token and clears the session on `401`
- Smoke render of two or three pages

**Notes**

- `mongodb-memory-server` has been observed timing out at its default 10s
  launch on Windows. Use a `globalSetup` that starts **one** instance for the
  whole run with `launchTimeout: 60000`, rather than one per file.
- The mongod binary is downloaded on first use; cache it in CI.
- Add the test step to both CI jobs. Do not gate on coverage thresholds
  initially — a failing build over a coverage percentage on day one trains
  people to ignore CI.

**Done.** `npm test` runs both suites from the repository root, CI fails on a
red test, and `server/tests/regressions.test.js` covers every defect found in
the audit: the missing `/cart/clear`, the oversell race, the authentication
bypass, the profile PII leak, and the two chat endpoints that used to fail
outright.

Not covered yet, and worth adding as the code changes: page-level component
tests beyond the smoke level, and the OTP e-mail flow, which needs the SMTP
transport stubbed.

---

## 7 · Docker Compose — done

*Landed. `docker compose up` brings up MongoDB, the API and the client; both
stacks were built and exercised end to end.*

`docker compose up` brings up MongoDB, the API and the client together, so
setup stops depending on what happens to be installed on a given machine.

**Scope**

- `docker-compose.yml` — `mongo`, `server`, `client`, with a named volume for
  database persistence and a health check on `/health`
- `server/Dockerfile` and `client/Dockerfile` (multi-stage: build, then serve
  the static bundle)
- `.dockerignore` for both
- `server/scripts/seed.js` — sample books, a buyer, a seller and an admin, so
  a fresh database is immediately usable
- README section for the Docker path alongside the existing npm path

**Why it is worth doing before deployment work.** A reproducible
production-like build locally is the most effective tool for diagnosing the
Render failure, because it removes "works on my machine" from the equation.

**Done.** Two stacks: `docker-compose.yml` for development (nodemon and the
Vite dev server, source bind-mounted) and `docker-compose.prod.yml` for a
production-like build (the bundle served by nginx, the API unprivileged with a
health check). `docker compose run --rm seed` loads demo accounts and a
catalogue; `docker compose run --rm test` runs the server suite.

Three things only surfaced by actually running it:

- `NODE_ENV=production` in the shared base stage reached the dependency stages,
  so `npm ci` skipped devDependencies and the dev image had no nodemon.
- Filesystem events raised on a Windows host do not reach a Linux container, so
  neither watcher reloaded. Both now poll, enabled only inside the containers.
- `mongodb-memory-server` has no mongod build for Alpine's musl libc, so the
  suite takes `MONGO_TEST_URI` and points at the stack's MongoDB instead.

Baseline note: the host test path is unchanged and still uses the in-memory
server.

---

## 5 · Structured logging and error tracking — done

*Landed. One structured line per request with a correlation id, secrets
redacted, and optional Sentry reporting.*

**Scope**

- `pino` + `pino-http`, with a per-request id and `Authorization` redacted
- `pino-pretty` for development output only
- Replace the remaining ad-hoc `console.log` / `console.error` calls
- Sentry for unhandled server errors and a React error boundary on the client

Log levels via `LOG_LEVEL`, defaulting to `info` in production and `debug` in
development.

**Done.** All 27 `console` calls in the application replaced with named child
loggers. Each request carries a correlation id, returned as `X-Request-Id` and
reused if an upstream proxy supplied one. `Authorization`, cookies, passwords,
OTP codes and tokens are redacted before anything is written. Health checks are
excluded from the access log. Sentry is wired but entirely optional: with no
`SENTRY_DSN` nothing is initialised and nothing leaves the process. On the
client, an error boundary replaces the blank white page a render error used to
produce.

One bug found by reading the real output: the access log said `GET /` for every
routed request, because Express rewrites `req.url` relative to a router's mount
point. It uses `req.originalUrl` now, and a test pins it.

`scripts/seed.js` deliberately keeps `console`, being a CLI whose output is read
by a person.

---

## 3 · Request validation with Zod — done

*Landed. Every endpoint validates body, query and params; `utils/sanitize.js`
is gone.*

One schema per endpoint, applied by a `validate` middleware, returning a
consistent shape:

```json
{ "message": "Validation failed", "errors": [{ "path": "email", "message": "Invalid email" }] }
```

**Scope**

- `zod` 4.x, `server/middleware/validate.js`, `server/schemas/<domain>.js`
- Wire into every route that reads a body, query or param

**This partly replaces existing code, deliberately.** The current
`utils/sanitize.js` helpers (`asTrimmedString`, `asNonNegativeInt`) exist to
narrow request values so a `{"$ne": null}` object can never reach a Mongoose
query. Zod's `.string()` and `.number()` give the same guarantee with far
better error messages, so most of `sanitize.js` retires once schemas are in
place. `middleware/sanitizeRequest.js` stays as defence in depth.

Schemas also produce static types through `z.infer`, which is why this comes
before TypeScript.

**Done.** `middleware/validate.js` plus `schemas/common.js` and
`schemas/index.js`. All 31 `asTrimmedString` calls removed and
`utils/sanitize.js` deleted; `middleware/sanitizeRequest.js` stays as defence
in depth.

Two traps found while building it:

- Express 5 defines `req.query` as a getter, so `req.query = parsed` is
  silently discarded — validation would pass while handlers kept reading raw
  values. The middleware uses `Object.defineProperty`, and a test fails if that
  regresses.
- `z.coerce.number()` accepts `[]`, because `Number([]) === 0`, so `stock: []`
  would have quietly become 0. The numeric primitives narrow through a union
  first.

One deliberate behaviour change: an operator object in `filter_input` used to
coerce to an empty string and return `200` with no results. It now returns
`400`, which is equally safe and tells the caller why.

---

## 2 · Refresh tokens and logout — done

*Landed. 15-minute access tokens, rotating refresh tokens in an httpOnly
cookie, replay detection, and a real logout — all same-origin.*

Today a single access token lives for seven days and cannot be revoked. There
is no real logout — the client just forgets the token.

**Target**

- Access token, 15 minutes
- Refresh token: opaque random value, stored hashed in a `RefreshToken`
  collection with an expiry, rotated on every use
- Reuse detection — presenting a rotated token revokes the whole family
- `POST /auth/refresh` and a real `POST /auth/logout`
- Client interceptor retries a `401` once through `/auth/refresh`

### Same-origin decision

An httpOnly refresh cookie is the secure option, and it only works
comfortably when the browser sees the client and API as one origin.
**Same-origin was chosen**, so this task carries a deployment-shape change.
Two ways to get there on Render:

| Approach | How | Trade-off |
| -------- | --- | --------- |
| **Express serves the client** *(recommended)* | The API also serves `client/dist` and falls through to `index.html`. One Render Web Service. | Simplest — one service, no CORS at all, cookies work with `SameSite=Lax`. Client and API deploy together. |
| **Static Site with a rewrite** | Render Static Site rewrites `/api/*` to the API service. | Keeps the two services separate and the CDN in front of the client; one more piece of routing config. |

Locally, the same shape is reproduced with a Vite dev-server proxy, so
development matches production instead of relying on CORS.

Because the cookie is now first-party, the Safari ITP problem that made the
cross-site variant risky does not arise.

**Risk is highest of the eight** — a mistake signs everyone out, or worse,
fails to sign anyone out. Do it after tests exist.

**Done.** Access tokens dropped from 7 days to 15 minutes; sessions are kept
alive by an opaque refresh token stored only as a SHA-256, rotated on every
use, in an httpOnly cookie scoped to `/auth`. Presenting an already-exchanged
token revokes the whole family. `/auth/logout` revokes and clears; a password
reset revokes every session for the account.

Same-origin was reached through the proxy route rather than by folding the
client into the API image: the Vite dev server proxies the API prefixes in
development and nginx does in the production stack, so the browser only ever
sees one origin. `SERVE_CLIENT=true` additionally makes Express serve
`client/dist` for a single-service deployment; both shapes were exercised.

Two things worth recording:

- The client shares one in-flight refresh across concurrent requests. Without
  that, a page firing several requests at once would trigger several refreshes,
  the second would present an already-rotated token, and the reuse detection
  would sign the user out for loading a busy page.
- `client/dist` is not inside the server image, so the first attempt at
  same-origin quietly did nothing in Docker — `GET /` returned 404 while the
  tests passed. Serving the client is now gated behind an explicit
  `SERVE_CLIENT` switch rather than an `existsSync` check, so behaviour no
  longer depends on whether a build happens to be on disk.

---

## 4 · Move images out of MongoDB (Cloudinary) — done

*Landed. Signed direct uploads, ownership-checked URLs, asset cleanup on
delete, and a re-runnable migration.*

Book covers are currently base64 data URIs stored on the document.

**Two separate problems**

1. ~~A performance bug that can be fixed immediately.~~ **Done ahead of this
   task.** `GET /book` returned every book with all of its base64 covers
   inline. List endpoints now project `images: { $slice: 1 }`, since every
   list view renders only the first cover; the detail endpoint still returns
   the full set. Measured on 40 books with 5 covers each: **23.45 MB → 4.70 MB**.
   Dropping images entirely was not an option — `Homepage.jsx` and
   `Filter.jsx` render `book.images[0]` straight from the list response.
2. Documents approach the 16 MB MongoDB limit, nothing is CDN-cached, and the
   database carries binary weight it should not.

**Target** — Cloudinary (chosen for its free tier and simple direct upload):

- Signed direct upload from the browser; the API returns only a signature, so
  image bytes never pass through the server
- Documents store the URL and `public_id`
- Deleting a listing deletes its Cloudinary assets
- A migration script converts existing base64 records and is safe to re-run
- `safeImageSrc` validation stays — the stored URL is still untrusted input

New environment variables: `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`.

**Done.** Entirely optional: with none of them set the app stores covers inline
exactly as before, so a fresh clone still runs with no account.

Worth recording:

- Cloudinary's own docs describe the signing rule — sorted params, secret
  appended, then hash — but never say *which* hash. It is SHA-1, confirmed
  empirically. The SDK's `api_sign_request` does the signing either way, which
  is the point of not hand-rolling it.
- The client tells the server which URL to store, so each one is checked
  against this account's delivery host. Without that a caller could pin any URL
  to a listing and have it rendered to every visitor.
- Verified against the real Cloudinary API with a placeholder secret: the
  rejection quotes the string to sign, which matched exactly. Only the secret
  was wrong, which is what proves the rest right.
- `vi.resetModules()` in the tests surfaced that most models registered
  unguarded, so re-importing one threw `OverwriteModelError`. Two already used
  the `mongoose.models.X ||` guard; all nine now do.

---

## 6 · TanStack Query and the 17 lint warnings

Every page fetches with `useEffect` → `fetch` → `setState`. That pattern is
what `eslint-plugin-react-hooks` v7 flags 17 times across 15 files, currently
demoted to warnings so CI can pass.

**Scope**

- `@tanstack/react-query`, one provider at the root
- Replace the effect-based fetching page by page, roughly 15 files
- Gains caching, request de-duplication, and real loading and error states,
  while deleting a good deal of boilerplate
- Promote `react-hooks/set-state-in-effect` and `react-hooks/immutability`
  back to `error` once the count reaches zero

**Done when** `npm run lint` reports zero warnings with both rules at
`error`.

---

## 8 · TypeScript

Largest effort, largest payoff for how the project reads to an outside
reviewer. Incremental, never a big-bang rewrite.

**Order**

1. `allowJs: true`, `checkJs: false` — compiles, changes nothing
2. Server: models → utils → middleware → controllers → routes
3. A shared module for API request and response types
4. Client: `utils` → `config` → `components` → `pages`
5. Tighten to `strict` once the surface is converted

Zod schemas from task 3 provide inferred types rather than hand-written
duplicates. Vitest runs TypeScript without extra configuration.

---

## Working agreement

- One task per commit, each self-contained and revertible.
- Before every commit: `npm run lint`, `npm run build`, `npm test`, and a
  CodeQL run for anything touching request handling.
- New environment variables land in the matching `.env.example` **and** the
  README table in the same commit.
- New endpoints land in the README API reference in the same commit.

Deployment work stays paused until the project runs cleanly end to end
locally. Tasks 2 and 7 change the deployment shape, so Render configuration is
best revisited after both are done.
