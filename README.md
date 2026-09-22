<div align="center">

# 📚 BookStoreBD

**A MERN marketplace for new and second-hand books — with role-based access, order tracking and real-time buyer–seller chat.**

[![CI](https://github.com/UtshaBasak/MernBookstore/actions/workflows/ci.yml/badge.svg)](https://github.com/UtshaBasak/MernBookstore/actions/workflows/ci.yml)
[![CodeQL](https://github.com/UtshaBasak/MernBookstore/actions/workflows/codeql.yml/badge.svg)](https://github.com/UtshaBasak/MernBookstore/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.13%2B%20%7C%2024%20LTS-brightgreen.svg)](.nvmrc)

[Report a bug](https://github.com/UtshaBasak/MernBookstore/issues/new?template=bug_report.md) · [Request a feature](https://github.com/UtshaBasak/MernBookstore/issues/new?template=feature_request.md)

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Running with Docker](#running-with-docker)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Image hosting](#image-hosting)
- [Observability](#observability)
- [Testing](#testing)
- [API reference](#api-reference)
- [Real-time events](#real-time-events)
- [Data models](#data-models)
- [Deployment](#deployment)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

BookStoreBD is a full-stack marketplace where readers in Bangladesh can buy and sell
both new and used books. It ships three distinct experiences from one codebase:

| Role       | What they can do                                                                 |
| ---------- | -------------------------------------------------------------------------------- |
| **Buyer**  | Browse and filter the catalogue, keep a wishlist and cart, check out, track orders, request returns, and chat with sellers |
| **Seller** | List books with photos and condition details, manage stock and pricing, view orders, and answer buyer messages |
| **Admin**  | Manage users, review every order, moderate listings, and approve or reject return requests |

---

## Features

### Authentication and access control

- Email/password sign-up and sign-in, with passwords hashed using `bcryptjs`
- Stateless JWT sessions; every protected endpoint verifies the token server-side
- Role-based authorisation (`user` / `admin`) plus per-resource ownership checks
- Email verification and password reset via one-time codes delivered over SMTP
- Client route guards for rendering, backed by the server as the real boundary

### Catalogue

- Full book listings with author, publisher, ISBN, language, page count and condition
- Category filtering and case-insensitive title search
- Multi-image upload, stored as base64 data URIs on the document
- Stock tracking, with out-of-stock titles automatically dropped from every cart

### Commerce

- Wishlist and cart, both scoped per user
- Checkout capturing delivery division, district, address, contact and payment method
- Promo codes, shipping charges and discounts applied at the order level
- A 16-character order number shared by every line item in a single order
- Order tracking for buyers, sellers and admins, each with its own view
- Return requests with a defect description and supporting photos

### Real-time chat

- Buyer–seller messaging over Socket.IO, with room-based delivery
- Text and image messages, unread counts, and read receipts
- Conversation history with pagination

---

## Tech stack

| Layer        | Technology                                              |
| ------------ | ------------------------------------------------------- |
| Language     | TypeScript 5, strict mode, across both packages          |
| Frontend     | React 19, React Router 7, Vite 8, Tailwind CSS 4         |
| Data fetching| TanStack Query                                           |
| Backend      | Node.js, Express 5                                       |
| Database     | MongoDB with Mongoose 9                                  |
| Real-time    | Socket.IO 4                                              |
| HTTP clients | Axios and the native `fetch` API                         |
| Uploads      | Cloudinary direct upload, Multer fallback                |
| Validation   | Zod schemas on every request                             |
| Hardening    | express-rate-limit, request sanitisation                 |
| Email        | Nodemailer                                               |
| Tooling      | ESLint 10 + typescript-eslint, GitHub Actions, CodeQL    |

---

## Architecture

```text
┌──────────────────┐   REST over HTTPS   ┌──────────────────┐        ┌───────────┐
│                  │ ──────────────────► │                  │        │           │
│   React client   │                     │   Express API    │ ─────► │  MongoDB  │
│   (Vite SPA)     │ ◄────────────────── │                  │        │  (Atlas)  │
│                  │                     │                  │        │           │
└────────┬─────────┘                     └─────────┬────────┘        └───────────┘
         │                                         │
         │            WebSocket (Socket.IO)        │
         └─────────────────────────────────────────┘
```

The client never hardcodes the backend origin. Every request resolves through
[`client/src/config/api.ts`](client/src/config/api.ts), which reads `VITE_API_URL`
and falls back to the deployed API — so pointing the app at a local server is a
one-line change in `client/.env`.

On the server, [`app.ts`](server/app.ts) exports a side-effect-free `createApp()`
factory (no `listen`, no database connection), while [`index.ts`](server/index.ts)
owns the bootstrap: validate environment, connect to MongoDB, listen, attach
Socket.IO, and shut down gracefully on `SIGINT`/`SIGTERM`.

### One contract, two packages

[`server/shared/api.d.ts`](server/shared/api.d.ts) declares every request and
response shape the HTTP API uses. Both packages compile against that one file —
the server directly, the client through a `@shared/*` path in its `tsconfig.json`
— so a response cannot change on one side without the other failing to
type-check.

It is a declaration file on purpose: types and nothing else, erased entirely at
compile time. Neither package gains a runtime dependency on the other.

The request shapes are not written twice either.
[`server/types/contracts.ts`](server/types/contracts.ts) asserts at compile time
that everything the client may send is something the endpoint's Zod schema will
accept, so tightening a schema without updating the contract fails the build
rather than a request in production.

---

## Project structure

```text
MernBookstore/
├── client/                      # React + Vite single-page app
│   ├── public/                  # Static assets served as-is
│   ├── src/
│   │   ├── components/          # Reusable UI (chat window, table, spinner…)
│   │   ├── config/
│   │   │   ├── api.ts           # API origin + authenticated fetch/axios
│   │   │   └── queryClient.ts   # TanStack Query defaults
│   │   ├── hooks/
│   │   │   └── queries.ts       # One place for every query and mutation
│   │   ├── pages/               # Route-level screens
│   │   │   ├── admin/           # Admin-only screens
│   │   │   └── buyer/           # Buyer-only screens
│   │   ├── styles/              # Shared stylesheets
│   │   ├── utils/               # Socket.IO singleton, safe image sources
│   │   ├── App.tsx              # Router and route guards
│   │   └── main.tsx             # React entry point
│   ├── .env.example
│   ├── eslint.config.js
│   ├── index.html
│   ├── tsconfig.json            # Type-check settings (Vite does the building)
│   └── vite.config.ts
│
├── server/                      # Express REST API + Socket.IO gateway
│   ├── config/
│   │   ├── cors.ts              # Origin allow-list
│   │   ├── database.ts          # Mongoose connection lifecycle
│   │   ├── env.ts               # Typed, validated environment config
│   │   ├── logger.ts            # pino instance and redaction rules
│   │   ├── paths.ts             # Package root, uploads and client bundle
│   │   └── sentry.ts            # Optional error reporting
│   ├── controllers/             # Request handlers, one per domain
│   ├── middleware/
│   │   ├── auth.ts              # Token verification, role and owner guards
│   │   ├── errorHandler.ts      # 404 + centralised error responses
│   │   ├── rateLimit.ts         # Per-IP request ceilings
│   │   ├── requestLogger.ts     # One line per request, with a request id
│   │   ├── validate.ts          # Zod validation for body, query and params
│   │   └── sanitizeRequest.ts   # Strips Mongo operator keys from input
│   ├── models/                  # Mongoose schemas, incl. RefreshToken
│   ├── routes/                  # Express routers, one per domain
│   ├── schemas/                 # One Zod schema per endpoint
│   │   ├── common.ts            # Shared primitives (email, objectId, ints)
│   │   └── index.ts             # Grouped by domain, plus inferred types
│   ├── scripts/
│   │   └── seed.ts              # Demo accounts and catalogue
│   ├── shared/
│   │   └── api.d.ts             # The wire contract, shared with the client
│   ├── sockets/
│   │   └── chatSocket.ts        # Socket.IO room and message handling
│   ├── tests/                   # Vitest + Supertest suites
│   │   ├── helpers/             # App bootstrap and data factories
│   │   └── setup/               # Shared in-memory MongoDB
│   ├── types/
│   │   ├── contracts.ts         # Compile-time schema/contract assertions
│   │   ├── express.d.ts         # req.user, set by the auth middleware
│   │   └── vitest.d.ts          # What globalSetup provides to the suites
│   ├── utils/
│   │   ├── error.ts             # Error factory used by controllers
│   │   ├── jwt.ts               # Access token signing and verification
│   │   └── refreshToken.ts      # Issue, rotate and revoke refresh tokens
│   ├── .env.example
│   ├── app.ts                   # createApp() factory
│   ├── index.ts                 # Bootstrap and graceful shutdown
│   ├── tsconfig.json            # Type-check settings, including the tests
│   └── tsconfig.build.json      # What `npm run build` compiles into dist/
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/               # CI and CodeQL
├── docker-compose.yml           # Dev stack: Mongo + API + Vite
├── docker-compose.prod.yml      # Production-like: Mongo + API + nginx
├── .editorconfig
├── .nvmrc
├── LICENSE
└── package.json                 # Root scripts that drive both packages
```

---

## Getting started

### Prerequisites

- **Node.js 24** (Active LTS) — `nvm use` picks it up from [`.nvmrc`](.nvmrc).
  Node 22.13+ also works; the floor is `^22.13.0 || >=24.0.0`, which is what
  Vitest and ESLint between them require. Node 20 reached end of life in
  April 2026 and is no longer supported here.
- **MongoDB** — a local instance or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- An **SMTP account** for one-time-code emails (Gmail works with an [App Password](https://support.google.com/accounts/answer/185833))

### 1. Clone and install

```bash
git clone https://github.com/UtshaBasak/MernBookstore.git
cd MernBookstore
npm install          # root tooling
npm run install:all  # client + server dependencies
```

### 2. Configure the environment

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Then fill in `server/.env` — at minimum `MONGO`, `JWT_SECRET`, `SMTP_USER` and
`SMTP_PASS`. Generate the secret with `openssl rand -hex 48`. The server
refuses to start, with a clear message, if `MONGO` or `JWT_SECRET` is missing
or if the secret is shorter than 32 characters.

### 3. Run both apps

```bash
npm run dev
```

| Service | URL                          |
| ------- | ---------------------------- |
| Client  | <http://localhost:5173>        |
| API     | <http://localhost:4000>        |
| Health  | <http://localhost:4000/health> |

To run them separately, use `npm run dev:server` and `npm run dev:client`.

---

## Running with Docker

Everything the project needs, without installing Node or MongoDB:

```bash
docker compose up --build            # MongoDB + API + client
docker compose run --rm seed         # sample accounts and catalogue
```

| Service | URL |
| ------- | --- |
| Client (Vite dev server) | <http://localhost:5173> |
| API | <http://localhost:4000> |
| MongoDB | `mongodb://localhost:27017/bookstorebd` |

The source is bind-mounted, so edits on the host reload inside the containers.
Both watchers are set to poll, because filesystem events raised on a Windows
host do not reach a Linux container.

After seeding, sign in as any of:

| Role | Email | Password |
| ---- | ----- | -------- |
| admin | `admin@bookstorebd.local` | `***REMOVED***` |
| seller | `seller@bookstorebd.local` | `***REMOVED***` |
| buyer | `buyer@bookstorebd.local` | `***REMOVED***` |

Other useful commands:

```bash
docker compose run --rm test   # the server suite, against the stack's MongoDB
docker compose logs -f server  # follow the API log
docker compose down            # stop, keeping the database
docker compose down -v         # stop and discard the database
```

### Production-like build

To check a real build rather than the dev servers — useful before deploying:

```bash
export JWT_SECRET=$(openssl rand -hex 48)
docker compose -f docker-compose.prod.yml up --build
```

The client is built and served by nginx on <http://localhost:8080> with an SPA
fallback, and the API runs unprivileged with `NODE_ENV=production` and a health
check. `JWT_SECRET` is required; Compose refuses to start without it.

---

## Environment variables

### `server/.env`

| Variable           | Required | Default                                                | Description                                             |
| ------------------ | :------: | ------------------------------------------------------ | ------------------------------------------------------- |
| `MONGO`            |    ✅    | —                                                      | MongoDB connection string                               |
| `PORT`             |          | `4000`                                                 | Port the API listens on                                 |
| `NODE_ENV`         |          | `development`                                          | `development` or `production`                           |
| `CORS_ORIGINS`     |          | `http://localhost:5173`                                | Comma-separated browser origins allowed to call the API |
| `JWT_SECRET`       |    ✅    | —                                                      | Signs access tokens; must be 32+ chars, else start fails |
| `JWT_EXPIRES_IN`   |          | `15m`                                                  | Access token lifetime                                   |
| `REFRESH_TOKEN_TTL_DAYS` |    | `30`                                                   | Refresh token lifetime                                  |
| `COOKIE_SECURE`    |          | on in production                                       | `Secure` flag on the refresh cookie                     |
| `COOKIE_SAME_SITE` |          | `lax`                                                  | `SameSite` on the refresh cookie                        |
| `SERVE_CLIENT`     |          | on in production                                       | Serve `client/dist` from the API process; warns at start-up if there is no build |
| `CLIENT_API_ORIGIN` |         | —                                                      | Cross-origin deployments only: added to the CSP `connect-src` so the browser may call the API |
| `PUBLIC_SITE_URL`  |          | the request's own origin                               | Canonical origin for the URLs in `robots.txt` and `sitemap.xml`. Set it once the domain is known, so a site answering on two hostnames advertises one |
| `CLOUDINARY_CLOUD_NAME` |     | —                                                      | Enables image hosting; unset keeps covers inline        |
| `CLOUDINARY_API_KEY` |       | —                                                      | Cloudinary API key                                      |
| `CLOUDINARY_API_SECRET` |    | —                                                      | Signs uploads. Secret — never commit                    |
| `ADMIN_EMAILS`     |          | —                                                      | Comma-separated e-mails promoted to admin on sign-in    |
| `SMTP_SERVICE`     |          | `gmail`                                                | Nodemailer service name                                 |
| `SMTP_USER`        |   ✅ ¹   | —                                                      | SMTP account used as the sender                         |
| `SMTP_PASS`        |   ✅ ¹   | —                                                      | SMTP password or app password                           |
| `LOG_LEVEL`        |          | `debug` dev / `info` prod                              | pino level; `silent` under test                         |
| `SENTRY_DSN`       |          | —                                                      | Enables error reporting; off entirely when unset        |
| `SENTRY_TRACES_SAMPLE_RATE` |  | `0`                                                    | Fraction of transactions traced                         |
| `SEED_PASSWORD`    |          | `***REMOVED***`                                         | Password given to the seeded demo accounts              |
| `MAX_UPLOAD_BYTES` |          | `5242880`                                              | Per-file upload ceiling (5 MB)                          |
| `MAX_UPLOAD_FILES` |          | `10`                                                   | Files accepted per multi-upload request                 |

¹ Required only for the OTP flows (sign-up verification and password reset).

### `client/.env`

| Variable       | Required | Default                            | Description         |
| -------------- | :------: | ---------------------------------- | ------------------- |
| `VITE_API_URL` |          | `https://bookstorebd.onrender.com` | Base URL of the API |

> Only variables prefixed with `VITE_` reach the browser bundle. Never put a
> secret in `client/.env`.

---

## Available scripts

Run these from the repository root:

| Script                | What it does                                          |
| --------------------- | ----------------------------------------------------- |
| `npm run install:all` | Installs dependencies in both `client/` and `server/` |
| `npm run dev`         | Runs the API and the client together                  |
| `npm run dev:server`  | Runs the API alone with hot reload (nodemon + tsx)    |
| `npm run dev:client`  | Runs the Vite dev server alone                        |
| `npm run build`       | Compiles the API to `server/dist` and bundles the client |
| `npm run build:server` / `build:client` | One package only                    |
| `npm run preview`     | Serves the built client locally                       |
| `npm start`           | Starts the API from `server/dist` (build first)       |
| `npm run typecheck`   | Type-checks both packages, tests included             |
| `npm run typecheck:server` / `typecheck:client` | One package only            |
| `npm run lint`        | Lints both packages                                   |
| `npm run lint:server` / `lint:client` | One package only                      |
| `npm test`            | Runs the server and client test suites                |
| `npm run test:server` | Server suite only                                     |
| `npm run test:client` | Client suite only                                     |
| `npm run test:watch`  | Re-runs on change (inside `client/` or `server/`)     |
| `npm run seed`        | Seeds demo data (`-- --reset` empties first)           |
| `npm run migrate:images` | Moves base64 covers to Cloudinary                   |

> The API runs from TypeScript sources in development — nodemon watches, `tsx`
> executes — and from the compiled output in production. `npm run typecheck` is
> what actually checks the types: neither `tsx` nor Vite does, they only strip
> them.

---

## Observability

The API logs one structured line per request through
[pino](https://getpino.io), pretty-printed while developing and newline-delimited
JSON everywhere else.

Every request carries a correlation id, returned as `X-Request-Id` and attached
to each line logged while handling it. An id supplied upstream is reused, so a
trace survives a proxy hop. A report of "it broke around 14:32" can then be tied
to an exact request instead of guessed at from timestamps.

`Authorization` headers, cookies, passwords, OTP codes and tokens are redacted
before anything is written — logs get shared in issues and pasted into chat far
more readily than a database does.

```jsonc
{"level":30,"time":"...","name":"auth","req":{"id":"6b1c…","method":"POST","url":"/auth/signin"},"res":{"statusCode":200},"msg":"POST /auth/signin 200"}
```

Health checks are excluded, since a container polls them constantly and they
say nothing useful. Set `LOG_LEVEL` to override the default for the
environment.

Unhandled 5xx errors are additionally reported to
[Sentry](https://sentry.io) when `SENTRY_DSN` is set. It is entirely optional —
with no DSN, nothing is initialised and nothing leaves the process.

On the client, an error boundary wraps the app, so a render error shows a
recovery screen rather than a blank white page.

---

## Image hosting

Book covers can be stored two ways, and the app picks automatically.

**Without `CLOUDINARY_*` set** — covers are stored as base64 on the document,
which is how the project started and what a fresh clone does. No account
needed.

**With `CLOUDINARY_*` set** — the browser uploads straight to Cloudinary and
only the URL is stored:

```
Browser ──"I want to upload"──▶ API        (signs the request)
Browser ◀──signature + timestamp── API
Browser ────────── file ──────────────────▶ Cloudinary
Browser ◀───────── URL + public_id ───────  Cloudinary
Browser ──"here is the URL"──▶ API         (stores the URL only)
```

The bytes never pass through the API, so a ten-image upload costs it two small
JSON requests instead of several megabytes of memory and request time.

A returned URL is checked against this account's delivery host before it is
stored. Without that, a caller could pin any URL they liked to a listing and
have it served to every visitor. Deleting a listing removes its assets, so the
account does not fill up with orphans.

To move existing records across:

```bash
npm run migrate:images:dry              # report only
npm run migrate:images -- --limit 10    # a cautious first batch
npm run migrate:images                  # the rest
```

PowerShell drops the `--` separator when it calls a native command, so
`-- --dry-run` never reaches the script there and the run silently becomes a
real one. That is what `migrate:images:dry` is for, and why `--limit` also
reads `MIGRATE_LIMIT`:

```powershell
npm run migrate:images:dry
$env:MIGRATE_LIMIT=10; npm run migrate:images
```

A run that is about to write says `LIVE RUN` and waits five seconds first, so
a lost flag is visible rather than silent.

It is idempotent, and a listing is only rewritten once every one of its uploads
has succeeded — an interrupted run leaves the original base64 intact rather
than a listing with half its covers missing.

---

## Testing

```bash
npm test              # both suites
npm run test:server   # server only
npm run test:client   # client only
```

| | Server | Client |
| --- | --- | --- |
| Runner | Vitest | Vitest |
| Environment | node | jsdom |
| HTTP | Supertest against `createApp()` | — |
| Database | `mongodb-memory-server` | — |
| Components | — | Testing Library |

The server suite runs against a **real MongoDB**, started once for the whole
run and shared by every file; each file connects to its own database on that
instance, so files stay independent and run in parallel. Nothing external
needs to be installed or running.

`tests/regressions.test.ts` is worth knowing about: every case in it maps to a
defect that actually shipped — the cart that stayed full after checkout, the
authentication bypass, contact details readable by anyone. A failure there
means a real bug has come back.

Both suites run in CI on every push and pull request.

The server suite is hermetic: `server/.env` is deliberately not read under
Vitest, and optional integration variables are cleared in each worker. A suite
that passed or failed depending on whether a developer had configured
Cloudinary would be worse than no suite at all.

---

## API reference

All endpoints live under **`/api`**, with `/health` at the root.

The namespace is not decoration: the client and API share an origin, and
`/cart`, `/wishlist`, `/book`, `/chat` and `/filter` are each both a page and
an endpoint. Without it a proxy cannot tell which one a request wants.

Base URL: `http://localhost:5173/api` in development (proxied), or
`http://localhost:4000/api` straight to the API.

All routes sit behind a per-IP rate limiter (see
[`server/middleware/rateLimit.ts`](server/middleware/rateLimit.ts)); `/auth` is
held to a tighter ceiling than the rest. Responses carry `RateLimit-*` headers,
and an exhausted limit returns `429`.

### Validation

Every endpoint validates its `body`, `query` and `params` against a Zod schema
before the handler runs, and the handler then works with the parsed result.

A failure returns `400` listing **every** problem, not just the first:

```json
{
  "message": "Validation failed",
  "errors": [
    { "path": "body.email", "message": "Must be a valid email address" },
    { "path": "body.password", "message": "Password must be at least 8 characters" }
  ]
}
```

Schemas also strip unknown keys, so a request body cannot smuggle extra fields
into a document, and type narrowing is what keeps query operators out of
Mongoose — a field declared `z.string()` can never arrive as `{ "$ne": null }`.

### Authentication

`POST /auth/signin` and `POST /auth/signup` return a short-lived access token
in the body, and set a refresh token in an httpOnly cookie:

```json
{ "token": "eyJhbGciOi...", "user": { "id": "...", "username": "...", "email": "...", "role": "user" } }
```

Send the access token on every protected request:

```
Authorization: Bearer <token>
```

| | Access token | Refresh token |
| --- | --- | --- |
| Lifetime | 15 minutes | 30 days |
| Stored | Response body, then `localStorage` | httpOnly cookie, scoped to `/auth` |
| Readable by page JavaScript | Yes | **No** |
| Revocable | No | Yes |

The split is the point. The access token cannot be revoked, so it is short.
The refresh token lives long enough to keep a session alive, and because it is
httpOnly an XSS bug cannot lift it. Only its SHA-256 is stored, so a database
dump yields nothing presentable to `/auth/refresh`.

`POST /auth/refresh` exchanges the cookie for a new access token and **rotates**
the refresh token. Presenting an already-exchanged token — the signature of a
stolen one — revokes the entire token family, ending that session everywhere.
`POST /auth/logout` revokes the family and clears the cookie. Resetting a
password revokes every session for the account.

The client refreshes automatically on a `401` and retries the original request,
sharing one refresh across concurrent requests so rotation cannot trip over
itself.

Cookies are first-party because the client and API share an origin: the Vite
dev server proxies the API in development, and nginx does in the production
compose stack. `SERVE_CLIENT=true` makes the API serve the built client itself,
for a single-service deployment — run `npm run build` in `client/` first, or the
API will start, warn that it found no bundle, and serve only itself.

The server resolves the caller from that token and **ignores any identity in
the request itself**. An `?email=` in a query string is supplied by the caller
and proves nothing, so it is never used to decide what you may see or change.

| Access level      | Applies to                                                                 |
| ----------------- | -------------------------------------------------------------------------- |
| **Public**        | `/health`, catalogue browsing (`/book`, `/filter/*`), `/auth/*`, a seller's public profile |
| **Authenticated** | Cart, wishlist, orders, chat, returns, purchases, profile updates, creating a listing |
| **Owner**         | Editing or deleting a listing (seller only), reading or updating an order (buyer or seller only), reading a conversation (participants only) |
| **Administrator** | Listing and deleting users, every order, approving returns                  |

A rejected token returns `401`; a valid token without the right role returns
`403`. The client clears the session and redirects to sign-in on a `401`.

Admins are identified by `role` on the user document. `ADMIN_EMAILS` promotes
listed accounts on their next sign-in, so an existing deployment gains its
administrator without a migration.

### Health

| Method | Endpoint  | Description                       |
| ------ | --------- | --------------------------------- |
| `GET`  | `/health` | Liveness probe and process uptime |

### Authentication — `/auth`

| Method | Endpoint               | Description                                             |
| ------ | ---------------------- | ------------------------------------------------------- |
| `POST` | `/auth/signup`         | Create an account (requires a verified OTP)             |
| `POST` | `/auth/signin`         | Sign in with email and password                         |
| `POST` | `/auth/send-otp`       | Send a one-time code (`purpose`: `register` or `reset`) |
| `POST` | `/auth/verify-otp`     | Verify a one-time code                                  |
| `POST` | `/auth/reset-password` | Reset a password using a valid OTP; ends every session   |
| `POST` | `/auth/refresh`        | Rotate the refresh cookie, return a new access token     |
| `POST` | `/auth/logout`         | Revoke the session and clear the cookie                  |

### Users — `/user`

| Method   | Endpoint              | Description                                   |
| -------- | --------------------- | --------------------------------------------- |
| `GET`    | `/user`               | List all users (admin)                        |
| `GET`    | `/user/test`          | Liveness probe for the user router            |
| `GET`    | `/user/profile`       | Fetch a profile by `?email=`                  |
| `PUT`    | `/user/profile`       | Update a profile (multipart, optional avatar) |
| `POST`   | `/user/add-book`      | Create a listing with up to 10 images         |
| `POST`   | `/user/upload-images` | Upload images for the return form             |
| `POST`   | `/user/signup`        | Alias of `/auth/signup`, kept for older callers |
| `POST`   | `/user/signin`        | Alias of `/auth/signin`, kept for older callers |
| `DELETE` | `/user/:id`           | Delete a user (admin)                         |

### Books — `/book` and `/filter`

| Method   | Endpoint                  | Description                            |
| -------- | ------------------------- | -------------------------------------- |
| `GET`    | `/book`                   | List every book                        |
| `GET`    | `/book/:id`               | Book detail plus related titles        |
| `GET`    | `/book/seller/:email`     | Every listing by one seller            |
| `PUT`    | `/book/update-stock/:id`  | Set stock; clears carts when it hits 0 |
| `PUT`    | `/book/update-price/:id`  | Set price                              |
| `DELETE` | `/book/:id`               | Delete a listing                       |
| `GET`    | `/filter/booklist`        | One page of the catalogue, filtered    |
| `GET`    | `/filter/featured`        | The newest few, one per title          |

The catalogue takes its filters as named query parameters — `search`,
`bookType`, `condition`, `category` (repeatable), `minPrice`, `maxPrice`,
`rating`, `inStock`, `sort`, `page`, `pageSize` — and answers with
`{ items, total, page, pageSize, pageCount }`. `pageSize` is capped, so no
request can ask for the whole database.

It replaces a pair of POSTs that took `{ filter_key, filter_input }`: a
document path chosen by the caller, which needed a whitelist to stop it
becoming a query operator. Naming each filter removes the question, and a
search is now a URL you can link to, share and go back to.

### Cart and wishlist

| Method | Endpoint               | Description                            |
| ------ | ---------------------- | -------------------------------------- |
| `GET`  | `/cart?email=`         | Items in a user's cart (in-stock only) |
| `POST` | `/cart/add/:id`        | Add a book to the cart                 |
| `POST` | `/cart/remove/:id`     | Remove a book from the cart            |
| `POST` | `/cart/clear`          | Empty a cart, called after checkout    |
| `GET`  | `/wishlist?email=`     | Items in a user's wishlist             |
| `POST` | `/wishlist/add/:id`    | Add a book to the wishlist             |
| `POST` | `/wishlist/remove/:id` | Remove a book from the wishlist        |

### Orders — `/order`

| Method   | Endpoint                     | Description                                 |
| -------- | ---------------------------- | ------------------------------------------- |
| `POST`   | `/order/decrease-stock`      | Place an order and atomically reserve stock |
| `GET`    | `/order/buyer?email=`        | A buyer's orders, grouped with totals       |
| `GET`    | `/order/seller?email=`       | A seller's orders                           |
| `GET`    | `/order/admin/all`           | Every order (admin)                         |
| `GET`    | `/order/:orderNumber`        | One order with its line items and totals    |
| `PATCH`  | `/order/status/:orderNumber` | Update the status of every item in an order |
| `DELETE` | `/order/:id`                 | Delete a single line item                   |

### Returns and purchases

| Method  | Endpoint               | Description                                   |
| ------- | ---------------------- | --------------------------------------------- |
| `POST`  | `/return`              | Submit a return request                       |
| `GET`   | `/return/requests`     | List return requests (`?userEmail=` to scope) |
| `PATCH` | `/return/requests/:id` | Approve or reject a request (admin)           |
| `GET`   | `/purchase?email=`     | Purchase history for one user                 |
| `POST`  | `/purchase`            | Record a purchase                             |

### Uploads — `/upload`

| Method | Endpoint             | Description                                          |
| ------ | -------------------- | ---------------------------------------------------- |
| `GET`  | `/upload/signature`  | Signs a direct browser upload; `503` when unconfigured |

### Chat — `/chat`

| Method   | Endpoint               | Description                                          |
| -------- | ---------------------- | ---------------------------------------------------- |
| `GET`    | `/chat/messages`       | Paginated thread (`?sender=&receiver=&page=&limit=`) |
| `GET`    | `/chat/history/:email` | Conversation list with unread counts                 |
| `GET`    | `/chat/unread/:email`  | Total unread message count                           |
| `POST`   | `/chat/message`        | Send a message, optionally with an image             |
| `POST`   | `/chat/read`           | Mark a thread as read                                |
| `DELETE` | `/chat/delete`         | Delete a conversation between two users              |

---

## Real-time events

The Socket.IO gateway is mounted on the same HTTP server as the REST API.

| Direction       | Event             | Payload                                       | Meaning                          |
| --------------- | ----------------- | --------------------------------------------- | -------------------------------- |
| client → server | `join_chat`       | `room: string`                                | Subscribe to a conversation room |
| client → server | `send_message`    | `{ room, sender, receiver, message, image? }` | Broadcast to the room            |
| server → client | `receive_message` | the payload above                             | A new message arrived            |

---

## Data models

| Model           | Collection       | Purpose                                                   |
| --------------- | ---------------- | --------------------------------------------------------- |
| `UserTable`     | `usertables`     | Accounts, profile details, avatar                         |
| `AddBook`       | `addbooks`       | Listings: metadata, images, price, stock, seller          |
| `Cart`          | `carts`          | User → book, unique per pair                              |
| `Wishlist`      | `wishlists`      | User → book, unique per pair                              |
| `Order`         | `orders`         | One document per line item, grouped by `orderNumber`      |
| `Purchase`      | `purchases`      | Purchase history                                          |
| `ReturnRequest` | `returnrequests` | Return requests with defect details and status            |
| `ChatMessage`   | `chatmessages`   | Messages with read state, indexed by sender/receiver/time |

---

## Deployment

Both services are intended for [Render](https://render.com).

**Server — Web Service**

| Setting        | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Root directory | `server`                                                   |
| Build command  | `npm ci && npm run build`                                  |
| Start command  | `npm start`                                                |
| Health check   | `/health`                                                  |
| Environment    | everything in [`server/.env.example`](server/.env.example) |

The build step compiles TypeScript into `server/dist`, which is what
`npm start` runs. `npm ci` on its own is no longer enough.

`MONGO` and `JWT_SECRET` are required — the service will not boot without
them. Generate the secret with `openssl rand -hex 48`.

**Client — Static Site**

| Setting           | Value                       |
| ----------------- | --------------------------- |
| Root directory    | `client`                    |
| Build command     | `npm ci && npm run build`   |
| Publish directory | `dist`                      |
| Environment       | `VITE_API_URL=<api origin>` |

Add a rewrite of `/*` to `/index.html` so client-side routes survive a page
refresh, and add the deployed client origin to `CORS_ORIGINS` on the server,
with no trailing slash — browsers send the `Origin` header without one.

> The client and the API are same-origin in development and in the Docker
> stacks, which is what makes the httpOnly refresh cookie first-party. Deploying
> them as two Render services keeps them cross-origin, so the refresh cookie
> will not survive; set `SERVE_CLIENT=true` and serve `client/dist` from the API
> as a single Web Service to keep sessions alive across an expired access token.

---

## Roadmap

All eight planned upgrades are done. [`docs/ROADMAP.md`](docs/ROADMAP.md)
records what each one changed and what was learned doing it: automated tests,
Docker Compose, structured logging, Zod validation, refresh tokens, Cloudinary
image storage, TanStack Query, and the TypeScript migration.

[`docs/AUDIT.md`](docs/AUDIT.md) is the next step: a production-readiness audit
measured against the running application, covering the security headers and
privacy obligations a consumer marketplace is expected to meet, and the
interface work that stands between this and something that reads as a business.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch
naming convention, commit style, and the checks that run in CI.

---

## License

Released under the [MIT License](LICENSE).
