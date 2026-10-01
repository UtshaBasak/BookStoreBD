<div align="center">

# 📚 BookStoreBD

**A MERN marketplace for new and second-hand books — with role-based access, order tracking and real-time buyer–seller chat.**

🌐 **Live site:** [bookstorebd-loum.onrender.com](https://bookstorebd-loum.onrender.com)

[![CI](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/ci.yml/badge.svg)](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/ci.yml)
[![CodeQL](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/github-code-scanning/codeql)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22.13%2B%20%7C%2024%20LTS-brightgreen.svg)](.nvmrc)

[Visit the shop](https://bookstorebd-loum.onrender.com) · [Report a bug](https://github.com/UtshaBasak/BookStoreBD/issues/new?template=bug_report.md) · [Request a feature](https://github.com/UtshaBasak/BookStoreBD/issues/new?template=feature_request.md)

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
- [Coming soon](#coming-soon)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

BookStoreBD is a full-stack marketplace where readers in Bangladesh can buy and sell
both new and used books. It is live at <https://bookstorebd-loum.onrender.com>,
on Render's free plan: after about fifteen idle minutes the service sleeps, and
the first visit afterwards takes up to a minute while it wakes.

It ships three distinct experiences from one codebase:

| Role | What they can do |
| --- | --- |
| **Buyer** | Browse and filter the catalogue, keep a wishlist and cart, check out, track orders, request returns, and chat with sellers |
| **Seller** | List books with photos and condition details, manage stock and pricing, view orders, and answer buyer messages |
| **Admin** | Manage users, review every order, moderate listings, and approve or reject return requests |

---

## Features

### Authentication and access control

- Email/password sign-up and sign-in, with passwords hashed using `bcryptjs`
- Stateless JWT sessions; every protected endpoint verifies the token server-side
- Role-based authorisation (`user` / `admin`) plus per-resource ownership checks
- Email verification and password reset via one-time codes, sent as branded HTML
  e-mails through Gmail's web API (or SMTP where the ports are open)
- Client route guards for rendering, backed by the server as the real boundary

### Catalogue

- Full book listings with author, publisher, ISBN, language, page count and condition
- About a hundred single-subject categories in six groups - Academic, Fiction,
  Non-fiction, Kids & teens, Lifestyle & hobbies, Other - from one list,
  [`client/src/config/categories.ts`](client/src/config/categories.ts)
- Case-insensitive search by title, author or ISBN, filters for type, condition,
  category, price, rating, stock and deals, and seven orders: Relevant (deals
  first, the default), biggest % off, biggest ৳ saving, newest, highest rated,
  and price either way
- Multi-image upload straight from the browser to Cloudinary, or stored inline
  as base64 when image hosting is not configured
- Twenty books to a page, or 30, 40 or 50, and a box to jump straight to a page
- Stock tracking: a book that sells out stays in carts, marked sold out and left
  out of checkout, and a cart asking for more copies than are left is lowered
  to what there is
- A shop page for every seller (`/shop/:username`): banner, picture, books
  listed, copies sold, their rating across every book, and their books to
  search and sort - reached from the seller's name on any book

### Homepage shelves

- Quick deals, Latest books, Trending now, Top picks for you, Shop by category,
  Bestsellers, Most popular, Popular writers, Top rated, Under ৳300, Discover
  something new, and Recently viewed - all but the last two from one request,
  `GET /filter/sections`, kept for a minute
- Top picks come from what the person bought, saved, put in their cart or
  looked at; Recently viewed is kept in the browser only
- Every card is a real link, so it opens in a new tab or copies like any other

### Commerce

- Quick deals: a seller gives a discount on their own book as a percentage or
  an amount of taka off (at most 90%). The book carries its sale price, which
  the catalogue filters and sorts by and checkout charges; the listed price is
  shown struck through. Rules in [`server/config/pricing.ts`](server/config/pricing.ts)
- Wishlist and cart, both scoped per user; the wishlist sorts seven ways, and
  the cart holds several copies of a book, chosen on the book page or in the cart
- Checkout capturing delivery division, district, address, contact and payment method
- Delivery charges worked out by the server from the district: 70 Tk in Dhaka, 120 Tk elsewhere
- Promo codes priced by the server from one list, `server/config/promotions.ts`: `BookStoreBD` (50 Tk off a first order) and `FreeDelivery` (free delivery on 1000 Tk of books), one per order
- A 16-character order number shared by every line item in a single order
- Order tracking for buyers, sellers and admins, each with its own view. A
  seller moves their books up to Shipped; Out for Delivery and Delivered are
  the shop's
- Cancelling: the buyer until the seller starts on it, a seller (their own
  books) until they ship, an administrator until delivery. The stock goes back
  on sale, cancelled books are left out of every total, and the others in the
  order are told why. Rules in [`server/config/commerce.ts`](server/config/commerce.ts)
- Returns within 7 days of delivery, with a defect description, photos and a bKash number for the refund - one book, or a whole order in one request
- Seller payouts by bKash to the seller's merchant number once an order's return window closes, less a 5% fee, recorded with the bKash transaction ID. Orders still inside the window are listed too, with the date each becomes payable

### Notifications

- A bell in every header, with the unread count and the latest few, and a
  full page at `/notifications`
- Everyone in an order hears what concerns them: the buyer, each seller and
  the administrators are told of a new order, a status change, a cancellation,
  a book selling out, a return asked for or decided, a payout, a review, a
  seller's reply, a reported review, and a deal on a wishlisted book
- Delivered live over the chat's Socket.IO connection, with a short toast;
  kept for 90 days

### Administration

- Users, transactions, books, returns, payouts, every review and reported
  reviews, each searchable, filterable, sortable and refreshable
- The administrator can move an order through every stage, and cancel it

### Profiles

- One profile picture, and two banners: one for the buyer side and one for the
  seller side, scaled down in the browser before upload and stored on
  Cloudinary when it is configured
- The buyer or seller view is kept in the address (`/profile?mode=seller`), so
  coming back from the seller's pages returns to it

### Real-time chat

- Buyer–seller messaging, saved through the API and delivered live over Socket.IO
- A connection needs a valid access token, and receives only the messages
  addressed to its owner
- Text and image messages, unread counts, and read receipts
- Conversation history with pagination

### Sharing and discovery

- A shared book link previews as that book — title, price and cover — on
  Facebook, WhatsApp, Messenger, X and Slack: the server writes the tags into
  the page it sends, since those scrapers do not run JavaScript
- `robots.txt`, a sitemap listing every book, and `/llms.txt` for AI assistants
- Per-page titles, descriptions and schema.org data for search engines

### Design

- Violet and sunset-orange palette, Plus Jakarta Sans, rounded cards and pill
  buttons, one set of shared classes in [`client/src/index.css`](client/src/index.css)
- Every page laid out for phones first, and checked at phone and laptop widths
- Lighthouse: 100 for accessibility, best practices and SEO

---

## Tech stack

| Layer | Technology |
| --- | --- |
| Language | TypeScript 6, strict mode, across both packages |
| Frontend | React 19, React Router 7, Vite 8, Tailwind CSS 4 |
| Data fetching | TanStack Query |
| Backend | Node.js, Express 5 |
| Database | MongoDB with Mongoose 9 |
| Real-time | Socket.IO 4 |
| HTTP clients | Axios and the native `fetch` API |
| Uploads | Cloudinary direct upload, Multer fallback |
| Validation | Zod schemas on every request |
| Hardening | express-rate-limit, request sanitisation |
| Email | Gmail REST API (OAuth), or SMTP through Nodemailer |
| Tooling | ESLint 10 + typescript-eslint, GitHub Actions, CodeQL |

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
and otherwise uses `/api` on its own origin — the Vite dev server proxies it in
development, and in production the API serves the site itself.

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
│   ├── public/                  # Favicon, share image, placeholder cover
│   ├── src/
│   │   ├── components/          # Reusable UI (chat window, table, spinner…)
│   │   ├── fonts/               # Plus Jakarta Sans and the Taka sign, self-hosted
│   │   ├── config/
│   │   │   ├── api.ts           # API origin + authenticated fetch/axios
│   │   │   └── queryClient.ts   # TanStack Query defaults
│   │   ├── hooks/
│   │   │   └── queries.ts       # One place for every query and mutation
│   │   ├── pages/               # Route-level screens
│   │   │   ├── admin/           # Admin-only screens
│   │   │   └── buyer/           # Buyer-only screens
│   │   ├── styles/              # Shared stylesheets
│   │   ├── utils/               # Live chat subscription, safe image sources
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
│   │   └── chatSocket.ts        # Authenticated live delivery of chat messages
│   ├── tests/                   # Vitest + Supertest suites
│   │   ├── helpers/             # App bootstrap and data factories
│   │   └── setup/               # Shared in-memory MongoDB
│   ├── types/
│   │   ├── contracts.ts         # Compile-time schema/contract assertions
│   │   ├── express.d.ts         # req.user, set by the auth middleware
│   │   └── vitest.d.ts          # What globalSetup provides to the suites
│   ├── utils/
│   │   ├── emailTemplates.ts    # The shop's e-mails, as HTML and plain text
│   │   ├── error.ts             # Error factory used by controllers
│   │   ├── mailer.ts            # Gmail API or SMTP, whichever is configured
│   │   ├── sharePreview.ts      # Per-book link previews in the page head
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
│   └── workflows/               # CI (CodeQL runs as GitHub's default setup)
├── docker-compose.yml           # Dev stack: Mongo + API + Vite
├── docker-compose.prod.yml      # Production-like: Mongo + API + nginx
├── render.yaml                  # The Render Blueprint for the live site
├── docs/                        # The roadmap and the production audit
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
- A **Gmail account** for one-time-code emails: an [App Password](https://support.google.com/accounts/answer/185833)
  for SMTP locally, or Gmail API credentials (`npm run gmail:token`) where the
  SMTP ports are blocked, as on Render's free plan

### 1. Clone and install

```bash
git clone https://github.com/UtshaBasak/BookStoreBD.git
cd BookStoreBD
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

| Service | URL |
| --- | --- |
| Client | <http://localhost:5173> |
| API | <http://localhost:4000> |
| Health | <http://localhost:4000/health> |

To run them separately, use `npm run dev:server` and `npm run dev:client`.

---

## Running with Docker

Everything the project needs, without installing Node or MongoDB:

```bash
docker compose up --build            # MongoDB + API + client
docker compose run --rm seed         # sample accounts and catalogue
```

| Service | URL |
| --- | --- |
| Client (Vite dev server) | <http://localhost:5173> |
| API | <http://localhost:4000> |
| MongoDB | `mongodb://localhost:27017/bookstorebd` |

The source is bind-mounted, so edits on the host reload inside the containers.
Both watchers are set to poll, because filesystem events raised on a Windows
host do not reach a Linux container.

After seeding, sign in as any of:

| Role | Email | Password |
| --- | --- | --- |
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

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `MONGO` | ✅ | — | MongoDB connection string |
| `PORT` | | `4000` | Port the API listens on |
| `NODE_ENV` | | `development` | `development` or `production` |
| `CORS_ORIGINS` | | `http://localhost:5173` | Comma-separated browser origins allowed to call the API |
| `JWT_SECRET` | ✅ | — | Signs access tokens; must be 32+ chars, else start fails |
| `JWT_EXPIRES_IN` | | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | | `30` | Refresh token lifetime |
| `COOKIE_SECURE` | | on in production | `Secure` flag on the refresh cookie |
| `COOKIE_SAME_SITE` | | `lax` | `SameSite` on the refresh cookie |
| `SERVE_CLIENT` | | on in production | Serve `client/dist` from the API process; warns at start-up if there is no build |
| `CLIENT_API_ORIGIN` | | — | Cross-origin deployments only: added to the CSP `connect-src` so the browser may call the API |
| `PUBLIC_SITE_URL` | | the request's own origin | Canonical origin for the URLs in `robots.txt`, `sitemap.xml`, `llms.txt`, link previews and e-mails. Set it once the domain is known, so a site answering on two hostnames advertises one |
| `CLOUDINARY_CLOUD_NAME` | | — | Enables image hosting; unset keeps covers inline |
| `CLOUDINARY_API_KEY` | | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | | — | Signs uploads. Secret — never commit |
| `ADMIN_EMAILS` | | — | Comma-separated e-mails promoted to admin on sign-in |
| `SMTP_SERVICE` | | `gmail` | Nodemailer service name |
| `SMTP_USER` | ✅ ¹ | — | SMTP account used as the sender |
| `SMTP_PASS` | ✅ ¹ | — | SMTP password or app password |
| `GMAIL_CLIENT_ID` | ¹ | — | Google Cloud OAuth client, for Gmail's web API |
| `GMAIL_CLIENT_SECRET` | ¹ | — | Its secret. Never commit |
| `GMAIL_REFRESH_TOKEN` | ¹ | — | From `npm run gmail:token`. With all three set, mail goes over HTTPS instead of SMTP |
| `LOG_LEVEL` | | `debug` dev / `info` prod | pino level; `silent` under test |
| `SENTRY_DSN` | | — | Enables error reporting; off entirely when unset |
| `SENTRY_TRACES_SAMPLE_RATE` | | `0` | Fraction of transactions traced |
| `SEED_PASSWORD` | | `***REMOVED***` | Password given to the seeded demo accounts |
| `MAX_UPLOAD_BYTES` | | `5242880` | Per-file upload ceiling (5 MB) |
| `MAX_UPLOAD_FILES` | | `10` | Files accepted per multi-upload request |

¹ Required only for the OTP flows (sign-up verification and password reset):
`SMTP_USER` always (it is the sender), plus either `SMTP_PASS` or the three
`GMAIL_*` values.

### `client/.env`

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `VITE_API_URL` | | empty: `/api` on the same origin | Only for a client deployed apart from the API |
| `VITE_PROXY_TARGET` | | `http://localhost:4000` | Where the dev server forwards `/api` and `/socket.io` |

> Only variables prefixed with `VITE_` reach the browser bundle. Never put a
> secret in `client/.env`.

---

## Available scripts

Run these from the repository root:

| Script | What it does |
| --- | --- |
| `npm run install:all` | Installs dependencies in both `client/` and `server/` |
| `npm run dev` | Runs the API and the client together |
| `npm run dev:server` | Runs the API alone with hot reload (nodemon + tsx) |
| `npm run dev:client` | Runs the Vite dev server alone |
| `npm run build` | Compiles the API to `server/dist` and bundles the client |
| `npm run build:server` / `build:client` | One package only |
| `npm run preview` | Serves the built client locally |
| `npm start` | Starts the API from `server/dist` (build first) |
| `npm run typecheck` | Type-checks both packages, tests included |
| `npm run typecheck:server` / `typecheck:client` | One package only |
| `npm run lint` | Lints both packages |
| `npm run lint:server` / `lint:client` | One package only |
| `npm test` | Runs the server and client test suites |
| `npm run test:server` | Server suite only |
| `npm run test:client` | Client suite only |
| `npm run test:watch` | Re-runs on change (inside `client/` or `server/`) |
| `npm run seed` | Seeds demo data (`-- --reset` empties first) |
| `npm run migrate:images` | Moves base64 covers to Cloudinary |
| `npm run gmail:token` | Gets the Gmail API refresh token, once, in a browser |

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

```text
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

All endpoints live under **`/api`**, with `/health`, `/robots.txt`,
`/sitemap.xml` and `/llms.txt` at the root.

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

```text
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

| Access level | Applies to |
| --- | --- |
| **Public** | `/health`, catalogue browsing (`/book`, `/filter/*`), `/auth/*`, a seller's public profile |
| **Authenticated** | Cart, wishlist, orders, chat, returns, purchases, profile updates, creating a listing |
| **Owner** | Editing or deleting a listing (seller only), reading or updating an order (buyer or seller only), reading a conversation (participants only) |
| **Administrator** | Listing and deleting users, every order, approving returns |

A rejected token returns `401`; a valid token without the right role returns
`403`. The client clears the session and redirects to sign-in on a `401`.

Admins are identified by `role` on the user document. `ADMIN_EMAILS` promotes
listed accounts on their next sign-in, so an existing deployment gains its
administrator without a migration.

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe and process uptime |

### Authentication — `/auth`

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create an account (requires a verified OTP) |
| `POST` | `/auth/signin` | Sign in with email and password |
| `POST` | `/auth/send-otp` | Send a one-time code (`purpose`: `register` or `reset`) |
| `POST` | `/auth/verify-otp` | Verify a one-time code |
| `POST` | `/auth/reset-password` | Reset a password using a valid OTP; ends every session |
| `POST` | `/auth/refresh` | Rotate the refresh cookie, return a new access token |
| `POST` | `/auth/logout` | Revoke the session and clear the cookie |

### Users — `/user`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/user` | One page of non-admin accounts (admin) |
| `GET` | `/user/test` | Liveness probe for the user router |
| `GET` | `/user/profile` | Fetch a profile by `?email=` |
| `PUT` | `/user/profile` | Update a profile (multipart, optional avatar) |
| `POST` | `/user/add-book` | Create a listing with up to 10 images |
| `GET` | `/user/:email/avatar` | A profile picture, as an image |
| `GET` | `/user/:email/banner/:role` | A buyer or seller banner kept inline, as an image |
| `GET` | `/user/shop/:username` | A seller's shop: who they are and how they do; `404` without books |
| `POST` | `/user/signup` | Alias of `/auth/signup`, kept for older callers |
| `POST` | `/user/signin` | Alias of `/auth/signin`, kept for older callers |
| `DELETE` | `/user/:id` | Delete a user (admin) |

### Books — `/book` and `/filter`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/book/admin` | One page of every listing (admin) |
| `GET` | `/book/:id` | Book detail plus related titles |
| `GET` | `/book/seller/:email` | Every listing by one seller |
| `PUT` | `/book/update-stock/:id` | Set stock; carts keep the book, marked sold out at 0 |
| `PUT` | `/book/update-price/:id` | Set price; drops a taka discount that no longer fits |
| `PUT` | `/book/discount/:id` | The seller's discount: `{ type: 'percent' \| 'amount', value }` or `{ type: 'none' }` |
| `DELETE` | `/book/:id` | Delete a listing |
| `GET` | `/filter/booklist` | One page of the catalogue, filtered |
| `GET` | `/filter/featured` | The newest few, one per title |
| `GET` | `/filter/sections` | Every homepage shelf, writers and category counts |
| `GET` | `/filter/by-ids?ids=` | Books in the order asked (Recently viewed) |
| `GET` | `/filter/for-you?seen=` | Top picks, personal when signed in |

The catalogue takes its filters as named query parameters — `search`,
`bookType`, `condition`, `category` (repeatable), `minPrice`, `maxPrice`
(both on the sale price), `rating`, `inStock`, `deals`, `sort` (`relevant`,
the default, `dealPercent`, `dealAmount`, `newest`, `rated`, `priceLowHigh`,
`priceHighLow`; the two deal orders show discounted books only), `page`,
`pageSize` — and answers with
`{ items, total, page, pageSize, pageCount }`. `pageSize` is capped, so no
request can ask for the whole database.

It replaces a pair of POSTs that took `{ filter_key, filter_input }`: a
document path chosen by the caller, which needed a whitelist to stop it
becoming a query operator. Naming each filter removes the question, and a
search is now a URL you can link to, share and go back to.

The catalogue also takes `seller` (a username) for a seller's shop; `rating`
is a floor from 1 to 5, and `pageSize` goes up to 50 (20 by default).

The order and return lists take the same three parameters — `search`, `page`,
`pageSize` — and answer in the same shape. Orders are paged by **order**, not
by line: a basket of three books is three rows, and a page that cut between
them would show part of a purchase.

Each admin list adds its own filters and a `sort`:

| List | Filters | `sort` |
| --- | --- | --- |
| `/user` | `kind` = `sellers` \| `buyers` | `newest`, `oldest`, `nameAZ`, `nameZA` |
| `/order/admin/all`, `/order/buyer`, `/order/seller` | `status`, `from`, `to` (YYYY-MM-DD) | `newest`, `oldest`, `totalHigh`, `totalLow` |
| `/book/admin` | `bookType`, `stock` = `in` \| `low` \| `out`, `deals` = `yes` \| `no` | `newest`, `oldest`, `priceHigh`, `priceLow`, `stockLow`, `titleAZ` |
| `/return/requests` | `status` = `pending` \| `approved` \| `rejected` | `newest`, `oldest` |
| `/order/admin/payouts` | `state` = `due` \| `upcoming` \| `paid` | `oldest`, `newest`, `amountHigh`, `amountLow` |
| `/review/flagged` | `rating` | `mostReported`, `newest`, `oldest`, `ratingLow`, `ratingHigh` |
| `/review/all` | `rating`, `replied` = `yes` \| `no`, `reported` = `yes` \| `no` | `newest`, `oldest`, `ratingHigh`, `ratingLow`, `mostReported` |

### Cart and wishlist

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/cart` | The cart, each book with `cartQuantity` (and `cartAdjusted` when it was lowered to the stock) |
| `POST` | `/cart/add/:id` | Add a book; `{ quantity }` for several copies, `409` past the stock |
| `PATCH` | `/cart/:id` | Set how many copies: `{ quantity }` |
| `POST` | `/cart/remove/:id` | Remove a book from the cart |
| `POST` | `/cart/clear` | Empty a cart, called after checkout |
| `GET` | `/wishlist?email=` | Items in a user's wishlist |
| `POST` | `/wishlist/add/:id` | Add a book to the wishlist |
| `POST` | `/wishlist/remove/:id` | Remove a book from the wishlist |

### Orders — `/order`

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/order/decrease-stock` | Place an order and atomically reserve stock |
| `GET` | `/order/buyer` | A page of the caller's orders, with totals |
| `GET` | `/order/seller` | A page of the caller's sales |
| `GET` | `/order/admin/all` | A page of every order (admin) |
| `GET` | `/order/:orderNumber` | One order with its line items and totals |
| `PATCH` | `/order/status/:orderNumber` | Move an order on: a seller their own books, up to Shipped; an admin anything |
| `POST` | `/order/:orderNumber/cancel` | Cancel it, `{ reason? }`: the buyer, a seller or an admin, each within their rules |
| `GET` | `/order/admin/payouts` | What sellers are owed, in their return window, or have been paid (admin) |
| `POST` | `/order/admin/payouts/paid` | Record a payout with its bKash transaction ID (admin) |
| `DELETE` | `/order/:id` | Delete a single line item |

### Returns and purchases

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/return` | Submit a return request, with its photographs; `orderId` repeats for a whole order |
| `GET` | `/return/requests` | A page of return requests, scoped to the caller |
| `GET` | `/return/requests/:id/image/:n` | One photograph, to its buyer or an admin |
| `PATCH` | `/return/requests/:id` | Approve or reject a request (admin) |

### Reviews — `/review`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/review/:bookId` | A book's reviews, its score, and what you may do |
| `POST` | `/review/:bookId` | Write or replace your review (buyers only) |
| `DELETE` | `/review/:bookId` | Withdraw yours; `?email=` for an admin |
| `POST` | `/review/:id/reply` | The seller's answer to one review |
| `DELETE` | `/review/:id/reply` | Withdraw that answer |
| `POST` | `/review/:id/flag` | Report a review, once per person |
| `GET` | `/review/flagged` | The moderation queue (admin) |
| `GET` | `/review/all` | Every review, to search and filter (admin) |
| `DELETE` | `/review/:id/flags` | Clear the reports, keep the review (admin) |

Only somebody who bought the book may review it, and only the seller of that
book may answer — not an administrator, who would be signing the shop's name to
words the shop did not write. Reporting hides nothing: a review stays where it
is and keeps counting towards the score until an administrator decides
otherwise, because anything else makes "report" a button for removing an
inconvenient review.

### Notifications — `/notification`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/notification` | A page of yours, newest first, with the unread count; `?unreadOnly=1` |
| `POST` | `/notification/read` | Mark `{ ids }` read, or all of them without |

### Purchases — `/purchase`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/purchase?email=` | Purchase history for one user |
| `POST` | `/purchase` | Record a purchase |

### Uploads — `/upload`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/upload/signature` | Signs a direct browser upload; `503` when unconfigured |

### Chat — `/chat`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/chat/messages` | Paginated thread (`?sender=&receiver=&page=&limit=`) |
| `GET` | `/chat/messages/:id/image` | One attachment, to the two in the thread |
| `GET` | `/chat/history/:email` | Conversation list with unread counts |
| `GET` | `/chat/unread/:email` | Total unread message count |
| `POST` | `/chat/message` | Send text, a picture, or both |
| `POST` | `/chat/read` | Mark a thread as read |
| `DELETE` | `/chat/delete` | Delete a conversation between two users |

### Client errors — `/client-error`

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/client-error` | A report from somebody's browser |

Open to anyone, because a page breaks for signed-out visitors too, and limited
to 60 reports per fifteen minutes per address. Reports land in the same
structured log as everything else, with the request id, and go to Sentry when
`SENTRY_DSN` is set. The browser de-duplicates and caps its own: the same
failure is reported once per session, and twenty in total.

### Site files at the root

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/robots.txt` | What crawlers may visit, and where the sitemap is |
| `GET` | `/sitemap.xml` | Every public page and every book |
| `GET` | `/llms.txt` | What the shop is and where things are, in Markdown, for AI assistants |
| `GET` | `/book/:id` | The app, with that book's title, price and cover in the head for link previews |

---

## Real-time events

The Socket.IO gateway is mounted on the same HTTP server as the REST API, on
the default namespace. A connection must send its access token as
`auth: { token }`, and is refused with `unauthorized` otherwise; each one is
placed in its owner's room and nowhere else.

Browsers send nothing over it. A message is saved with `POST /chat/message`,
and the server then delivers the saved message to its receiver:

| Direction | Event | Payload | Meaning |
| --- | --- | --- | --- |
| server → client | `receive_message` | `{ _id, sender, receiver, message, image, timestamp, read }` | A new message for you |
| server → client | `notification` | `{ _id, type, title, body, link, read, createdAt }` | Something for the bell |

`image` is the address of the attachment (`/api/chat/messages/:id/image`),
not its bytes.

---

## Data models

| Model | Collection | Purpose |
| --- | --- | --- |
| `UserTable` | `usertables` | Accounts, profile details, avatar |
| `AddBook` | `addbooks` | Listings: metadata, images, price, stock, seller |
| `Cart` | `carts` | User → book, unique per pair |
| `Wishlist` | `wishlists` | User → book, unique per pair |
| `Order` | `orders` | One document per line item, grouped by `orderNumber` |
| `Purchase` | `purchases` | Purchase history |
| `ReturnRequest` | `returnrequests` | Return requests with defect details and status |
| `ChatMessage` | `chatmessages` | Messages with read state, indexed by sender/receiver/time |
| `Notification` | `notifications` | What the bell shows, per person; removed after 90 days |

---

## Deployment

The live site, <https://bookstorebd-loum.onrender.com>, is one
[Render](https://render.com) Web Service that serves the API and the built site
from the same origin, described in [`render.yaml`](render.yaml), with its
database on MongoDB Atlas. Every push to `master` deploys it. Create it with
**New → Blueprint** and this repository; Render then asks for the secrets.

| Setting | Value |
| --- | --- |
| Build command | install `server` and `client` with dev dependencies, then `npm run build` |
| Start command | `npm start`, which runs `server/dist` |
| Health check | `/health` |
| Region | Singapore, with the MongoDB Atlas cluster in the same region |

Asked for when the Blueprint is created:

| Variable | What it is |
| --- | --- |
| `MONGO` | The Atlas connection string, with `/bookstorebd` as the database |
| `ADMIN_EMAILS` | The address made administrator on its next sign-in |
| `SMTP_USER` | The Gmail address one-time codes are sent from |
| `SMTP_PASS` | A Gmail App Password for it, not the account password |
| `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN` | Gmail's web API. Render's free plan blocks the SMTP ports, so this is how the live site sends mail |
| `CLOUDINARY_API_SECRET` | From Cloudinary → Settings → API Keys |

Render's Blueprint matches services by name, and the live service has been
renamed, so a Blueprint sync would create a second one: change settings in the
service's own **Environment** page instead.

`JWT_SECRET` is generated by Render. The site's own address is always an allowed
origin - Render supplies it as `RENDER_EXTERNAL_URL`, and `PUBLIC_SITE_URL` adds a
custom domain - so `CORS_ORIGINS` is only for other origins.

> One service rather than an API and a static site: same-origin is what makes
> the httpOnly refresh cookie first-party. Split across two, the cookie does not
> survive, and everyone is signed out when their 15-minute access token expires.

---

## Roadmap

All eight planned upgrades are done. [`docs/ROADMAP.md`](docs/ROADMAP.md)
records what each one changed and what was learned doing it: automated tests,
Docker Compose, structured logging, Zod validation, refresh tokens, Cloudinary
image storage, TanStack Query, and the TypeScript migration.

[`docs/AUDIT.md`](docs/AUDIT.md) is a production-readiness audit measured
against the running application: security headers, privacy obligations, and the
interface work between a project and a shop. Every item in its suggested order
is done. What it still records — the access token in `localStorage` (S3), the
bcrypt cost (S7), and the business features listed for later — is where to look
next.

---

## Coming soon

What is planned for the near future, beyond the shop as it stands.

| Upgrade | What it brings |
| --- | --- |
| 📱 **E-books** | Digital editions alongside printed ones: buy and read on the site, a free preview of the first pages, a personal library of everything bought, and downloads in EPUB and PDF where the publisher allows. Sellers and local publishers can list e-books next to their paperbacks. |
| 🔄 **Book exchange** | Swap finished books with other readers instead of selling them: list what you have and what you want, get matched with a reader who has it, and trade through the same courier and chat the shop already runs. Exchange credit for a book given, to spend on a book received, so a swap does not need both sides at once. |
| 💳 **Online payment** | bKash, Nagad and card payments at checkout, next to cash on delivery, with refunds back to the same account. |
| 🚚 **Live courier tracking** | Delivery status straight from the courier, so an order's progress updates on its own rather than when the seller moves it on. |
| 🔔 **E-mail and SMS alerts** | The bell's news by e-mail and SMS too - an order shipped, a return decided, a deal on a wishlisted book - for anyone not on the site. |
| ⭐ **Seller ratings** | A score for each seller from their buyers, shown on every listing, for trust between people who have never met. |
| 📲 **Mobile app** | The shop as an installable app for Android and iOS, with the cart, wishlist and chat always to hand. |

These are plans, not promises of a date. Ideas and requests are welcome in the
[issues](https://github.com/UtshaBasak/BookStoreBD/issues/new?template=feature_request.md).

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch
naming convention, commit style, and the checks that run in CI.

---

## History

BookStoreBD began as **MernBookstore**, a university group project by
[@Prottasha0212](https://github.com/Prottasha0212),
[@jihadul021](https://github.com/jihadul021),
[@deeanatrahman](https://github.com/deeanatrahman) and
[@UtshaBasak](https://github.com/UtshaBasak). The team's version lives on,
unchanged, at [Prottasha0212/MernBookstore](https://github.com/Prottasha0212/MernBookstore).

This repository continues from it with the full history kept, so every commit
from the group project still carries its author. The tag `team-final` marks the
team's last commit; everything after it is the continuation:

```bash
git log team-final          # the group project
git log team-final..master  # what came after
```

The two are deployed separately and must keep separate databases. This version
runs `mongoose.syncIndexes()` at start-up, which drops any index its schemas do
not define, so pointing it at the original deployment's database would change
that database.

---

## License

Released under the [MIT License](LICENSE).
