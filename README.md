<div align="center">

# 📚 BookStoreBD

**A MERN marketplace for new and second-hand books — with role-based access, order tracking and real-time buyer–seller chat.**

[![CI](https://github.com/UtshaBasak/MernBookstore/actions/workflows/ci.yml/badge.svg)](https://github.com/UtshaBasak/MernBookstore/actions/workflows/ci.yml)
[![CodeQL](https://github.com/UtshaBasak/MernBookstore/actions/workflows/codeql.yml/badge.svg)](https://github.com/UtshaBasak/MernBookstore/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20.19-brightgreen.svg)](.nvmrc)

[**Live demo**](https://bookstorebd.vercel.app) · [Report a bug](https://github.com/UtshaBasak/MernBookstore/issues/new?template=bug_report.md) · [Request a feature](https://github.com/UtshaBasak/MernBookstore/issues/new?template=feature_request.md)

</div>

---

## Table of contents

- [Overview](#overview)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [API reference](#api-reference)
- [Real-time events](#real-time-events)
- [Data models](#data-models)
- [Deployment](#deployment)
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
| Frontend     | React 19, React Router 7, Vite 8, Tailwind CSS 4         |
| Backend      | Node.js, Express 5                                       |
| Database     | MongoDB with Mongoose 9                                  |
| Real-time    | Socket.IO 4                                              |
| HTTP clients | Axios and the native `fetch` API                         |
| Uploads      | Multer (in-memory, persisted as base64)                  |
| Hardening    | express-rate-limit, request sanitisation                 |
| Email        | Nodemailer                                               |
| Tooling      | ESLint 10, GitHub Actions, CodeQL                       |

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
[`client/src/config/api.js`](client/src/config/api.js), which reads `VITE_API_URL`
and falls back to the deployed API — so pointing the app at a local server is a
one-line change in `client/.env`.

On the server, [`app.js`](server/app.js) exports a side-effect-free `createApp()`
factory (no `listen`, no database connection), while [`index.js`](server/index.js)
owns the bootstrap: validate environment, connect to MongoDB, listen, attach
Socket.IO, and shut down gracefully on `SIGINT`/`SIGTERM`.

---

## Project structure

```text
MernBookstore/
├── client/                      # React + Vite single-page app
│   ├── public/                  # Static assets served as-is
│   ├── src/
│   │   ├── components/          # Reusable UI (chat window, table, spinner…)
│   │   ├── config/
│   │   │   └── api.js           # API origin + authenticated fetch/axios
│   │   ├── pages/               # Route-level screens
│   │   │   ├── admin/           # Admin-only screens
│   │   │   └── buyer/           # Buyer-only screens
│   │   ├── styles/              # Shared stylesheets
│   │   ├── utils/               # Socket.IO singleton, safe image sources
│   │   ├── App.jsx              # Router and route guards
│   │   └── main.jsx             # React entry point
│   ├── .env.example
│   ├── eslint.config.js
│   ├── index.html
│   └── vite.config.js
│
├── server/                      # Express REST API + Socket.IO gateway
│   ├── config/
│   │   ├── cors.js              # Origin allow-list
│   │   ├── database.js          # Mongoose connection lifecycle
│   │   └── env.js               # Typed, validated environment config
│   ├── controllers/             # Request handlers, one per domain
│   ├── middleware/
│   │   ├── auth.js              # Token verification, role and owner guards
│   │   ├── errorHandler.js      # 404 + centralised error responses
│   │   ├── rateLimit.js         # Per-IP request ceilings
│   │   └── sanitizeRequest.js   # Strips Mongo operator keys from input
│   ├── models/                  # Mongoose schemas
│   ├── routes/                  # Express routers, one per domain
│   ├── sockets/
│   │   └── chatSocket.js        # Socket.IO room and message handling
│   ├── utils/
│   │   ├── error.js             # Error factory used by controllers
│   │   ├── jwt.js               # Access token signing and verification
│   │   └── sanitize.js          # Narrows request values before a query
│   ├── .env.example
│   ├── app.js                   # createApp() factory
│   └── index.js                 # Bootstrap and graceful shutdown
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   └── workflows/               # CI and CodeQL
├── .editorconfig
├── .nvmrc
├── LICENSE
└── package.json                 # Root scripts that drive both packages
```

---

## Getting started

### Prerequisites

- **Node.js 20.19 or newer** (`nvm use` picks up [`.nvmrc`](.nvmrc)) — required by Mongoose 9
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

## Environment variables

### `server/.env`

| Variable           | Required | Default                                                | Description                                             |
| ------------------ | :------: | ------------------------------------------------------ | ------------------------------------------------------- |
| `MONGO`            |    ✅    | —                                                      | MongoDB connection string                               |
| `PORT`             |          | `4000`                                                 | Port the API listens on                                 |
| `NODE_ENV`         |          | `development`                                          | `development` or `production`                           |
| `CORS_ORIGINS`     |          | `http://localhost:5173,https://bookstorebd.vercel.app` | Comma-separated browser origins allowed to call the API |
| `JWT_SECRET`       |    ✅    | —                                                      | Signs access tokens; must be 32+ chars, else start fails |
| `JWT_EXPIRES_IN`   |          | `7d`                                                   | Access token lifetime                                   |
| `ADMIN_EMAILS`     |          | —                                                      | Comma-separated e-mails promoted to admin on sign-in    |
| `SMTP_SERVICE`     |          | `gmail`                                                | Nodemailer service name                                 |
| `SMTP_USER`        |   ✅ ¹   | —                                                      | SMTP account used as the sender                         |
| `SMTP_PASS`        |   ✅ ¹   | —                                                      | SMTP password or app password                           |
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
| `npm run dev:server`  | Runs the API alone with hot reload (nodemon)          |
| `npm run dev:client`  | Runs the Vite dev server alone                        |
| `npm run build`       | Produces the production client bundle                 |
| `npm run preview`     | Serves the built client locally                       |
| `npm start`           | Starts the API in production mode                     |
| `npm run lint`        | Lints both packages                                   |

---

## API reference

Base URL: `http://localhost:4000` in development.

All routes sit behind a per-IP rate limiter (see
[`server/middleware/rateLimit.js`](server/middleware/rateLimit.js)); `/auth` is
held to a tighter ceiling than the rest. Responses carry `RateLimit-*` headers,
and an exhausted limit returns `429`.

### Authentication

`POST /auth/signin` and `POST /auth/signup` return a signed JWT:

```json
{ "token": "eyJhbGciOi...", "user": { "id": "...", "username": "...", "email": "...", "role": "user" } }
```

Send it on every protected request:

```
Authorization: Bearer <token>
```

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
| `POST` | `/auth/reset-password` | Reset a password using a valid OTP                      |

### Users — `/user`

| Method   | Endpoint              | Description                                   |
| -------- | --------------------- | --------------------------------------------- |
| `GET`    | `/user`               | List all users (admin)                        |
| `GET`    | `/user/profile`       | Fetch a profile by `?email=`                  |
| `PUT`    | `/user/profile`       | Update a profile (multipart, optional avatar) |
| `POST`   | `/user/add-book`      | Create a listing with up to 10 images         |
| `POST`   | `/user/upload-images` | Upload images for the return form             |
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
| `GET`    | `/filter/booklist`        | List every book                        |
| `POST`   | `/filter/booklist_filter` | Filter by a whitelisted field          |
| `POST`   | `/filter/booklist_search` | Case-insensitive title search          |

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

The project is deployed as two independent services.

**Client → [Vercel](https://vercel.com)**

| Setting          | Value                       |
| ---------------- | --------------------------- |
| Root directory   | `client`                    |
| Build command    | `npm run build`             |
| Output directory | `dist`                      |
| Environment      | `VITE_API_URL=<api origin>` |

**Server → [Render](https://render.com)**

| Setting        | Value                                                      |
| -------------- | ---------------------------------------------------------- |
| Root directory | `server`                                                   |
| Build command  | `npm ci`                                                   |
| Start command  | `npm start`                                                |
| Environment    | everything in [`server/.env.example`](server/.env.example) |

Add the deployed client origin to `CORS_ORIGINS` on the server, without a
trailing slash — browsers send the `Origin` header without one.

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the branch
naming convention, commit style, and the checks that run in CI.

---

## License

Released under the [MIT License](LICENSE).
