# Upgrade roadmap

Eight upgrades that move BookStoreBD closer to how a comparable service would
be built and run in industry. Each is self-contained and lands as its own
commit, so any one of them can be reverted without unpicking the others.

## Known CodeQL findings

**18 findings, all false positives**, to be dismissed in the Security tab
rather than fixed in code. Recorded here so the list stays short enough that a
real finding is noticeable.

Measured locally against commit `54c4876` with CodeQL CLI 2.27.0 and query pack
`codeql/javascript-queries` 2.4.5, using the same `javascript-code-scanning`
suite and `javascript-typescript` language the workflow runs. Re-measure with a
clean clone rather than the working tree, so `node_modules` cannot skew it.

| Rule | Count | Why it is not a defect |
| ---- | ----: | ---------------------- |
| `js/sql-injection` | 14 | Every site sits behind a Zod schema that narrows the value to a primitive, so an operator object can never reach Mongoose. CodeQL cannot see through a schema. Adding a generic narrowing pass to `validate.ts` was tried and did not clear them, so it was reverted rather than left in as code with a justification that is not true. |
| `js/xss-through-dom` | 3 | `URL.createObjectURL` can only produce a `blob:` URL; CodeQL models it as taint-propagating regardless. The only barriers the query accepts would corrupt a `blob:` or `data:` URL. The three sites are the file pickers in `ChatWindow`, `ChatPage` and `UpdateProfile`. |
| `js/missing-token-validation` | 1 | The refresh cookie is `SameSite=Lax` and both endpoints that read it are POST, so a browser will not attach it cross-site. Every other endpoint authenticates from the `Authorization` header, which a third-party page cannot set. Pinned by tests asserting the cookie alone authenticates nothing. |

### Dismissing them

Filter by **Rule** in the Security tab and dismiss one group at a time rather
than ticking all 18 at once, so each dismissal carries a reason that is true of
it. Reason: **False positive** for all three groups.

Do not instead silence the rules with a `query-filters` block in `codeql.yml`.
That would hide a real injection just as effectively as a false one; the point
of dismissing individual alerts is that the rule stays live.

Expect them back after a large refactor. A dismissal is tied to an alert's
fingerprint, so when code moves far enough CodeQL opens a fresh alert for the
same thing - which is exactly why the tab showed 169 closed alongside these 18
after the TypeScript migration renamed every file.

**Database query built from user-controlled sources** (14)

```text
False positive. Every one of these sites sits behind a Zod schema that narrows
the value to a primitive before it reaches Mongoose, so an operator object like
{"$ne": null} cannot get through. CodeQL's taint tracking cannot see through the
validate() middleware. Pinned by tests in server/tests/security.test.ts.
```

**DOM text reinterpreted as HTML** (3)

```text
False positive. The source is URL.createObjectURL, which can only ever produce a
blob: URL. safeImageSrc additionally allow-lists the scheme before the value
reaches an <img src>. The only barriers this query accepts would corrupt a blob:
or data: URL.
```

**Missing CSRF middleware** (1)

```text
False positive. The refresh cookie is SameSite=Lax and both endpoints that read
it are POST, so a browser will not attach it cross-site. Every other endpoint
authenticates from the Authorization header, which a third-party page cannot
set. Pinned by tests asserting the cookie alone authenticates nothing.
```

### What changed since the last measurement

The count in this table used to read 21. Two separate drifts, both now checked
rather than assumed:

- `js/xss-through-dom` was recorded as 5. It had already fallen to 3 by
  `45a7472`, before the TypeScript work: `Payment` stopped minting object URLs
  and renders a validated stored URL instead. The table was simply stale.
- `js/clear-text-logging` was 1 and is now 0 — and this one deserves suspicion
  rather than credit. **The behaviour it flagged is unchanged**: `scripts/seed.ts`
  still prints the demo password on purpose, because you cannot sign in to a
  seeded account without being told it. Running the query alone against a
  database built from `45a7472` finds the flow
  (`process.env.SEED_PASSWORD` → `DEMO_PASSWORD` → template literal → `log()` →
  `console.log`) and against the current code does not, on the same CLI and the
  same query pack. Dropping the `unknown[]` annotation on `log` does not bring
  it back, so the annotation alone is not the trigger. Treat it as the analyser
  losing a flow, not as a risk that went away.

---

**Current baseline.** Lint, type-check, build and boot are green from a clean
`npm ci`, and all three package roots report zero dependency vulnerabilities.
CodeQL reports 18 findings, all confirmed false positives, measured against
the current commit and itemised in the table above. Authentication and
authorisation are enforced server-side, sessions use short access tokens with
rotating refresh tokens, and every endpoint that reads a body, query or param
validates it against a Zod schema. All eight tasks are complete: the whole
codebase is TypeScript under `strict`, **209 tests** (155 server, 54 client)
gate every push, `docker compose up` brings the whole stack up with no local
Node or MongoDB install, the API emits structured logs with a correlation id
per request, and book covers can be hosted on a CDN instead of living in the
database.

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
| ~~7~~ | ~~[TanStack Query](#6--tanstack-query-and-the-17-lint-warnings)~~ (task 6) **done** | Larger | 1 | Medium-high |
| ~~8~~ | ~~[TypeScript](#8--typescript)~~ **done** | Larger | 1, 4 | High volume |

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
- `auth.ts` session helpers
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
red test, and `server/tests/regressions.test.ts` covers every defect found in
the audit: the missing `/cart/clear`, the oversell race, the authentication
bypass, the profile PII leak, and the two chat endpoints that used to fail
outright.

**Not delivered from the plan above:** the client smoke renders. The client
suite covers `safeImageSrc`, the session helpers, `apiFetch` and the error
boundary — four files, no page-level render at all. Worth adding, along with
the OTP e-mail flow, which needs the SMTP transport stubbed.

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
- `server/scripts/seed.ts` — sample books, a buyer, a seller and an admin, so
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

`scripts/seed.ts` deliberately keeps `console`, being a CLI whose output is read
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

- `zod` 4.x, `server/middleware/validate.ts`, `server/schemas/<domain>.ts`
- Wire into every route that reads a body, query or param

**This partly replaces existing code, deliberately.** The current
`utils/sanitize.js` helpers (`asTrimmedString`, `asNonNegativeInt`) existed to
narrow request values so a `{"$ne": null}` object can never reach a Mongoose
query. Zod's `.string()` and `.number()` give the same guarantee with far
better error messages, so most of `sanitize.js` retires once schemas are in
place. `middleware/sanitizeRequest.ts` stays as defence in depth.

Schemas also produce static types through `z.infer`, which is why this comes
before TypeScript.

**Done.** `middleware/validate.ts` plus `schemas/common.ts` and
`schemas/index.ts`. All 31 `asTrimmedString` calls removed and
`utils/sanitize.js` deleted; `middleware/sanitizeRequest.ts` stays as defence
in depth.

One endpoint was missed at the time and closed later: `POST /user/add-book`
read a whole multipart body with no schema, because it is the one route whose
body is assembled from form fields rather than JSON. It has one now, which also
does the shaping the handler used to do by hand — `category` arrives as an
array whether it was sent once or five times, and `pages` and `price` as
numbers.

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
  `SERVE_CLIENT` switch, and when that switch is on with no bundle on disk the
  API says so at start-up instead of serving nothing in silence. The nginx
  stack sets `SERVE_CLIENT: 'false'`, because there the bundle is deliberately
  somewhere else and an unheeded warning on every boot is how warnings stop
  being read.

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
   Dropping images entirely was not an option — `Homepage.tsx` and
   `Filter.tsx` render `book.images[0]` straight from the list response.
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

## 6 · TanStack Query and the 17 lint warnings — done

*Landed. Zero warnings, both rules back at `error`, and the API namespaced
under `/api` after the migration exposed a routing collision.*

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

**Done.** `npm run lint` reports zero warnings with both rules at `error`.
`hooks/queries.ts` holds every query and mutation, with the cache keys in one
place so an invalidation cannot miss by typo. The remaining flagged state is
computed during render (a `useMemo` for the filtered catalogue, URL-derived
filters, and React's documented compare-with-previous pattern for resetting a
chat thread).

**Finished later.** Reaching zero warnings did not mean the pattern was gone:
the rule only flags a synchronous `setState` in an effect, not one inside a
`.then()`. Nine pages still fetched in an effect and hand-rolled state that a
hook in `queries.ts` already provided — `admin/TransactionHistory`, `Profile`,
`UpdateProfile`, `Cart`, `Wishlist`, `Filter`, `BookView` and both order
tracking pages. They read from the shared queries now, so opening the cart and
then the wishlist costs one request for each rather than two, and a toggle
updates every page showing it through one invalidation.

Still fetching directly, on purpose: `ChatPage` and `ChatWindow`, which page
through history and take live updates over a socket rather than through the
cache, and the three writes in `Payment`, which are mutations mid-checkout.

The migration exposed a real bug that predated it. Making the app same-origin
in task 2 put the API at the root alongside the client routes, and five of them
collide: `/cart`, `/wishlist`, `/book`, `/chat` and `/filter` are each both a
page and an endpoint. Opening the cart in a browser returned
`{"message":"Authentication required"}` instead of the page. The API now lives
under `/api`, which removes the whole class of collision, and the refresh
cookie's path moved with it — scoped to `/auth` it would never have been sent
to `/api/auth/refresh`.

---

## 8 · TypeScript — done

*Landed. Every source file in both packages is TypeScript under `strict`, and
one shared declaration file is the contract between them.*

Largest effort, largest payoff for how the project reads to an outside
reviewer.

**What it looks like now**

| | Server | Client |
| --- | --- | --- |
| Checked by | `tsc --noEmit`, tests included | `tsc --noEmit`, tests included |
| Built by | `tsc -p tsconfig.build.json` → `dist/` | Vite (strips types, does not check) |
| Run in development by | nodemon + `tsx` | the Vite dev server |
| Run in production by | `node dist/index.js` | nginx, or the API with `SERVE_CLIENT` |

Relative imports keep their `.js` extension — `./app.js` for `app.ts` — because
the specifier describes the emitted module. Nothing had to be rewritten to
introduce the build, and nothing would have to be rewritten to remove it.

**The contract**

`server/shared/api.d.ts` declares every request and response the HTTP API uses.
Both packages compile against that one file, so a shape cannot change on one
side without the other failing to type-check. It is a declaration file on
purpose: types and nothing else, erased at compile time, so neither package
gains a runtime dependency on the other.

Request shapes are not written out twice. `schemas/index.ts` exports a
`z.infer` type per endpoint for the handlers, and `types/contracts.ts` asserts
at compile time that everything the client may send is something the endpoint's
schema accepts. Breaking one of those assertions deliberately was the first
thing done after writing them — it fails the build, as it should.

**Bugs the compiler found**

None of these were caught by lint, tests or CodeQL, because none of them are
syntactically wrong. They are all places where two parts of the code disagreed
about a shape.

- `PATCH /order/status/:orderNumber` answers with the raw order *lines*, but
  the buyer and seller tracking pages stored that response as if it were the
  summarised order. Changing a status blanked the page until the next reload.
  Both now read the order back.
- Those same two pages looked for the signed-in role under `localStorage.role`,
  while the session stores it under `userRole`. The status control they guard
  was therefore never shown to anyone.
- The catalogue table mapped sellers with `user.name`, a field the user record
  does not have, so the column always fell back to the e-mail address.
- `AddBook` passed `min` and `step` to a local `InputField` that never forwarded
  them, so the numeric constraints on price and page count did nothing.
- A `':hover'` key sat inside a React inline style object. React writes style
  objects onto `element.style`, so a pseudo-selector there has never had any
  effect.
- `POST /purchase` passed a `quantity` the Purchase model has no field for, and
  the seed script passed a `country` the user model has no field for. Mongoose
  drops unknown paths silently; both are gone.
- `/user/signup` and `/user/signin`, kept as aliases of the `/auth` routes,
  were not running the Zod schemas their canonical counterparts run. They are
  now.
- `RefreshToken.isUsable()` was dead: the rotation logic needs to distinguish
  *why* a token is unusable, so it checks the fields directly.

Two things the types could not decide on their own, left as they are and
recorded here instead: the catalogue's star filter and "most popular" sort read
`rating` and `numReviews`, which no endpoint returns and no model stores, so
both currently do nothing — whether to build ratings or drop the controls is a
product decision, not a typing one.

**One mistake worth recording.** The access-log serializer reads
`req.remoteAddress`, which looked wrong: a raw Node request keeps the address on
`req.socket`. Changing it produced a log line with no client address at all,
because pino-http wraps custom serializers by default and hands them pino's
*already serialised* request, where `remoteAddress` is exactly right. The test
written to prove the "fix" is what caught it, and it stayed — the field is now
pinned by an assertion rather than by nobody looking.

**One real bug of the migration's own making, avoided.** Compiling to `dist/`
moves the running module one directory deeper, so anything resolved from
`import.meta.url` — the uploads directory, the client bundle — would have
silently pointed at `server/dist/...` in production and nowhere in particular.
`config/paths.ts` finds the package root by walking up to the nearest
`package.json`, which gives the same answer from source and from a build; both
were checked.

**Not done, deliberately.** `noUncheckedIndexedAccess` is off. Turning it on
would add a null check to every array index and object lookup in the codebase
for very little here, where the indexes are nearly all `map` callbacks and
lookups the code has just populated.

---

## Working agreement

- One task per commit, each self-contained and revertible.
- Before every commit: `npm run lint`, `npm run typecheck`, `npm test`,
  `npm run build`, and a CodeQL run for anything touching request handling.
  The type-check is the one that catches a type error — `tsx` and Vite both
  strip types without looking at them.
- New environment variables land in the matching `.env.example` **and** the
  README table in the same commit.
- New endpoints land in the README API reference in the same commit.

Deployment work stays paused until the project runs cleanly end to end
locally. Tasks 2 and 7 change the deployment shape, so Render configuration is
best revisited after both are done.
