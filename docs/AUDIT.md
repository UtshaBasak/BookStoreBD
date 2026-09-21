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
| Tests | 254 passing (177 server, 77 client) |
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
| S2 | ~~Account enumeration on sign-in and password reset~~ **done** | **Medium** |
| S3 | Access token kept in `localStorage` | **Medium** |
| S4 | Uploads are not type-checked | **Medium** |
| S5 | OTP has no per-account attempt limit | **Medium** |
| S6 | ~~`X-Powered-By: Express` disclosed~~ **done** | Low |
| S7 | bcrypt cost factor 10 | Low |
| P1 | ~~Footer advertises policies that do not exist~~ **done** | **High** (trust/compliance) |
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

### S2 · Account enumeration — **done**

Sign-in used to distinguish the two failure modes, and reset and sign-up leaked
the same fact from the other side:

```
unknown email        -> 404 {"message":"User not found!"}
real email, bad pw   -> 401 {"message":"Wrong credentials!"}
reset, no account    -> 404 {"message":"No account found with this email."}
sign-up, taken email -> 400 {"message":"This email is already in use."}
```

Anyone could feed in an address list and learn who shops here — a privacy leak
in its own right, and the first step of a credential-stuffing run, which begins
by narrowing millions of leaked addresses down to the ones a site recognises.

Every one of those now answers the same way as its counterpart. Measured
against the running production stack:

| request | before | after |
| --- | --- | --- |
| sign-in, real address, wrong password | `401 Wrong credentials!` | `401 Invalid email or password` |
| sign-in, address with no account | `404 User not found!` | `401 Invalid email or password` |
| reset, real address | `200 OTP sent to email` | `200 If that address has an account, a reset code is on its way.` |
| reset, address with no account | `404 No account found with this email.` | `200 If that address has an account, a reset code is on its way.` |
| sign-up, taken address | `400 This email is already in use.` | `200 If that address can be registered, a code is on its way.` |
| sign-up, free address | `200 OTP sent to email` | `200 If that address can be registered, a code is on its way.` |

Two things the wording alone would not have fixed:

**The clock.** Sign-in returned before reaching bcrypt when there was no such
account, so an unknown address answered in single-digit milliseconds and a real
one took about ninety. Identical sentences with a stopwatch attached are still
an oracle. Sign-in now compares against a throwaway hash when the account does
not exist, and the two paths measure **86.7 ms** and **97.1 ms** on the running
stack — the difference is noise. The same problem applied to the code endpoint,
where one path made an SMTP round trip and the other did not; delivery is now
detached from the response, which measures **7.7 ms** against **6.6 ms**, and
makes the form stop hanging on the mail server as a side effect.

**A taken address still has to be told something.** Rather than issue a code
that could not be used, sign-up mails the *owner* of the address to say somebody
tried, and suggests signing in or resetting instead. Useful to them, useless to
anyone else — and it is a better answer than "This email is already in use" for
the person who simply forgot they had an account.

Usernames are a deliberate exception: they are printed on every listing, so they
are not a secret, and a sign-up form that will not say a name is taken is
unusable. That path also had a real bug — `findOne({ username: undefined })`
drops the key and matches the first user in the collection, so a request with no
username was told the name was taken.

Two smaller things found on the way:

- `SignIn.tsx` ran `console.log(formData)` on every render, which wrote the
  typed password to the browser console. Removed.
- Both auth pages showed failures as `alert(JSON.stringify(data))`, so the
  uniform message would have reached the user as
  `{"success":false,"statusCode":401,...}`. They now show the sentence. The
  remaining 38 `alert()` calls are item 4.

Fourteen tests in `server/tests/enumeration.test.ts` compare the known and
unknown answers side by side rather than asserting any particular sentence, so
a future edit that reintroduces a difference fails whatever wording it picks.

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

### P1 · The footer advertises policies that do not exist — **done**

The footer listed "Privacy Policies", "Return Policies", "Who we are" and
contact details as plain `<li>` text with `cursor: pointer`. Nothing was a link
and no page existed behind any of it — terms that could not be produced on
request, which for a business taking delivery addresses and phone numbers is
worse than no footer at all.

Five routes now exist and the footer links to them: `/privacy`, `/terms`,
`/returns`, `/about` and `/contact`.

The content is written from the code rather than from a template, so it can be
checked against what the system does:

- The privacy policy names the fields the models actually store, states that
  exactly one cookie is set and that it is not for tracking, and lists the third
  parties that see data (Cloudinary, the SMTP provider, Sentry when enabled).
- The returns policy states the three-day window `BuyerBookList` enforces and
  the pending/approved/rejected flow the `ReturnRequest` model implements. A
  test fails if the page and the code disagree about the window.

Business details live in [`client/src/config/site.ts`](../client/src/config/site.ts)
so they are written once. **The address, phone number and e-mail were carried
over from the old footer and have not been verified** — that file carries a
`TODO(owner)` saying so. The policies also need a real legal entity name and a
review by someone qualified before launch; they describe the system accurately
but they are not legal advice.

The pages are the first in the codebase written with Tailwind rather than inline
style objects, and they are responsive. New pages set the standard the rest is
being moved towards (item 5).

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

~~**The placeholder image service is dead.**~~ **done.** Six references to
`via.placeholder.com`, a host that no longer resolves, so every coverless
listing rendered as a broken image. Replaced by a local SVG in `public/`: no
network call, no third party to outlive us, and nothing extra to allow in the
Content-Security-Policy. The five duplicated literals now go through the single
`PLACEHOLDER_IMAGE` constant that already existed for the purpose.

`ui-avatars.com`, the other external image host, was checked and is alive.

**Ratings are vestigial.** The catalogue's star filter and its "most popular"
sort read `rating` and `numReviews`, which no endpoint returns and no model
stores. Both controls do nothing. Either build reviews or remove the controls —
a filter that silently does nothing is worse than no filter.

### Interface

| Observation | Measured |
| ----------- | -------- |
| Inline `style={{…}}` vs `className` | 648 vs 124 → **639 vs 153** |
| Responsive breakpoints in the whole app | 2 Tailwind utilities → **19**, 3 media queries |
| ~~`100vw` usages (cause horizontal scroll)~~ | ~~15~~ **0** |
| ~~`alert()`~~ / `window.confirm` | ~~38~~ **0** / 2 |
| `notistack` (installed, provider mounted) | ~~0 uses~~ **13 files** |
| Inputs vs labels | 49 vs 25 |
| Images without `alt` | 4 of 21 |

**Not responsive.** The most consequential item on the list, and the one that
takes the longest. Tailwind 4 is installed and then barely used; layout lives in
639 inline style objects with fixed pixel widths. For a Bangladeshi book
marketplace most traffic will be on a phone, and the site was written for a
desktop viewport.

**Phase 1 is done: nothing scrolls sideways any more.** Measured with
[`scripts/responsivecheck.mjs`](../scripts/responsivecheck.mjs), which drives
headless Chrome at three widths and reports what sticks out past the right
edge, how many controls are too small for a thumb, and the smallest type on the
page. Reading the CSS cannot answer any of those: a fixed width only overflows
once it meets a viewport, and `100vw` only overflows once there is a scrollbar.

| page | 360px | 768px | 1280px |
| ---- | ----- | ----- | ------ |
| `/` | none | ~~+15px~~ none | ~~+15px~~ none |
| `/filter` | ~~**+682px**~~ none | ~~+289px~~ none | ~~+15px~~ none |
| `/book/:id` | ~~+4px~~ none | ~~+15px~~ none | ~~+15px~~ none |
| `/cart`, `/wishlist`, `/profile` | none | ~~+15px~~ none | ~~+15px~~ none |

Three causes, all now gone:

- **`body { display: flex; place-items: center }`**, straight from the Vite
  starter, made `#root` a flex item that shrank to its content. Eighteen places
  had reached for `width: 100vw` to get a full-width page back - and `100vw`
  counts the scrollbar, which is where the flat +15px on every desktop page
  came from. The body is a block again and all eighteen are `100%`.
- **`/filter` was built as a fixed 250px sidebar beside a two-column grid**, at
  every width. Two of those cards do not fit in 360px, and a grid track will not
  shrink below its content, so the page was 682px wider than the phone showing
  it. It is now one column on a phone and the sidebar moves above the results.
- **The book cover column was a flat 300px**, wider than a 360px screen once the
  page padding is taken off.

Also cleared out on the way: `src/App.css` (the Vite logo-spin template, never
imported) and `tailwind.config.js` (Tailwind 4 reads its theme from CSS, so the
file was inert). The palette that was repeated as literals - `#e65100` 75 times,
`#8B6F6F` 47 - is now `@theme` tokens, so `bg-brand` and `text-accent` work and
a change of brand colour is one block rather than a find-and-replace across two
dozen files.

**Phase 2 is done: the pages a shopper uses are usable with a thumb.**

| page, at 360px | controls under 40px, before | after |
| --- | --- | --- |
| `/` | 13 | **0** |
| `/filter` | 21 | **0** |
| `/book/:id` | 5 | **0** |
| `/cart`, `/wishlist` | 6 | **0** |
| `/privacy` | 12 | 2 (`mailto:` links inside prose, which should be text-sized) |

The filter panel now collapses on a phone. It is fourteen category buttons deep,
and above the results it meant scrolling past the entire thing to reach a single
book; it is a "Filters" button that says how many are on, and the results are
the first thing on screen. Beside the results on a desktop, as before.

**What looking at the pages turned up.** Four things that no amount of reading
the CSS would have found, all of them visible in a screenshot at 360px:

- **The homepage hero was an empty 400px box.** Its `src` was commented out, so
  the first screen on a phone was a broken image and nothing else. `banner.png`
  had been sitting unused in `public/` the whole time.
- **Every icon button rendered its icon as a 2px dot.** The starter's global
  `button { padding: 0.6em 1.2em }` leaves a 40px-wide icon button about 2px of
  content box - measured at 2x16px in the browser. The padding is gone; buttons
  that want it set their own, and every one in this app already did.
- **`.scroll-button` had no rule anywhere.** The carousel arrows carry
  `left: 0` / `right: 0` and sit in a relative container, so they were meant to
  overlay the strip; with no rule they sat in the flow above it, sized entirely
  by that same starter padding.
- **A page stylesheet was styling the whole application.** `UserManagement.css`
  contained a bare `button { background-color: #e74c3c }`, and a stylesheet
  imported by a page is not scoped to it - Vite puts it in the one bundle. Every
  button in the application was red underneath, which is most of the reason the
  rest of the app sets `background` inline on each one. `AdminPanel.css` and
  `Homepage.css` were restyling `body` the same way. All three are scoped now.

That last one also explains why Tailwind classes were not taking: Tailwind 4
puts its utilities in a cascade layer, and an unlayered rule beats a layered one
whatever the specificity says. Any page-level stylesheet left unscoped will
silently win over the utilities the rest of this work depends on.

**What is still left.** The 639 inline style objects on the pages that were not
broken - `Payment.tsx` at 948 lines, `ChatPage`, `AddBook`, `Profile`. Body text
still bottoms out at 12-13px in places, which is small for a phone. And the
two banners stacked on the homepage are one more than a shop needs before its
products.

~~**Blocking dialogs for every message.**~~ **done.** 38 `alert()` calls —
including for routine successes like "Added to cart successfully!" — each one a
modal box that froze the tab until it was dismissed, could not be styled, and
could not carry an action. `notistack` was installed and its provider already
wrapped the app; nothing used it.

All 38 now go through `useToast`, a small wrapper that decides the four kinds
and how long each stays: a confirmation is read at a glance (3s), a failure
needs longer (6s). The wording was rewritten with them — sentence case, no
exclamation marks, and saying what happened rather than shouting about it.

The one that matters commercially: "Please sign in to use cart." was a dead end
with no way to sign in, shown at the exact moment somebody wanted to buy
something. It is now "Sign in to use your cart." **with a Sign in button**, and
`promptSignIn` puts that in one place for the five pages that need it.

Verified in headless Chrome against the production build: the toast appears
bottom-right with the site's corner radius, the page underneath stays usable
while it is up (the old `alert()` froze it), the button reaches `/sign-in`, and
at 390px the message sits inside 8px gutters instead of running off the side.
No CSP violations.

Twelve tests cover it — nine on the hook, three driving the homepage as a
signed-out visitor — and `no-alert` is now an ESLint error, which is what stops
it coming back. Two `window.confirm` calls stay, with the rule disabled and a
reason given on each: a confirmation needs an answer, and there is no dialog
component yet.

**The book page was behind a sign-in wall.** `/book/:id` sat inside
`ProtectedRoute`, so a visitor who clicked any card on the homepage was bounced
to the sign-in form - while the API had been serving that same listing to anyone
who asked. A shop that will not show a book without an account cannot sell one,
and a catalogue no search engine can reach cannot be found (item 6). The route
is public now; the actions that genuinely need an account ask for it at the
point they are used, which is what the toasts from item 4 are for.

**Two dead controls, found by using the pages rather than reading them.**
"Chat with Seller" is rendered to everyone, but the chat window only renders for
a signed-in visitor - so pressing it did nothing at all, on the page a shopper
lands on. It asks them to sign in now. The homepage's cover fallback pointed at
`/books/default-book.jpg`, which is not in `public/`, so every book without a
cover was a broken image on the busiest page on the site.

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
| ~~2~~ | ~~Kill the dead placeholder, real footer pages (P1)~~ **done** | Visibly broken and visibly untrustworthy |
| ~~3~~ | ~~Uniform auth responses (S2)~~ **done** | A few lines; removes a privacy leak |
| ~~4~~ | ~~Toasts instead of `alert()`~~ **done** | The single biggest change in how the product feels |
| 5 | Responsive pass with Tailwind tokens — **phases 1 and 2 done** (nothing scrolls sideways, nothing is too small to tap; the remaining inline styles are on pages that work) | Largest effort, largest payoff; most traffic is mobile |
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
