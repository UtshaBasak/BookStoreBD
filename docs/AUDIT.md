# Production-readiness audit

How BookStoreBD measures against what a consumer-facing marketplace is expected
to do, what has been done, and the hardening planned next. First audited at
commit `a1ad1d0`. Every result was measured against the running application.
To repeat the baseline:

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm audit                                    # in ., client/, server/
docker compose -f docker-compose.prod.yml up -d --build
curl -sI http://127.0.0.1:8080/api/book      # response headers
```

## Summary

All nine items in the [order of work](#order-of-work) are complete. Planned
hardening, none of which blocks a launch:

| Item | Priority |
| --- | --- |
| [S3](#s3--access-token-in-localstorage) · Hold the access token in memory rather than `localStorage` | Medium |
| [S7](#s7--bcrypt-cost-factor) · Raise the bcrypt cost factor from 10 to 12 | Low |
| [P4](#p4--image-storage) · Move covers out of MongoDB; thumbnails at upload | Low |
| [Interface](#planned-interface-work) · Dialog component, loading and empty states, accessibility, remaining inline styles | Medium |
| [Business capability](#5--business-capability) · Online payments, seller verification, search indexing, analytics | Product roadmap |
| Review of the policy pages by someone legally qualified, with the legal entity name | Before scaling |

---

## 1 · Functional status

| Check | Result |
| --- | --- |
| Lint, both packages | clean |
| Type-check under TypeScript 6.0.3 | clean |
| Tests | 571 passing (397 server, 174 client) |
| `npm audit`, all three roots | 0 vulnerabilities |
| Builds | API compiles to `dist/`, client bundles |
| Production stack | browse, detail, cart, wishlist, profile, orders, clear — all `200` |
| Session lifecycle | sign-in `200` → refresh `200` → replay `401` → logout `204` |

---

## 2 · Security and privacy

| # | Finding | Severity | Status |
| --- | --- | --- | --- |
| S1 | Security response headers | High | Resolved |
| S2 | Account enumeration on sign-in, sign-up and reset | Medium | Resolved |
| S3 | Access token kept in `localStorage` | Medium | Planned |
| S4 | Upload type validation | Medium | Resolved |
| S5 | Per-code OTP attempt limit | Medium | Resolved |
| S6 | `X-Powered-By: Express` disclosed | Low | Resolved |
| S7 | bcrypt cost factor 10 | Low | Planned |
| P1 | Footer policies with no pages behind them | High (trust, compliance) | Resolved |
| P2 | Account deletion and data export | Medium | Resolved |
| P3 | Audit trail for administrator actions | Medium | Resolved |
| P4 | Covers and chat images stored as base64 in MongoDB by default | Low | Partly resolved |

### S1 · Security response headers

Sent on every response, including errors:

| Header | Value |
| --- | --- |
| `Content-Security-Policy` | `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, and an enumerated `img-src` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb all denied |

`helmet` sets them for the API ([`config/securityHeaders.ts`](../server/config/securityHeaders.ts))
and `nginx.conf` for the HTML document, since CSP applies per document; a
comment in each points to the other. A new image host means editing
`IMAGE_SOURCES` and the `map` block in `nginx.conf`; a cross-origin deployment
also needs `CLIENT_API_ORIGIN`. The policy needs no `'unsafe-eval'` or inline
script. `style-src` allows `'unsafe-inline'` for libraries that inject
`<style>`, a far weaker vector.

The CSP is **enforced**, not report-only: every external origin was enumerated
from the source, and `/`, `/filter` and `/sign-in` mount with **zero CSP
violations** in headless Chrome. Re-run after adding a script, font or image
host:

```bash
chrome --headless=new --remote-debugging-port=9222 about:blank &
node scripts/cspcheck.mjs 9222 http://127.0.0.1:8080/ http://127.0.0.1:8080/filter
```

Eight tests in `server/tests/securityHeaders.test.ts`.

### S2 · Account enumeration

Sign-in, sign-up and reset answer identically whether or not an address has an
account, so an address list cannot be narrowed to this shop's customers, the
first step of credential stuffing. Measured on the production stack:

| Request | Before | After |
| --- | --- | --- |
| sign-in, real address, wrong password | `401 Wrong credentials!` | `401 Invalid email or password` |
| sign-in, no account | `404 User not found!` | `401 Invalid email or password` |
| reset, real address | `200 OTP sent to email` | `200 If that address has an account, a reset code is on its way.` |
| reset, no account | `404 No account found with this email.` | `200 If that address has an account, a reset code is on its way.` |
| sign-up, taken address | `400 This email is already in use.` | `200 If that address can be registered, a code is on its way.` |
| sign-up, free address | `200 OTP sent to email` | `200 If that address can be registered, a code is on its way.` |

- **Timing.** With no account, sign-in compares against a throwaway bcrypt
  hash: **86.7 ms** against **97.1 ms**, within noise. Code delivery is
  detached from the response (**7.7 ms** against **6.6 ms**), which also keeps
  the form responsive.
- **Taken addresses.** Sign-up e-mails the owner that someone tried to
  register, suggesting sign-in or reset.
- **Usernames** are public on every listing, so sign-up says when one is taken,
  by design. The check runs only when a username is supplied, since
  `findOne({ username: undefined })` drops the key and matches any user.
- The auth pages show the message as a sentence and do not log form data.

Fourteen tests in `server/tests/enumeration.test.ts` compare known and unknown
answers side by side, so any divergence fails regardless of wording.

### S3 · Access token in `localStorage`

*Planned hardening, priority Medium.* The refresh token is httpOnly. The
15-minute access token is in `localStorage`, readable by a successful script
injection, which the enforced CSP (S1) already makes much harder. The plan:
hold the access token in a module variable and re-acquire it from
`/auth/refresh` on load. `config/api.ts` already shares one in-flight refresh,
so most of the mechanism exists.

### S4 · Upload type validation

```text
before:  status=201  images: ["data:text/plain;base64,R0lGODlhLW5vdC1yZWFsbHkt…"]
after:   status=415  {"message":"cover.png is not a PNG, JPEG, WebP or GIF image"}
```

A `fileFilter` refuses declared types other than PNG, JPEG, WebP and GIF before
buffering. The leading bytes are then checked, since `Content-Type` is chosen
by the client, and the sniffed type is the one stored in the `data:` URI.
Oversized uploads answer `413 File too large`, and file pickers list exactly
the four types. Eight tests; on the running stack, a text file gets 415, a PNG
201, and 6 MB 413.

### S5 · OTP attempt limit

Beyond `authLimiter` (50 requests per IP per 15 minutes), five wrong attempts
discard a code. The count is on the code's record, so it pools attempts from
any address and is shared by `verify-otp` and `reset-password`. Wrong, expired,
discarded and never-issued codes get the same response, so the limit cannot
confirm a code exists (see S2). Six tests, each confirmed to fail when the
limit is raised.

Codes live in a MongoDB collection with a TTL index, so they survive restarts
and are shared across instances (confirmed by issuing in one process and
redeeming in another). Each is stored as an HMAC under the server's secret, as
a plain hash of six digits is trivially reversed.

### S6 · `X-Powered-By`

`app.disable('x-powered-by')`, pinned by a test.

### S7 · bcrypt cost factor

*Planned hardening, priority Low.* Passwords are hashed with bcrypt at cost 10.
The plan: raise it to 12 with a rehash-on-login step, so existing hashes keep
working and upgrade on next sign-in.

### P1 · Policy pages

The footer links to `/privacy`, `/terms`, `/returns`, `/about` and `/contact`,
written from the code so they can be checked against it. The privacy policy
names the stored fields, the single non-tracking cookie, and the third parties
that see data (Cloudinary, the mail provider, Sentry when enabled). The returns
policy states the window enforced in `server/config/commerce.ts` (7 days from
delivery) and the `ReturnRequest` flow; a test fails if page and code disagree.
Business details live once in [`client/src/config/site.ts`](../client/src/config/site.ts).
A review by someone legally qualified, with the legal entity name, is
recommended before scaling.

### P2 · Account deletion and data export

Covers GDPR Articles 15 and 17; both actions are on the profile page under
"Your data". **`GET /user/me/export`** downloads a JSON file of the account,
orders placed and received, purchases, returns, cart, wishlist, listings and
messages, without the password hash (a test asserts no `$2`).
**`DELETE /user/me`** requires the password again, so a lifted access token
cannot erase an account; a wrong password answers `403`, as the client treats
`401` as an expired session.

| Data | Result |
| --- | --- |
| account, cart, wishlist | deleted |
| listings | deleted, as a listing with no seller cannot be bought |
| orders, purchases, return requests | **kept, anonymised** |
| messages | **kept, anonymised**, as a conversation also belongs to the other person |
| every session | revoked |

The address becomes a tombstone in the reserved `.invalid` domain, contact
details are emptied, and messages read "Deleted user". Against the running
stack:

```text
{"message":"Your account has been deleted.","ordersAnonymised":1,…}

orderNumber:     'A4AKZKZDG89XEICL'          // the sale is still there
buyerEmail:      'deleted-d2b15b75@removed.invalid'
title:           'The C Programming Language'
price:           850
contactName:     ''
contactPhone:    ''
deliveryAddress: ''
```

Eighteen tests.

### P3 · Audit trail

An `AuditLog` row records every privileged change: deleting a user, changing
or deleting an order, resolving a return, removing a review, and closing one's
own account. Each holds the actor's id, address and role, the target, detail
such as an order's *from* and *to* status, and the request id. The actor's
address is copied, so the trail stays readable after an account is deleted.
`GET /api/audit` lists it newest first, filtered and paged, for administrators
only. A failed write is logged at error level rather than thrown, as the change
has already succeeded. Eight tests; read back from the running stack:

```text
order.status | admin@bookstorebd.local | A4AKZKZDG89XEICL | {from: 'Order Confirmed', to: 'Shipped', lines: 1}
```

### P4 · Image storage

*Partly resolved; remainder planned, priority Low.* Without Cloudinary, covers
and chat attachments are stored inline by design, so a fresh clone needs no
account. The larger cost was transfer, which is resolved: responses carry
`/api/book/<id>/cover/<n>`, served with `Cache-Control` and an `ETag` as a lazy,
cacheable image request. Covers hosted elsewhere are redirected to. On 66
listings with photographed covers:

```text
GET /api/filter/booklist        7,406,560 bytes   5,734,034 gzipped   (inline)
GET /api/filter/booklist            3,098 bytes gzipped               (addresses)
GET /api/book/<id>/cover/0         92,171 bytes, ETag, 304 on a repeat visit
```

| Emulated 4G, cold cache | Homepage | Catalogue |
| --- | --- | --- |
| transferred | 465 KB | 818 KB |
| requests | 14 | 16 |
| first contentful paint | 600 ms | 896 ms |

Most of the remainder is the covers, about 90 KB each. Planned: configure
Cloudinary (the migration script exists) for resized, modern-format images from
a CDN and out of the database, or generate thumbnails at upload.

---

## 3 · Product and interface

### Resolved defects

- **Placeholder images.** References to `via.placeholder.com`, which no longer
  resolves, and to a missing `/books/default-book.jpg` use a local SVG through
  `PLACEHOLDER_IMAGE`, with no network call or CSP entry.
- **Public book pages.** `/book/:id` is public, as in the API; account-only
  actions ask for sign-in where used, as does "Chat with Seller".
- **Multi-book checkout.** Order lines share an order number, so the unique
  index is compound on `(orderNumber, bookId)`, and `syncIndexes()` on connect
  updates existing databases. Two tests.

### Ratings and reviews

- **Verified purchasers only**: a review requires an order for the book, and
  carries a **Verified purchase** badge. Sellers cannot review their own books.
- **One per person per book**, by unique index; a second replaces the first.
  Authors edit and withdraw; administrator removal is audited.
- `ratingAverage` and `ratingCount` are denormalised onto the listing, rounded
  to one decimal, so the catalogue filters and sorts without a join.
- The book page shows average, count and distribution. The catalogue has a
  minimum-stars filter, a "Highest rated" sort (ties broken by count), and
  stars on every card; listings publish an `aggregateRating`.
- Reviews outlive their author's account, under "Deleted user".
- **Seller replies**: one per review, from that book's seller only, replacing
  any earlier reply.
- **Reports**: once per signed-in user, stored per reporter with reasons.
  Reporting hides nothing, so it cannot suppress a review. The administrator
  clears the reports or removes the review.

Thirty-seven server and eighteen client tests, and the reply, report and queue
path driven end to end in Chrome.

### Notifications instead of `alert()`

All 38 `alert()` calls go through `useToast` on the mounted `notistack`
provider: confirmations for 3 s, failures 6 s, in sentence case. A signed-out
shopper adding to the cart sees "Sign in to use your cart." with a **Sign in**
button, via `promptSignIn` on five pages. Verified in headless Chrome: the page
stays usable, the button reaches `/sign-in`, toasts fit 8 px gutters at 390 px,
and there are no CSP violations. Twelve tests, and `no-alert` is an ESLint
error. Two `window.confirm` calls remain, each with a documented rule
exemption, until a dialog component exists.

### Responsive layout

[`scripts/responsivecheck.mjs`](../scripts/responsivecheck.mjs) drives headless
Chrome and reports overflow, clipped content, small controls and the smallest
type. All 27 routes were measured at 360, 768 and 1280 px, signed out and in
every role, with real orders, cart and wishlist.

| | Before | After |
| --- | --- | --- |
| Routes that scrolled sideways | 6 | **0** |
| Worst overflow (`/chat`, 360 px) | +999 px | **0** |
| Routes with content clipped and unreachable | 1 | **0** |
| Controls under 40 px at 360 px | 60 across 11 routes | **0** |
| Smallest type | 10 px | 12 px |

On the shopper's path at 360 px, `/filter` went from +682 px of overflow and 21
small controls to none; `/` (13), `/book/:id` (5), `/cart` and `/wishlist` (6)
went to zero. `/privacy` went from 12 to 2, its text-sized `mailto:` links in
prose, kept by design.

- **Global styles.** `body` is a block, so the 18 `width: 100vw` workarounds
  (which count the scrollbar) are `100%`. Starter `button` padding is removed,
  so icons render full size, and `.scroll-button` overlays the carousel.
- **Scoped stylesheets.** Vite bundles page stylesheets globally, and unlayered
  rules beat Tailwind 4's layered utilities, so `UserManagement.css`,
  `AdminPanel.css` and `Homepage.css` are scoped to their pages.
- **Layouts.** On a phone the catalogue is one column with a collapsible
  "Filters" button showing the active count; checkout, the cover column,
  order tracking and `/seller-books` stack or wrap; chat shows the list, then
  the conversation; the admin sidebar becomes a strip below 900 px. Tables
  scroll within `.table-scroll`.
- **Controls.** Icon controls are real buttons, keyboard-operable, and
  checkboxes and radios have padded labels (measured as the label's area).
- **Tokens.** The palette is `@theme` tokens (`bg-brand`, `text-accent`)
  replacing literals such as `#e65100` (75 uses) and `#8B6F6F` (47). The homepage
  hero shows `banner.png`. Unused `src/App.css` and `tailwind.config.js` were
  removed.

| Interface measurement | Value |
| --- | --- |
| Inline `style={{…}}` vs `className` | 648 vs 124 → **639 vs 153** |
| Responsive breakpoints | 2 Tailwind utilities → **19**, 3 media queries |
| `100vw` usages | 15 → **0** |
| `alert()` / `window.confirm` | 38 → **0** / 2 |
| `notistack` | 0 uses → **13 files** |
| Inputs vs labels | 49 vs 25 |
| Images without `alt` | 4 of 21 |

### Planned interface work

- **Inline styles** on working pages move to Tailwind classes and theme tokens,
  making a redesign a configuration change.
- **Loading, empty and error states.** Pages show `Loading...` as text; the
  queries already expose `isPending` and `isError` for skeletons and empty
  states such as "No books match these filters".
- **Accessibility.** Label every input, add alt text to the four remaining
  images, add a skip link, and move focus on route change. The markup is
  otherwise sound: 96 real `<button>` elements against one clickable `<span>`.
- **A dialog component** for the two `window.confirm` calls, and one homepage
  banner rather than two.

---

## 4 · Growth and performance

### SEO

- `useSeo` sets title, description, canonical URL, Open Graph and Twitter card
  per route, in about sixty lines. `ProtectedRoute` sets `noIndex`, covering
  every private route, including future ones.
- The API generates `/robots.txt` and `/sitemap.xml` at the root, listing
  current books with absolute URLs. The origin comes from `X-Forwarded-Proto`
  and `X-Forwarded-Host`, validated so a forged host gets no sitemap;
  `PUBLIC_SITE_URL` overrides it once the domain is fixed. Nine tests,
  including XML escaping and no private URLs.
- **Structured data**: a `WebSite` with a `SearchAction` on the homepage, and a
  `Book` with an `Offer` (BDT price, condition, availability) per listing.
  Titles are escaped so a listing cannot close the `<script>` block.
- **Link previews.** Social scrapers do not run JavaScript, so `index.html`
  carries site defaults and the server writes each book's title, price and
  cover into the head for `/book/:id` (`server/utils/sharePreview.ts`).
- **404** offers the homepage and catalogue, with `noindex` because a
  single-page app answers 200 for every path.

### Code splitting

Every route except the homepage, the most common first page, is a lazy chunk
behind a `Suspense` fallback: a 72% reduction in code needed before first
render.

| | Before | After |
| --- | --- | --- |
| Application chunk | 228.31 kB (51.30 kB gzipped) | **64.49 kB (19.55 kB)** |
| Chunks in `dist/assets` | 4 | 32 |

### Pagination and server-side filtering

The catalogue shows twelve books per page with a pager and count (12 cards, 326
DOM nodes per page against 36 books). List covers use `loading="lazy"` and
`decoding="async"`; the homepage hero stays eager. Filtering, sorting and
paging run in the API, each filter a named query parameter, replacing the
`{ filter_key, filter_input }` pair that let a caller name the document path.

```text
                every listing                  one page
catalogue       140,180 bytes, 23 ms (307)  →  5,519 bytes, 7 ms (constant)
book table      every listing and user      →  11,811 bytes for 25 rows
users           10,890,235 bytes (303)      →  3,661 bytes
returns          9,760,991 bytes (120)      →  9,717 bytes
orders             495,514 bytes (400)      →  30,450 bytes (25 orders, 49 lines)
```

- **Indexes end in `_id`**, because the catalogue sorts by `{ <field>, _id }`
  for stable pages and an index serves a sort only as a key prefix: 12
  documents examined per page instead of a collection scan and in-memory sort.
  Query-plan tests guard the catalogue and admin tables.
- **User Management** selects only name, e-mail and join date, and filters on
  `role: 'user'` rather than `$ne: 'admin'`, since an inequality on an index's
  leading field leaves the sort unindexed: 25 keys read instead of 303.
- **Return photographs** are served by address to the buyer or an
  administrator; "View Images" fetches with the session and opens a blob.
- **Orders page by order**, never splitting a purchase, and each line carries
  its `returnStatus`.

### Chat attachments

Attachments are served by address, to the two participants only, through an
image component that carries the session, and the conversation list comes from
a summary query. Against 60 messages, a third with a photograph:

```text
conversation list    1,097,096 bytes loaded  →    214 bytes sent
one page of thread     381,729 bytes         →  4,113 bytes
```

Profile pictures are served the same way, publicly. Attachment bytes stay in
MongoDB by design, as Cloudinary would place private pictures on public URLs.
Image-only messages are supported.

### Client error reporting

The client's 16 `console` calls go through `reportError`, which logs in
development and is compiled out of production (`import.meta.env.DEV` becomes a
literal; esbuild's `drop` option does not apply under Vite 8's Rolldown). The
built application chunks contain no `console` calls.

In production, `reportError`, `window.onerror` and `unhandledrejection` post to
`POST /client-error`, which logs the report with request id, URL, stack and
account, and forwards it to Sentry when configured. Each failure is reported
once per session, up to twenty: in a production build, twelve thrown errors
produced three reports, all `204`. The Sentry browser SDK is not included, by
design (about 30 KB, an extra CSP origin, inert without an account);
source-mapped stacks and alerting can be added on the same seam.

---

## 5 · Business capability

| Capability | Status |
| --- | --- |
| Transactional e-mail | Built: order confirmed, delivered and cancelled; returns requested and decided |
| Reviews | Built, with seller replies and reporting ([above](#ratings-and-reviews)) |
| Seller payouts | Built: bKash payouts after the return window, less a 5% fee, recorded with the transaction ID |
| Search | Server-side, with Bangla-English phonetic matching. Planned: a MongoDB text index, then Atlas Search, as the catalogue grows |
| Payments | Cash on delivery. Planned: bKash, Nagad or SSLCommerz, with webhooks, payment states and reconciliation |
| Seller onboarding | Any signed-in user can list. Planned: verification and a seller agreement |
| Analytics | Planned: searches, checkout abandonment and listing conversion, to guide what to build next |

---

## Order of work

Cheap, high-value items first, so each step shipped on its own. All nine are
complete; items 1 to 4 took about an afternoon each, and item 5 the longest.

| Order | Work | Rationale |
| ---: | --- | --- |
| 1 | Security headers (S1, S6) | One dependency and a few nginx lines; the largest gap |
| 2 | Local placeholder, policy pages (P1) | Visible trust signals |
| 3 | Uniform auth responses (S2) | Small change, removes a privacy leak |
| 4 | Toasts instead of `alert()` | The largest change in how the product feels |
| 5 | Responsive pass with Tailwind tokens | Largest effort and payoff; most traffic is mobile |
| 6 | SEO metadata, sitemap, `robots.txt` | Growth work, once the site is presentable |
| 7 | Upload validation, OTP attempt limits (S4, S5) | Hardening, once the surface is settled |
| 8 | Account deletion and export (P2), audit log (P3) | Compliance before real users arrive |
| 9 | Code splitting, lazy images, pagination | Performance, once there is content to matter |

---

## Cleanup

| Removed | Reason |
| --- | --- |
| `components/Table.tsx`, `BackButton.tsx`, `inputField.tsx` | not rendered |
| `pages/admin/TransactionHistory.tsx` | duplicate of the copy in `pages/` |
| `assets/react.svg`, `public/vite.svg` | Vite template files |
| `GET /api/user/test` | public test route; `/health` serves that purpose |
| `isSelfOrAdmin`, `_books` state in `Descriptionform` | unused |
| commented-out markup in `Descriptionform` and `SignUp` | |

The shared `styled-table` rules, used by nine pages, live in `index.css`.
Checkout clears the cart through `useClearCart`, so header badges update
immediately. The favicon is the shop's own mark.

**Verified as expected behaviour.** The Socket.IO `400` in the nginx access log
is the stale long-poll closing after the `101 Switching Protocols` upgrade;
chat works through nginx.
