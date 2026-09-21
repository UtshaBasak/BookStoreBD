# Production-readiness audit

Where BookStoreBD stands against what a consumer-facing marketplace is expected
to do, and what to fix in which order.

Everything below was checked against the running application, not read off the
source. Method, so it can be repeated:

```bash
npm run lint && npm run typecheck && npm test && npm run build
npm audit                                    # in ., client/, server/
docker compose -f docker-compose.prod.yml up -d --build
curl -sI http://127.0.0.1:8080/api/book      # response headers
```

First audited at commit `a1ad1d0`. Items marked **done** below have since
landed; the rest stand.

---

## 1 · Does it work?

Yes. Nothing is broken.

| Check | Result |
| ----- | ------ |
| Lint, both packages | clean |
| Type-check under TypeScript 6.0.3 | clean |
| Tests | 217 passing (163 server, 54 client) |
| `npm audit`, all three roots | 0 vulnerabilities |
| Builds | API compiles to `dist/`, client bundles |
| Production stack | browse, detail, cart, wishlist, profile, orders, clear — all `200` |
| Session lifecycle | sign-in `200` → refresh `200` → replay `401` → logout `204` |

The refresh cookie is scoped to `/api/auth`, rotation works, and a replayed
token revokes the family. That part is genuinely solid.

---

## 2 · Security and privacy

### Findings

| # | Finding | Severity |
| - | ------- | -------- |
| S1 | ~~No security response headers at all~~ **done** | **High** |
| S2 | Account enumeration on sign-in and password reset | **Medium** |
| S3 | Access token kept in `localStorage` | **Medium** |
| S4 | Uploads are not type-checked | **Medium** |
| S5 | OTP has no per-account attempt limit | **Medium** |
| S6 | ~~`X-Powered-By: Express` disclosed~~ **done** | Low |
| S7 | bcrypt cost factor 10 | Low |
| P1 | Footer advertises policies that do not exist | **High** (trust/compliance) |
| P2 | No way for a user to delete their account or export their data | **Medium** |
| P3 | No audit trail for administrator actions | **Medium** |
| P4 | Covers and chat images stored as base64 in MongoDB by default | Low |

### S1 · No security response headers — **done**

There were none at all. The site could be framed by any origin (clickjacking),
responses could be MIME-sniffed, referrers leaked full URLs to third parties,
and there was no second line of defence if a script injection ever landed —
which matters more than usual here, because the access token sits in
`localStorage` (S3).

Now sent on every response:

| Header | Value |
| ------ | ----- |
| `Content-Security-Policy` | `script-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`, and an enumerated `img-src` |
| `X-Frame-Options` | `DENY` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains` |
| `Permissions-Policy` | camera, microphone, geolocation, payment, usb all denied |

`helmet` covers the API ([`config/securityHeaders.ts`](../server/config/securityHeaders.ts));
`nginx.conf` covers the HTML document, because CSP is enforced per document and
the policy that governs the page is the one sent with `index.html`. **The two
must stay in step** — there is no mechanism keeping them so, only a comment in
each pointing at the other.

The policy needs no `'unsafe-eval'` and no inline-script allowance, which is
what makes it worth having: the bundle contains no `eval` and `index.html` has
no inline `<script>`. `style-src` does allow `'unsafe-inline'`, for libraries
that inject a `<style>` element at runtime; style injection is a far weaker
vector than script injection.

**Enforced, not report-only.** The audit originally suggested shipping in
`Report-Only` and reading the reports. That was not necessary: every external
origin the client loads was enumerated from the source first, and the result
verified in headless Chrome over the DevTools protocol against the production
stack — `/`, `/filter` and `/sign-in` each mount React with **zero CSP
violations**. Re-run that check after adding any third-party script, font or
image host:

```bash
chrome --headless=new --remote-debugging-port=9222 about:blank &
node scripts/cspcheck.mjs 9222 http://127.0.0.1:8080/ http://127.0.0.1:8080/filter
```

A new image host means editing `IMAGE_SOURCES` in `securityHeaders.ts` *and*
the `map` block in `nginx.conf`. A cross-origin deployment additionally needs
`CLIENT_API_ORIGIN` set, or the browser blocks every API call.

Eight tests in `server/tests/securityHeaders.test.ts` pin the headers,
including that they survive on an error response — a header that silently stops
being sent looks exactly like one that is working.

### S2 · Account enumeration — Medium

Sign-in distinguishes the two failure modes:

```
unknown email      -> 404 {"message":"User not found!"}
real email, bad pw -> 401 {"message":"Wrong credentials!"}
```

Password reset leaks the same fact: `{"message":"No account found with this
email."}`. Anyone can test an address list and learn who has an account here —
a privacy leak in its own right, and the first step of a credential-stuffing
run.

**Fix.** One response for both: `401 "Invalid email or password"`. For reset,
always answer "if that address has an account, a code is on its way". The
existing rate limiter then does the rest.

### S3 · Access token in `localStorage` — Medium

The refresh token is httpOnly and cannot be read by page JavaScript, which is
the important half and already done. The 15-minute access token is not — any
successful script injection can lift it.

**Fix.** Keep the access token in a module variable and re-acquire it from
`/auth/refresh` on load. `config/api.ts` already shares a single in-flight
refresh, so most of the machinery exists. Worth doing *after* S1, since a CSP
removes most of the ways an injection lands in the first place.

### S4 · Uploads are not type-checked — Medium

`multer` limits size and count but sets no `fileFilter`. Posting a text file as
a book cover succeeds:

```
status=201
images: ["data:text/plain;base64,R0lGODlhLW5vdC1yZWFsbHktYW4taW1hZ2U="]
```

It is not an XSS vector today, because `safeImageSrc` only lets `data:image/`
through to an `<img src>`. It is still unvalidated content in the database, a
storage-abuse channel (10 files × 5 MB per listing, any type), and a trap for
the next person who renders one of these without the helper.

**Fix.** A `fileFilter` restricted to `image/png|jpeg|webp|gif`, and check the
magic bytes rather than trusting the client-declared MIME type.

### S5 · OTP has no per-account attempt limit — Medium

A six-digit code lives for ten minutes in an in-memory `Map`. `authLimiter`
caps an IP at 50 requests per 15 minutes, but nothing counts failures against
the *account*, so attempts from several addresses are not pooled.

**Fix.** Track attempts on the OTP record and invalidate after five. Move the
store to Redis when the API runs on more than one instance — a restart
currently drops every in-flight verification, and a second instance would not
see the first one's codes.

### S6 · `X-Powered-By` — **done**

`app.disable('x-powered-by')`, alongside S1, and pinned by a test.

### S7 · bcrypt cost 10 — Low

Raise to 12. Existing hashes keep working; they are upgraded on next sign-in if
you add a rehash-on-login step.

### P1 · The footer advertises policies that do not exist — High for a business

The homepage footer lists "Privacy Policies", "Return Policies", "Exchange
Policies", "Old Book Policies", "Who we are", and a phone number, e-mail
(`bookstore@gmail.com`) and address — all as plain `<li>` text. Nothing is a
link and no page exists behind any of them.

For a project this reads as unfinished. For a business taking money and
personal data it is worse than having no footer: it represents terms that
cannot be produced on request. Marketplaces in Bangladesh handling delivery
addresses and phone numbers are expected to publish at minimum a privacy
policy, a return/refund policy and real contact details.

**Fix.** Real routes for `/privacy`, `/terms`, `/returns`, `/contact`, `/about`
with genuine content, and correct contact details. Until they exist, remove the
claims rather than display them.

### P2 · No account deletion or data export — Medium

`DELETE /user/:id` is administrator-only. A user cannot delete their own
account, and there is no export. Under GDPR that is articles 15 and 17; the
same expectation is increasingly standard everywhere and is a visible trust
signal regardless of jurisdiction.

**Fix.** `DELETE /user/me` (revoking every session and anonymising orders
rather than deleting them, which accounting usually requires) and
`GET /user/me/export` returning the profile, orders and messages as JSON.

### P3 · No audit trail for admin actions — Medium

An administrator can delete users and change any order's status. Nothing
records who did what. The structured logs capture the request, but there is no
durable, queryable trail.

**Fix.** An `AuditLog` collection written on privileged mutations: actor,
action, target, timestamp, request id.

### P4 · Base64 images in MongoDB — Low

With Cloudinary unconfigured, covers and chat attachments are stored inline on
the document. That is a deliberate, documented fallback so a fresh clone runs
with no account, and list endpoints already `$slice` to one image — but in
production it grows the database quickly and approaches the 16 MB document
limit.

**Fix.** Configure Cloudinary for the deployment; the migration script exists.

---

## 3 · Product, interface and what comes next

The application is feature-complete and the flows work. What is missing is the
layer that makes it read as a business rather than a project.

### Things that are actually broken

**The placeholder image service is dead.** Six references to
`via.placeholder.com`; the host no longer resolves. Every book without a cover
renders a broken image. Replace with a local SVG placeholder in `public/` — no
network call, no dependency on a third party staying alive.

**Ratings are vestigial.** The catalogue's star filter and its "most popular"
sort read `rating` and `numReviews`, which no endpoint returns and no model
stores. Both controls do nothing. Either build reviews or remove the controls —
a filter that silently does nothing is worse than no filter.

### Interface

| Observation | Measured |
| ----------- | -------- |
| Inline `style={{…}}` vs `className` | 648 vs 124 |
| Responsive breakpoints in the whole app | 2 Tailwind utilities, 3 media queries |
| `100vw` usages (cause horizontal scroll) | 15 |
| `alert()` / `window.confirm` | 38 / 2 |
| `notistack` (installed, provider mounted) | 0 uses |
| Inputs vs labels | 49 vs 25 |
| Images without `alt` | 4 of 21 |

**Not responsive.** This is the most consequential item on the list. Tailwind 4
is installed and configured and then barely used; layout lives in 648 inline
style objects with fixed pixel widths. For a Bangladeshi book marketplace most
traffic will be on a phone, and the site currently assumes a desktop viewport.

**Blocking dialogs for every message.** 38 `alert()` calls — including for
routine successes like "Added to cart successfully!". `notistack` is already
installed and its provider already wraps the app; nothing uses it. Replacing
`alert()` with toasts is a small change with a large effect on how the product
feels.

**No design system.** Colours (`#8B6F6F`, `#e65100`, `#43a047`) and spacing are
repeated as literals across dozens of files. Moving them into Tailwind theme
tokens is what makes a later redesign a config change rather than a rewrite.

**No loading, empty or error states.** Pages render `Loading...` as text. The
queries already expose `isPending` and `isError` — skeletons and real empty
states ("No books match these filters") are available for very little work.

**Accessibility.** Half the inputs have no associated label, four images have
no alt text, there is no skip link, and focus is not moved on route change. The
markup is otherwise sound — 96 real `<button>` elements against one clickable
`<span>`, which is far better than typical.

**The 404 page is a bare `<h1>404 Not Found</h1>`.**

### Growth and performance

**No SEO at all.** No Open Graph, Twitter or canonical tags, no `robots.txt`,
no sitemap, and a single static `<title>` for every route. A marketplace lives
on search traffic and shared links; right now a shared book link previews as
nothing. Per-route metadata and a generated sitemap are the highest-leverage
growth work available.

**No code splitting.** `React.lazy` is unused, so the whole application ships
in one 206 KB chunk. Route-level splitting would cut first load substantially.

**No pagination or lazy loading** on the catalogue — every book, with its
base64 cover, arrives at once. Fine at six books, not at six hundred.

**17 `console.*` calls** ship to the production bundle.

**No analytics.** Nothing records what people search for, where they abandon
checkout, or which listings convert — the data you would need to decide what to
build next.

### Business capability, for later

- **Payments.** Cash on delivery only. A real deployment needs a gateway —
  bKash, Nagad or SSLCommerz for Bangladesh — which also brings a webhook,
  payment states and reconciliation.
- **Transactional e-mail.** Nothing is sent on order placement or status
  change; the only mail is the OTP. Order confirmations are table stakes.
- **Search.** Substring matching over the full catalogue, filtered in the
  browser. Moves to a MongoDB text index, then to Atlas Search, well before it
  becomes slow.
- **Seller onboarding and payouts.** Anyone signed in can list a book. A
  marketplace needs verification, a seller agreement and a payout ledger.
- **Reviews.** See the vestigial rating controls above.

---

## Suggested order

Cheap and high-value first, so each step is shippable on its own.

| Order | Work | Why first |
| ----: | ---- | --------- |
| ~~1~~ | ~~Security headers (S1, S6)~~ **done** | One dependency and a few nginx lines; closed the largest gap |
| 2 | Kill the dead placeholder, real footer pages (P1) | Visibly broken and visibly untrustworthy |
| 3 | Uniform auth responses (S2) | A few lines; removes a privacy leak |
| 4 | Toasts instead of `alert()` | The single biggest change in how the product feels |
| 5 | Responsive pass with Tailwind tokens | Largest effort, largest payoff; most traffic is mobile |
| 6 | SEO metadata, sitemap, `robots.txt` | Growth work, meaningless before the site is presentable |
| 7 | Upload validation, OTP attempt limits (S4, S5) | Hardening, once the surface is settled |
| 8 | Account deletion and export (P2), audit log (P3) | Compliance before real users arrive |
| 9 | Code splitting, lazy images, pagination | Performance, once there is enough content to matter |

Items 1–4 are each an afternoon. Item 5 is the one that takes real time, and it
is the one a visitor notices first.

---

## Checked and found not to be a problem

Recorded so the next person does not spend the time twice.

**The Socket.IO `400` in the nginx access log.** A polling request with a `sid`
returns 400 shortly after each connection. It is the stale long-poll being
closed once the transport upgrades, and the log shows the `101 Switching
Protocols` that precedes it. Chat works through nginx; the line is noise.
