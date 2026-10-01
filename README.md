<div align="center">

# 📚 BookStoreBD

**A full-stack marketplace for new and second-hand books in Bangladesh — role-based access, order tracking, real-time buyer–seller chat, and search that works in Bangla and English.**

🌐 **Live site:** [bookstorebd-loum.onrender.com](https://bookstorebd-loum.onrender.com)

[![CI](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/ci.yml/badge.svg)](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/ci.yml)
[![CodeQL](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/github-code-scanning/codeql/badge.svg)](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/github-code-scanning/codeql)
[![Docker image](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/docker.yml/badge.svg)](https://github.com/UtshaBasak/BookStoreBD/actions/workflows/docker.yml)
[![Live site](https://img.shields.io/website?url=https%3A%2F%2Fbookstorebd-loum.onrender.com%2Fhealth&label=live%20site&up_message=online&down_message=starting&up_color=brightgreen&down_color=orange)](https://bookstorebd-loum.onrender.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

[![Last commit](https://img.shields.io/github/last-commit/UtshaBasak/BookStoreBD)](https://github.com/UtshaBasak/BookStoreBD/commits/master)
[![Commit activity](https://img.shields.io/github/commit-activity/m/UtshaBasak/BookStoreBD)](https://github.com/UtshaBasak/BookStoreBD/graphs/commit-activity)
[![Contributors](https://img.shields.io/github/contributors/UtshaBasak/BookStoreBD)](https://github.com/UtshaBasak/BookStoreBD/graphs/contributors)
[![Open issues](https://img.shields.io/github/issues/UtshaBasak/BookStoreBD)](https://github.com/UtshaBasak/BookStoreBD/issues)
[![Pull requests](https://img.shields.io/github/issues-pr/UtshaBasak/BookStoreBD)](https://github.com/UtshaBasak/BookStoreBD/pulls)
[![Top language](https://img.shields.io/github/languages/top/UtshaBasak/BookStoreBD)](https://github.com/UtshaBasak/BookStoreBD)
[![Code size](https://img.shields.io/github/languages/code-size/UtshaBasak/BookStoreBD)](https://github.com/UtshaBasak/BookStoreBD)
[![Stars](https://img.shields.io/github/stars/UtshaBasak/BookStoreBD?style=flat)](https://github.com/UtshaBasak/BookStoreBD/stargazers)

[![Node](https://img.shields.io/badge/node-22.13%2B%20%7C%2024%20LTS-339933?logo=nodedotjs&logoColor=white)](.nvmrc)
[![GitHub Packages](https://img.shields.io/badge/ghcr.io-bookstorebd-2496ED?logo=docker&logoColor=white)](https://github.com/UtshaBasak/BookStoreBD/pkgs/container/bookstorebd)
[![Wiki](https://img.shields.io/badge/docs-wiki-6d28d9?logo=github)](https://github.com/UtshaBasak/BookStoreBD/wiki)
[![Dependabot](https://img.shields.io/badge/Dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](.github/dependabot.yml)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-6%20strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![TanStack Query](https://img.shields.io/badge/TanStack%20Query-5-FF4154?logo=reactquery&logoColor=white)](https://tanstack.com/query)
[![Express](https://img.shields.io/badge/Express-5-000000?logo=express&logoColor=white)](https://expressjs.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-Mongoose%209-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com)
[![Socket.IO](https://img.shields.io/badge/Socket.IO-4-010101?logo=socketdotio&logoColor=white)](https://socket.io)
[![Zod](https://img.shields.io/badge/Zod-validation-3E67B1?logo=zod&logoColor=white)](https://zod.dev)
[![Vitest](https://img.shields.io/badge/tested%20with-Vitest-6E9F18?logo=vitest&logoColor=white)](https://vitest.dev)
[![Docker](https://img.shields.io/badge/Docker-ready-2496ED?logo=docker&logoColor=white)](Dockerfile)
[![Render](https://img.shields.io/badge/deployed%20on-Render-46E3B7?logo=render&logoColor=white)](https://render.com)
[![Cloudinary](https://img.shields.io/badge/images-Cloudinary-3448C5?logo=cloudinary&logoColor=white)](https://cloudinary.com)

[Visit the shop](https://bookstorebd-loum.onrender.com) · [Read the wiki](https://github.com/UtshaBasak/BookStoreBD/wiki) · [Report a bug](https://github.com/UtshaBasak/BookStoreBD/issues/new?template=bug_report.md) · [Request a feature](https://github.com/UtshaBasak/BookStoreBD/issues/new?template=feature_request.md)

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
- [History](#history)
- [License](#license)

---

## Overview

BookStoreBD is a marketplace where readers in Bangladesh buy and sell new and
used books, live at <https://bookstorebd-loum.onrender.com>. It runs on
Render's free tier, so the first visit after a quiet spell can take a few
seconds while the service starts.

One codebase serves three roles:

| Role | What they can do |
| --- | --- |
| **Buyer** | Browse and filter the catalogue, keep a wishlist and cart, check out, track and cancel orders, request returns, and chat with sellers |
| **Seller** | List books with photos and condition details, run discounts, manage stock, handle orders, and get paid by bKash |
| **Admin** | Manage users, orders, listings, returns, payouts and reviews, and message buyers and sellers |

User guides for each role are in the [wiki](https://github.com/UtshaBasak/BookStoreBD/wiki).

---

## Features

### Accounts and security

- E-mail sign-up verified by one-time code, sign-in, and password reset, with
  branded e-mails sent through Gmail's API (or SMTP)
- Strong passwords: 12–128 characters with mixed case, a number and a symbol;
  never the person's name or e-mail, a common password, a simple run, or one
  found in a known breach (checked against Have I Been Pwned by k-anonymity).
  The form shows each rule as it is met. Rules in
  [`server/utils/passwordPolicy.ts`](server/utils/passwordPolicy.ts)
- Short-lived JWT access tokens with rotating, httpOnly refresh tokens
- Role-based authorisation (`user` / `admin`) plus per-resource ownership checks
- Zod validation on every request, rate limiting, request sanitisation, and a
  strict Content Security Policy

### Catalogue and search

- Listings with author, publisher, ISBN, language, page count and condition,
  across about a hundred categories in six groups
  ([`client/src/config/categories.ts`](client/src/config/categories.ts))
- Suggestions under every search box as you type: books, sellers, and a full search
- **Bangla–English search:** "pather panchali" finds পথের পাঁচালী and
  "হ্যারি পটার" finds Harry Potter, through a sound-alike key
  ([`server/utils/phonetic.ts`](server/utils/phonetic.ts))
- Search by title, author or ISBN, with filters for type, condition, category,
  price, rating, stock and deals, seven sort orders, and 20–50 results a page
- Seller shop pages (`/shop/:username`) with stats, ratings and their books
- Homepage shelves: Quick deals, Latest, Trending, Top picks for you, Shop by
  category, Bestsellers, Popular writers, Top rated, Under ৳300 and Recently viewed

### Shopping and orders

- Seller discounts by percentage or amount, shown as a sale price everywhere
- Wishlist with seven sort orders; a cart that holds several copies and keeps
  quantities within stock
- "Notify me when it is back" for sold-out books
- Checkout with server-priced delivery (70 Tk in Dhaka, 120 Tk elsewhere),
  promo codes ([`server/config/promotions.ts`](server/config/promotions.ts)),
  cash on delivery, and an optional note to the seller
- Order tracking for buyers, sellers and admins, each with its own view and a
  PDF download laid out for that reader; one-click copy of order numbers
- Clear cancellation rules for each role, with stock restored automatically
  ([`server/config/commerce.ts`](server/config/commerce.ts))
- Returns within 7 days of delivery, for one book or a whole order, with photos
  and a bKash number for the refund
- Seller payouts by bKash once the return window closes, less a 5% fee, each
  recorded with its transaction ID
- Share any book to Facebook, WhatsApp, X, Telegram or e-mail; shared links
  preview with the book's title, price and cover

### Notifications and e-mail

- A notification bell on every page, delivered live over Socket.IO, and a full
  history at `/notifications`
- Everyone in an order hears what concerns them: new orders, status changes,
  cancellations, returns, payouts, reviews and replies
- Stock and price alerts: low stock and sold-out notices for sellers; low stock
  and price drops for buyers with the book in their cart or wishlist; a notice
  when a requested book is back
- Branded e-mails for confirmed, delivered and cancelled orders, return
  decisions, and return requests, sent in the background

### Administration

- Users, transactions, books, returns, payouts, all reviews and reported
  reviews — each searchable, filterable, sortable and refreshable
- Full control of order stages and cancellation
- **Messages:** a notification, a branded e-mail or both, to chosen people or
  to every buyer, every seller, or everyone

### Profiles, chat and discovery

- Profile picture and separate buyer and seller banners, uploaded to Cloudinary
- Buyer–seller chat with text and images, unread counts and read receipts
- `robots.txt`, a sitemap of every book, `/llms.txt`, per-page metadata and
  schema.org data

### Design

- Violet and sunset-orange design system with Plus Jakarta Sans, built on
  shared classes in [`client/src/index.css`](client/src/index.css)
- Mobile-first layouts, checked at phone and laptop widths
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
| Validation | Zod schemas on every request |
| Uploads | Cloudinary direct upload, with a Multer fallback |
| Email | Gmail REST API (OAuth), or SMTP through Nodemailer |
| Hardening | express-rate-limit, request sanitisation, helmet |
| Tooling | ESLint 10 + typescript-eslint, Vitest, GitHub Actions, CodeQL, Dependabot |
| Delivery | Render, Docker, GitHub Packages |

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

Every request goes through [`client/src/config/api.ts`](client/src/config/api.ts),
which uses `/api` on the site's own origin (or `VITE_API_URL` when set). The
Vite dev server proxies it in development; in production the API serves the
built site itself.

On the server, [`app.ts`](server/app.ts) exports a side-effect-free `createApp()`
factory, and [`index.ts`](server/index.ts) owns start-up: validate the
environment, connect to MongoDB, listen, attach Socket.IO, and shut down
gracefully on `SIGINT`/`SIGTERM`.

### One contract, two packages

[`server/shared/api.d.ts`](server/shared/api.d.ts) declares every request and
response shape. The server and the client (through a `@shared/*` path) both
compile against it, so neither side can change a response without the other
failing to type-check. It holds types only, so neither package depends on the
other at run time.

[`server/types/contracts.ts`](server/types/contracts.ts) also asserts at
compile time that everything the client may send is accepted by the
endpoint's Zod schema.

---

## Project structure

```text
BookStoreBD/
├── client/                      # React + Vite single-page app
│   ├── public/                  # Favicon, share image, placeholder cover
│   ├── src/
│   │   ├── components/          # Reusable UI
│   │   ├── fonts/               # Plus Jakarta Sans and the Taka sign, self-hosted
│   │   ├── config/              # API origin, query client, site constants
│   │   ├── hooks/queries.ts     # Every query and mutation
│   │   ├── pages/               # Route-level screens (admin/, buyer/, legal/)
│   │   ├── styles/              # Shared stylesheets
│   │   ├── utils/               # Password rules, PDFs, sockets, helpers
│   │   ├── App.tsx              # Router and route guards
│   │   └── main.tsx             # Entry point
│   └── vite.config.ts
│
├── server/                      # Express REST API + Socket.IO gateway
│   ├── config/                  # Environment, database, logger, CORS, rules
│   ├── controllers/             # Request handlers, one per domain
│   ├── middleware/              # Auth, validation, rate limits, errors
│   ├── models/                  # Mongoose schemas
│   ├── routes/                  # Express routers, one per domain
│   ├── schemas/                 # One Zod schema per endpoint
│   ├── scripts/                 # Seeding, migrations, Gmail token
│   ├── shared/api.d.ts          # The wire contract, shared with the client
│   ├── sockets/                 # Authenticated live delivery
│   ├── tests/                   # Vitest + Supertest suites
│   ├── utils/                   # Mail, notifications, search, passwords, PDFs
│   ├── app.ts                   # createApp() factory
│   └── index.ts                 # Start-up and graceful shutdown
│
├── .github/                     # CI, Docker publishing, Dependabot, templates
├── docs/                        # Engineering roadmap and production review
├── Dockerfile                   # The single image published to GitHub Packages
├── docker-compose.yml           # Development stack: MongoDB + API + Vite
├── docker-compose.prod.yml      # Production-like stack: MongoDB + API + nginx
├── render.yaml                  # Render Blueprint for the live site
├── .env.example                 # Settings for Docker Compose
└── package.json                 # Root scripts for both packages
```

---

## Getting started

### Prerequisites

- **Node.js 24** (Active LTS); 22.13+ also works. `nvm use` reads [`.nvmrc`](.nvmrc).
- **MongoDB** — a local instance or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- **E-mail** for sign-up codes: a Gmail [App Password](https://support.google.com/accounts/answer/185833)
  for SMTP, or Gmail API credentials (`npm run gmail:token`) where SMTP ports
  are blocked

### 1. Clone and install

```bash
git clone https://github.com/UtshaBasak/BookStoreBD.git
cd BookStoreBD
npm install          # root tooling
npm run install:all  # client + server dependencies
```

### 2. Configure

```bash
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill in `server/.env` with your own values — at minimum `MONGO` and
`JWT_SECRET` (`openssl rand -hex 48`), plus `SMTP_USER` and `SMTP_PASS` for
e-mail. The server checks these at start-up and explains anything missing.

### 3. Run

```bash
npm run dev
```

| Service | URL |
| --- | --- |
| Client | <http://localhost:5173> |
| API | <http://localhost:4000> |
| Health | <http://localhost:4000/health> |

### 4. Add demo data (optional)

Set `SEED_PASSWORD` in `server/.env` to a password of your choice, then:

```bash
npm run seed
```

This creates an administrator, a seller and a buyer
(`admin@`, `seller@` and `buyer@bookstorebd.local`), all using your
`SEED_PASSWORD`, and a small catalogue.

---

## Running with Docker

### The published image

Every change on `master` is published to GitHub Packages as one image that
serves the API and the site together, as the live deployment does:

```bash
docker run -p 4000:4000 \
  -e MONGO="mongodb+srv://<your-cluster>/bookstorebd" \
  -e JWT_SECRET="$(openssl rand -hex 48)" \
  ghcr.io/utshabasak/bookstorebd
```

The image contains no configuration or credentials; every setting from
[`server/.env.example`](server/.env.example) is supplied when it runs.

### Development stack

MongoDB, the API and the client, with hot reload and nothing to install but Docker:

```bash
cp .env.example .env     # then set JWT_SECRET and SEED_PASSWORD
docker compose up --build
docker compose run --rm seed
```

| Service | URL |
| --- | --- |
| Client | <http://localhost:5173> |
| API | <http://localhost:4000> |
| MongoDB | `mongodb://localhost:27017/bookstorebd` |

```bash
docker compose run --rm test   # the server suite, against the stack's MongoDB
docker compose logs -f server  # follow the API log
docker compose down            # stop, keeping the database
docker compose down -v         # stop and discard the database
```

### Production-like stack

```bash
export JWT_SECRET=$(openssl rand -hex 48)
docker compose -f docker-compose.prod.yml up --build
```

The client is served by nginx on <http://localhost:8080> and the API runs
unprivileged with `NODE_ENV=production` and a health check.

---

## Environment variables

### `server/.env`

| Variable | Required | Default | Description |
| --- | :---: | --- | --- |
| `MONGO` | ✅ | — | MongoDB connection string |
| `JWT_SECRET` | ✅ | — | Signs access tokens; at least 32 characters |
| `PORT` | | `4000` | Port the API listens on |
| `NODE_ENV` | | `development` | `development` or `production` |
| `CORS_ORIGINS` | | `http://localhost:5173` | Comma-separated browser origins allowed to call the API |
| `JWT_EXPIRES_IN` | | `15m` | Access token lifetime |
| `REFRESH_TOKEN_TTL_DAYS` | | `30` | Refresh token lifetime |
| `COOKIE_SECURE` | | on in production | `Secure` flag on the refresh cookie |
| `COOKIE_SAME_SITE` | | `lax` | `SameSite` on the refresh cookie |
| `SERVE_CLIENT` | | on in production | Serve `client/dist` from the API process |
| `CLIENT_API_ORIGIN` | | — | Cross-origin deployments only: added to the CSP `connect-src` |
| `PUBLIC_SITE_URL` | | the request's origin | Canonical origin for the sitemap, link previews and e-mails |
| `ADMIN_EMAILS` | | — | Comma-separated e-mails promoted to admin on sign-in |
| `CLOUDINARY_CLOUD_NAME` | | — | Enables image hosting |
| `CLOUDINARY_API_KEY` | | — | Cloudinary API key |
| `CLOUDINARY_API_SECRET` | | — | Signs uploads. Keep it secret |
| `SMTP_SERVICE` | | `gmail` | Nodemailer service name |
| `SMTP_USER` | ✅ ¹ | — | The sender's address |
| `SMTP_PASS` | ✅ ¹ | — | SMTP or App Password |
| `GMAIL_CLIENT_ID` | ¹ | — | Google Cloud OAuth client, for Gmail's API |
| `GMAIL_CLIENT_SECRET` | ¹ | — | Its secret. Keep it secret |
| `GMAIL_REFRESH_TOKEN` | ¹ | — | From `npm run gmail:token`; with all three set, mail goes over HTTPS |
| `RETURN_ADDRESS` | | — | Where approved returns are sent, quoted in the approval e-mail |
| `PASSWORD_BREACH_CHECK` | | on | `off` skips the breached-password check |
| `LOG_LEVEL` | | `debug` dev / `info` prod | pino level |
| `SENTRY_DSN` | | — | Enables error reporting |
| `SENTRY_TRACES_SAMPLE_RATE` | | `0` | Fraction of transactions traced |
| `SEED_PASSWORD` | for seeding | — | Password for the demo accounts `npm run seed` creates |
| `MAX_UPLOAD_BYTES` | | `5242880` | Per-file upload limit (5 MB) |
| `MAX_UPLOAD_FILES` | | `10` | Files per multi-upload request |

¹ For e-mail (sign-up codes, password reset, order updates): `SMTP_USER`, plus
either `SMTP_PASS` or the three `GMAIL_*` values.

### `client/.env`

| Variable | Default | Description |
| --- | --- | --- |
| `VITE_API_URL` | empty (`/api` on the same origin) | Only for a client deployed apart from the API |
| `VITE_PROXY_TARGET` | `http://localhost:4000` | Where the dev server forwards `/api` and `/socket.io` |

> Only `VITE_`-prefixed variables reach the browser. Never put a secret in `client/.env`.

---

## Available scripts

Run from the repository root:

| Script | What it does |
| --- | --- |
| `npm run install:all` | Installs dependencies in `client/` and `server/` |
| `npm run dev` | Runs the API and the client together |
| `npm run dev:server` / `dev:client` | One of them |
| `npm run build` | Compiles the API to `server/dist` and bundles the client |
| `npm start` | Starts the compiled API |
| `npm run typecheck` | Type-checks both packages, tests included |
| `npm run lint` | Lints both packages |
| `npm test` | Runs both test suites (`test:server` / `test:client` for one) |
| `npm run seed` | Seeds demo data (`-- --reset` empties it first) |
| `npm run migrate:images` | Moves inline covers to Cloudinary |
| `npm run gmail:token` | Obtains the Gmail API refresh token |

Before opening a pull request:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

---

## Observability

- One structured [pino](https://getpino.io) log line per request, pretty in
  development and JSON in production
- A correlation id on every request, returned as `X-Request-Id` and attached to
  every line logged while handling it
- Passwords, tokens, cookies and one-time codes redacted before anything is written
- Unhandled server errors reported to [Sentry](https://sentry.io) when `SENTRY_DSN`
  is set; browser errors reported to `/client-error`
- A client error boundary that shows a recovery screen

---

## Image hosting

With `CLOUDINARY_*` set, the browser uploads straight to Cloudinary and the API
stores only the URL:

```text
Browser ──"I want to upload"──▶ API        (signs the request)
Browser ◀──signature + timestamp── API
Browser ────────── file ──────────────────▶ Cloudinary
Browser ◀───────── URL + public_id ───────  Cloudinary
Browser ──"here is the URL"──▶ API         (stores the URL only)
```

Returned URLs are checked against the account's own delivery host, and deleting
a listing removes its images. Without Cloudinary, covers are stored in the
database, so a fresh clone works with no account.

`npm run migrate:images` moves existing inline covers to Cloudinary. It is
idempotent, rewrites a listing only once all its uploads succeed, and offers
`npm run migrate:images:dry` (report only) and `--limit` / `MIGRATE_LIMIT` for
a gradual first run.

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

The server suite runs against a real in-memory MongoDB, with a separate database
per test file so files run in parallel. It is hermetic: it never reads
`server/.env`, and needs nothing installed or running.
[`tests/regressions.test.ts`](server/tests/regressions.test.ts) pins
behaviour that must never change, such as authorisation boundaries and
checkout integrity. Both suites run in CI on every push and pull request.

---

## API reference

Endpoints live under **`/api`**; `/health`, `/robots.txt`, `/sitemap.xml` and
`/llms.txt` are at the root. The client and API share an origin, so the prefix
keeps pages such as `/cart` and endpoints such as `/api/cart` apart.

All routes are rate-limited per IP, with a tighter limit on `/auth`; responses
carry `RateLimit-*` headers and an exhausted limit returns `429`.

### Validation

Every endpoint validates `body`, `query` and `params` with Zod before the
handler runs. Unknown keys are stripped and types are narrowed, so a request
can neither add fields to a document nor pass a query operator. A failure
returns `400` with every problem:

```json
{
  "message": "Validation failed",
  "errors": [
    { "path": "body.email", "message": "Must be a valid email address" },
    { "path": "body.password", "message": "Password is required" }
  ]
}
```

### Authentication

`POST /auth/signin` and `POST /auth/signup` return a short-lived access token
and set a refresh token in an httpOnly cookie:

```json
{ "token": "eyJhbGciOi...", "user": { "id": "...", "username": "...", "email": "...", "role": "user" } }
```

Send the access token as `Authorization: Bearer <token>`.

| | Access token | Refresh token |
| --- | --- | --- |
| Lifetime | 15 minutes | 30 days |
| Stored | Response body | httpOnly cookie, scoped to `/auth` |
| Readable by page JavaScript | Yes | No |
| Revocable | Expires quickly | Yes |

`POST /auth/refresh` returns a new access token and rotates the refresh token;
reusing an exchanged token revokes the whole session family. Only a SHA-256 of
each refresh token is stored. Logging out or resetting a password revokes
sessions. The client refreshes on a `401` and retries, sharing one refresh
across concurrent requests.

The caller's identity always comes from the token, never from the request.

| Access level | Applies to |
| --- | --- |
| **Public** | `/health`, catalogue browsing, `/auth/*`, public profiles and shops |
| **Authenticated** | Cart, wishlist, orders, chat, returns, notifications, profile, creating a listing |
| **Owner** | Editing a listing, reading or updating an order, reading a conversation |
| **Administrator** | Users, every order, returns, payouts, reviews, messages |

An invalid token returns `401`; a valid one without the right role returns `403`.

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/health` | Liveness probe and process uptime |

### Authentication — `/auth`

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/auth/signup` | Create an account (requires a verified one-time code) |
| `POST` | `/auth/signin` | Sign in with email and password |
| `POST` | `/auth/send-otp` | Send a one-time code (`purpose`: `register` or `reset`) |
| `POST` | `/auth/verify-otp` | Verify a one-time code |
| `POST` | `/auth/reset-password` | Reset a password with a valid code; ends every session |
| `POST` | `/auth/password-check` | Whether a password would be accepted: `{ ok, problems, message }` |
| `POST` | `/auth/refresh` | Rotate the refresh cookie and return a new access token |
| `POST` | `/auth/logout` | Revoke the session and clear the cookie |

### Users — `/user`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/user` | One page of accounts (admin) |
| `GET` | `/user/profile` | A profile by `?email=` |
| `PUT` | `/user/profile` | Update your profile (multipart, optional pictures) |
| `POST` | `/user/add-book` | Create a listing with up to 10 images |
| `GET` | `/user/:email/avatar` | A profile picture |
| `GET` | `/user/:email/banner/:role` | A buyer or seller banner |
| `GET` | `/user/shop/:username` | A seller's shop and stats |
| `DELETE` | `/user/:id` | Delete a user (admin) |

### Books — `/book` and `/filter`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/book/admin` | One page of every listing (admin) |
| `GET` | `/book/:id` | Book detail with related titles |
| `GET` / `POST` / `DELETE` | `/book/:id/request` | Your request for a sold-out book: status, ask, withdraw |
| `GET` | `/book/requests/mine` | Open requests for each of your books |
| `GET` | `/book/seller/:email` | Every listing by one seller |
| `PUT` | `/book/update-stock/:id` | Set stock |
| `PUT` | `/book/update-price/:id` | Set price |
| `PUT` | `/book/discount/:id` | Set a discount: `{ type: 'percent' \| 'amount', value }` or `{ type: 'none' }` |
| `DELETE` | `/book/:id` | Delete a listing |
| `GET` | `/filter/booklist` | One page of the catalogue, filtered and sorted |
| `GET` | `/filter/suggest?q=` | Search suggestions: `{ books, sellers }` |
| `GET` | `/filter/featured` | The newest titles |
| `GET` | `/filter/sections` | Every homepage shelf, writers and category counts |
| `GET` | `/filter/by-ids?ids=` | Books in the order given (Recently viewed) |
| `GET` | `/filter/for-you?seen=` | Personal picks |

The catalogue takes `search`, `bookType`, `condition`, `category` (repeatable),
`minPrice`, `maxPrice`, `rating` (1–5, a floor), `inStock`, `deals`, `seller`,
`sort` (`relevant`, `dealPercent`, `dealAmount`, `newest`, `rated`,
`priceLowHigh`, `priceHighLow`), `page` and `pageSize` (up to 50), and returns
`{ items, total, page, pageSize, pageCount }`. Order lists page by order rather
than by line, so a multi-book order is never split across pages.

Admin lists add their own filters and a `sort`:

| List | Filters | `sort` |
| --- | --- | --- |
| `/user` | `kind` = `sellers` \| `buyers` | `newest`, `oldest`, `nameAZ`, `nameZA` |
| `/order/admin/all`, `/order/buyer`, `/order/seller` | `status`, `from`, `to` (YYYY-MM-DD) | `newest`, `oldest`, `totalHigh`, `totalLow` |
| `/book/admin` | `bookType`, `stock` = `in` \| `low` \| `out`, `deals` = `yes` \| `no` | `newest`, `oldest`, `priceHigh`, `priceLow`, `stockLow`, `titleAZ` |
| `/return/requests` | `status` = `pending` \| `approved` \| `rejected` | `newest`, `oldest` |
| `/order/admin/payouts` | `state` = `due` \| `upcoming` \| `paid` | `oldest`, `newest`, `amountHigh`, `amountLow` |
| `/review/flagged` | `rating` | `mostReported`, `newest`, `oldest`, `ratingLow`, `ratingHigh` |
| `/review/all` | `rating`, `replied`, `reported` (`yes` \| `no`) | `newest`, `oldest`, `ratingHigh`, `ratingLow`, `mostReported` |

### Cart and wishlist

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/cart` | The cart, each book with its `cartQuantity` |
| `POST` | `/cart/add/:id` | Add a book; `{ quantity }` for several copies |
| `PATCH` | `/cart/:id` | Set the quantity: `{ quantity }` |
| `POST` | `/cart/remove/:id` | Remove a book |
| `POST` | `/cart/clear` | Empty the cart after checkout |
| `GET` | `/wishlist` | Your wishlist |
| `POST` | `/wishlist/add/:id` | Add a book |
| `POST` | `/wishlist/remove/:id` | Remove a book |

### Orders — `/order`

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/order/decrease-stock` | Place an order, reserving stock atomically |
| `GET` | `/order/buyer` | Your orders, with totals |
| `GET` | `/order/seller` | Your sales, with payout status |
| `GET` | `/order/admin/all` | Every order (admin) |
| `GET` | `/order/:orderNumber` | One order with its lines and totals |
| `PATCH` | `/order/status/:orderNumber` | Move an order on (seller up to Shipped; admin any stage) |
| `POST` | `/order/:orderNumber/cancel` | Cancel, `{ reason? }`, within each role's rules |
| `GET` | `/order/admin/payouts` | Seller payouts: due, upcoming or paid (admin) |
| `POST` | `/order/admin/payouts/paid` | Record a payout with its bKash transaction ID (admin) |
| `DELETE` | `/order/:id` | Delete a line (admin) |

### Returns — `/return`

| Method | Endpoint | Description |
| --- | --- | --- |
| `POST` | `/return` | Request a return with photos; repeat `orderId` for a whole order |
| `GET` | `/return/requests` | Return requests, scoped to the caller |
| `GET` | `/return/requests/:id/image/:n` | One photo, to its buyer or an admin |
| `PATCH` | `/return/requests/:id` | Approve or reject (admin) |

### Reviews — `/review`

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/review/:bookId` | A book's reviews and score |
| `POST` | `/review/:bookId` | Write or update your review (verified buyers) |
| `DELETE` | `/review/:bookId` | Withdraw your review; `?email=` for an admin |
| `POST` / `DELETE` | `/review/:id/reply` | The seller's reply |
| `POST` | `/review/:id/flag` | Report a review |
| `GET` | `/review/flagged` | Reported reviews (admin) |
| `GET` | `/review/all` | Every review (admin) |
| `DELETE` | `/review/:id/flags` | Clear a review's reports (admin) |

Only buyers of a book can review it, and only its seller can reply. A reported
review stays visible until an administrator decides.

### Messages, notifications and more

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/admin/message/audience?audience=` | How many a message would reach (admin) |
| `POST` | `/admin/message` | Send `{ channel, audience, emails?, title, body, link? }` (admin) |
| `GET` | `/notification` | Your notifications with the unread count; `?unreadOnly=1` |
| `POST` | `/notification/read` | Mark `{ ids }` read, or all |
| `GET` / `POST` | `/purchase` | Purchase history |
| `GET` | `/upload/signature` | Signs a direct browser upload |
| `GET` | `/chat/messages` | A conversation, paginated |
| `GET` | `/chat/messages/:id/image` | One attachment, to its participants |
| `GET` | `/chat/history/:email` | Conversations with unread counts |
| `GET` | `/chat/unread/:email` | Total unread messages |
| `POST` | `/chat/message` | Send text, a picture, or both |
| `POST` | `/chat/read` | Mark a conversation read |
| `DELETE` | `/chat/delete` | Delete a conversation |
| `POST` | `/client-error` | A browser error report (rate-limited) |

### Site files

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/robots.txt` | Crawler rules and the sitemap's address |
| `GET` | `/sitemap.xml` | Every public page and book |
| `GET` | `/llms.txt` | A Markdown summary of the shop for AI assistants |
| `GET` | `/book/:id` | The page, with the book's preview tags in its head |

---

## Real-time events

Socket.IO shares the API's HTTP server. A connection authenticates with its
access token (`auth: { token }`) and joins only its owner's room. The server
pushes:

| Event | Payload | Meaning |
| --- | --- | --- |
| `receive_message` | `{ _id, sender, receiver, message, image, timestamp, read }` | A new chat message |
| `notification` | `{ _id, type, title, body, link, read, createdAt }` | A new notification |

Messages are sent with `POST /chat/message`; attachments are delivered as URLs.

---

## Data models

| Model | Collection | Purpose |
| --- | --- | --- |
| `UserTable` | `usertables` | Accounts and profiles |
| `AddBook` | `addbooks` | Listings: details, images, price, stock, seller |
| `Cart` | `carts` | User → book, with quantity |
| `Wishlist` | `wishlists` | User → book |
| `Order` | `orders` | One document per line, grouped by `orderNumber` |
| `Purchase` | `purchases` | Purchase history |
| `ReturnRequest` | `returnrequests` | Return requests and decisions |
| `Review` / `ReviewFlag` | `reviews` / `reviewflags` | Reviews, replies and reports |
| `ChatMessage` | `chatmessages` | Messages with read state |
| `Notification` | `notifications` | The bell's items, kept for 90 days |
| `BookRequest` | `bookrequests` | Requests for sold-out books |
| `RefreshToken` | `refreshtokens` | Hashed, rotating refresh tokens |

---

## Deployment

The live site runs as a single [Render](https://render.com) web service in
Singapore, serving the API and the built site from one origin, with MongoDB
Atlas in the same region. It is described in [`render.yaml`](render.yaml) and
deploys on every push to `master`.

| Setting | Value |
| --- | --- |
| Build | install both packages with dev dependencies, then `npm run build` |
| Start | `npm start` |
| Health check | `/health` |
| Node.js | 24 |

Secrets — `MONGO`, `ADMIN_EMAILS`, the e-mail settings and the Cloudinary
keys — are entered in the service's **Environment** page and never stored in
the repository. Render generates `JWT_SECRET`.

A single service keeps the refresh cookie first-party, so sessions persist
smoothly across access-token renewals.

---

## Roadmap

[`docs/ROADMAP.md`](docs/ROADMAP.md) summarises the engineering upgrades
completed so far — automated tests, Docker, structured logging, validation,
refresh tokens, image hosting, TanStack Query and the TypeScript migration.
[`docs/AUDIT.md`](docs/AUDIT.md) is the production-readiness review, including
the hardening planned next.

---

## Coming soon

| Upgrade | What it brings |
| --- | --- |
| 📱 **E-books** | Digital editions next to printed ones: read on the site, preview the first pages, keep a personal library, and download EPUB or PDF where allowed |
| 🔄 **Book exchange** | Swap finished books with other readers, matched by what each has and wants, with exchange credit so a swap needs no exact partner |
| 💳 **Online payment** | bKash, Nagad and card payments alongside cash on delivery, with refunds to the same account |
| 🚚 **Live courier tracking** | Delivery status straight from the courier |
| 🔔 **SMS alerts** | Order and price alerts by SMS, with per-person preferences for alerts and e-mails |
| ⭐ **Seller ratings** | A rating for each seller from their buyers, shown on every listing |
| 📲 **Mobile app** | The shop as an installable app for Android and iOS |

Track these on the [roadmap issues](https://github.com/UtshaBasak/BookStoreBD/issues?q=label%3Aroadmap),
and share ideas through a [feature request](https://github.com/UtshaBasak/BookStoreBD/issues/new?template=feature_request.md).

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for branch
naming, commit style and the checks CI runs, and the
[Code of Conduct](CODE_OF_CONDUCT.md). Please report security issues privately,
as described in [SECURITY.md](SECURITY.md).

---

## History

BookStoreBD began as **MernBookstore**, a university group project by
[@Prottasha0212](https://github.com/Prottasha0212),
[@jihadul021](https://github.com/jihadul021),
[@deeanatrahman](https://github.com/deeanatrahman) and
[@UtshaBasak](https://github.com/UtshaBasak). The team's version is preserved at
[Prottasha0212/MernBookstore](https://github.com/Prottasha0212/MernBookstore).

This repository continues from it with the full history, so every commit keeps
its author. The tag `team-final` marks the team's last commit:

```bash
git log team-final          # the group project
git log team-final..master  # the continuation
```

The two are deployed separately with separate databases.

---

## License

Released under the [MIT License](LICENSE).
