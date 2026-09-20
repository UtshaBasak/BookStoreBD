# Upgrade roadmap

Eight upgrades that move BookStoreBD closer to how a comparable service would
be built and run in industry. Each is self-contained and lands as its own
commit, so any one of them can be reverted without unpicking the others.

**Current baseline.** Lint, build and boot are green from a clean `npm ci`;
all three package roots report zero dependency vulnerabilities; CodeQL reports
five findings, all confirmed false positives in the same rule
(`js/xss-through-dom`). Authentication and authorisation are enforced
server-side. There are **no automated tests** — which is why that is task 1.

---

## Sequence

Ordered for a local-first goal: the project should run smoothly on a laptop
before any deployment work resumes.

| Order | Task | Phase | Depends on | Risk |
| ----: | ---- | ----- | ---------- | ---- |
| 1 | [Automated tests](#1--automated-tests) | Foundation | — | Low |
| 2 | [Docker Compose](#7--docker-compose) (task 7) | Foundation | — | Low |
| 3 | [Structured logging](#5--structured-logging-and-error-tracking) (task 5) | Foundation | — | Low |
| 4 | [Zod validation](#3--request-validation-with-zod) (task 3) | Hardening | 1 | Medium |
| 5 | [Refresh tokens](#2--refresh-tokens-and-logout) (task 2) | Hardening | 1 | High |
| 6 | [Cloudinary image storage](#4--move-images-out-of-mongodb-cloudinary) (task 4) | Larger | 1 | Medium |
| 7 | [TanStack Query](#6--tanstack-query-and-the-17-lint-warnings) (task 6) | Larger | 1 | Medium-high |
| 8 | [TypeScript](#8--typescript) | Larger | 1, 4 | High volume |

Task numbers are stable throughout this document — only the running order
differs from the numbering.

---

## 1 · Automated tests

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

**Done when** `npm test` runs both suites from the repository root, CI fails
on a red test, and every defect found in the audit has a regression test.

---

## 7 · Docker Compose

*Runs second — it is the local-smoothness goal itself.*

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

---

## 5 · Structured logging and error tracking

*Runs third — low risk, quick, and it makes everything after it easier to
debug.*

**Scope**

- `pino` + `pino-http`, with a per-request id and `Authorization` redacted
- `pino-pretty` for development output only
- Replace the remaining ad-hoc `console.log` / `console.error` calls
- Sentry for unhandled server errors and a React error boundary on the client

Log levels via `LOG_LEVEL`, defaulting to `info` in production and `debug` in
development.

---

## 3 · Request validation with Zod

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

---

## 2 · Refresh tokens and logout

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

---

## 4 · Move images out of MongoDB (Cloudinary)

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
