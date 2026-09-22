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
| Tests | 475 passing (330 server, 145 client) |
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
| S4 | ~~Uploads are not type-checked~~ **done** | **Medium** |
| S5 | ~~OTP has no per-account attempt limit~~ **done** | **Medium** |
| S6 | ~~`X-Powered-By: Express` disclosed~~ **done** | Low |
| S7 | bcrypt cost factor 10 | Low |
| P1 | ~~Footer advertises policies that do not exist~~ **done** | **High** (trust/compliance) |
| P2 | ~~No way for a user to delete their account or export their data~~ **done** | **Medium** |
| P3 | ~~No audit trail for administrator actions~~ **done** | **Medium** |
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

### S4 · Uploads are not type-checked — **done**

`multer` limited size and count and set no `fileFilter`, so posting a text file
as a book cover succeeded:

```
before:  status=201  images: ["data:text/plain;base64,R0lGODlhLW5vdC1yZWFsbHkt…"]
after:   status=415  {"message":"cover.png is not a PNG, JPEG, WebP or GIF image"}
```

Two checks, because one is not enough. A `fileFilter` refuses anything whose
declared type is not `image/png`, `image/jpeg`, `image/webp` or `image/gif` -
cheap, and it stops a 5 MB video before it is buffered. Then, after the file is
in memory, its **first bytes** are read: the `Content-Type` is whatever the
client chose to send, and a text file called `cover.png` announces itself as an
image perfectly happily. A PNG header cannot be renamed away.

The sniffed type also replaces the declared one, because the handlers build a
`data:<type>;base64,…` URI: a PNG announced as a JPEG would otherwise be stored
with a lie attached to it, and a test pins that.

Found on the way: an upload over the size limit answered **500**. `multer`
throws an error carrying a `code` rather than a status, so a caller's mistake
was being reported as a server fault with nothing to say what the limit was. It
is a 413 with "File too large" now.

The file pickers were `accept="image/*"`, which offers SVG, HEIC and TIFF - all
of which the server now refuses, so the first anyone would hear of it was an
error after the upload. They list the four types that are actually accepted.

Eight tests, and the attack from the audit was re-run against the running stack:
415 for the text file, 201 for a real PNG, 413 for 6 MB.

### S5 · OTP has no per-account attempt limit — **done**

A six-digit code lives for ten minutes in an in-memory `Map`. `authLimiter` caps
an IP at 50 requests per 15 minutes, but nothing counted failures against the
*code*, so guesses coming from several addresses were never pooled.

Five wrong tries and the code is thrown away. The count lives on the record, so
it follows the code rather than the caller, and `verify-otp` and `reset-password`
share it: they check one code between them, so five tries is five tries whichever
door they are tried at.

The response does not say why. "Too many attempts" would be friendlier, and it
would also confirm that a code had been issued for that address at all - which
is exactly the account enumeration S2 closed. A wrong code, an expired one, a
discarded one and an address that never had one all answer identically, and a
test holds two of those responses side by side.

Expired codes are also swept when a new one is issued; the map previously only
ever lost an entry when somebody touched it.

Six tests, each checked by raising the limit and watching them fail.

**Still to do:** move the store to Redis when the API runs on more than one
instance. A restart drops every in-flight verification, and a second instance
cannot see the first one's codes.

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

### P2 · No account deletion or data export — **done**

`DELETE /user/:id` was administrator-only: a user could not close their own
account and could not get a copy of what was held about them. Articles 15 and 17
of the GDPR, and a visible trust signal regardless of jurisdiction.

**`GET /user/me/export`** returns the account, orders placed, orders received as
a seller, purchases, return requests, cart, wishlist, listings and messages, as
a named JSON download rather than a page - it is a file to keep. The password
hash is not in it, and a test asserts the whole document contains no `$2`.

**`DELETE /user/me`** asks for the password again. This cannot be undone, and an
access token lifted from a borrowed laptop should not be enough to erase
somebody's account.

What it does, and why:

| | |
| --- | --- |
| account, cart, wishlist | deleted |
| listings | deleted — a listing with no seller behind it cannot be bought |
| orders, purchases, return requests | **kept, anonymised** |
| messages | **kept, anonymised** — a conversation is two people's, not one's |
| every session | revoked |

Orders and messages stay because the other side of each one is somebody else's
history. Deleting a thread takes with it the other person's record of what was
agreed, which is usually why they still have it; the messages remain, attributed
to "Deleted user" rather than to an address. What goes is every personal detail:
the address becomes a tombstone in the `.invalid` domain reserved for exactly
this, and the contact name, phone and delivery address are emptied. What was
sold and for how much survives. Run against the live stack:

```
{"message":"Your account has been deleted.","ordersAnonymised":1,…}

orderNumber:     'A4AKZKZDG89XEICL'          // the sale is still there
buyerEmail:      'deleted-d2b15b75@removed.invalid'
title:           'The C Programming Language'
price:           850
contactName:     ''
contactPhone:    ''
deliveryAddress: ''
```

A wrong password answers **403, not 401** - found by a test that noticed the
session disappearing. The client reads a 401 as an expired session: it tries a
refresh and then signs the caller out, so a typo would have logged somebody out
of the page they were standing on. 401 is for session problems; this is a
re-check failing.

Both are on the profile page under "Your data", not buried in a settings menu.
An account nobody can close is the kind of thing people complain about publicly
rather than by e-mail. Eighteen tests.

### P3 · No audit trail for admin actions — **done**

An administrator can delete users and change any order's status, and nothing
recorded who did it. The request log captures the call, but it rotates and
cannot be queried - it is not where you answer "who deleted this account".

An `AuditLog` collection is written on every privileged change: deleting a user,
changing an order's status, deleting an order, resolving a return request, and
somebody closing their own account. Each row carries the actor's id, address and
role, what was acted on, anything worth knowing later - an order status records
what it moved *from* as well as to - and the request id, which ties it back to
the log line for the same call.

The actor's address is copied in rather than referenced: the trail has to still
read correctly after the account it names has been deleted, which is exactly the
case a trail exists for. The account-deletion row is written before the account
goes, while there is still an actor to name.

`GET /api/audit` reads it back, newest first, filterable by action or actor and
paged. Administrators only - it names who did what, which is precisely what
should not be public.

A failed write is logged at error level rather than thrown: by then the change
has already happened, and raising would report a failure for something that
succeeded. A dropped row is still a hole, so it is loud in the log rather than
silent.

Eight tests, and the trail was read back from the running stack:

```
order.status | admin@bookstorebd.local | A4AKZKZDG89XEICL | {from: 'Order Confirmed', to: 'Shipped', lines: 1}
```

### P4 · Base64 images in MongoDB — **the bytes no longer travel in JSON**

With Cloudinary unconfigured, covers and chat attachments are stored inline on
the document. That is a deliberate, documented fallback so a fresh clone runs
with no account, and list endpoints already `$slice` to one image — but in
production it grows the database quickly and approaches the 16 MB document
limit.

**This was rated Low, and measuring it showed that was wrong.** A base64 cover
does not only sit in the database: it travelled inside every JSON response that
mentioned the book. Measured against a catalogue of 66 listings with
photographed covers:

```
GET /api/filter/booklist    7,406,560 bytes    5,734,034 gzipped
```

Base64 of a JPEG is already-compressed data, so gzip recovered under a quarter
of it, and a browser cannot cache an image that arrives inside a JSON body -
every visit paid for all of them again.

**Covers are addresses now.** List and detail responses carry
`/api/book/<id>/cover/<n>`, and that endpoint serves the bytes with a
`Cache-Control` and an `ETag`. The same catalogue:

```
GET /api/filter/booklist        3,098 bytes gzipped     (was 5,734,034)
GET /api/book/<id>/cover/0     92,171 bytes, ETag, 304 on a repeat visit
```

Each cover is then an ordinary image request: fetched only for the cards on
screen, because they are lazy; cached across navigations; and revalidated with
a 304 rather than re-downloaded. A cover already hosted elsewhere is left alone
and redirected to, because a Cloudinary URL was never the problem.

Measured in a browser on an emulated 4G phone, cold cache:

| | homepage | catalogue |
| --- | --- | --- |
| transferred | 465 KB | 818 KB |
| requests | 14 | 16 |
| first contentful paint | 600 ms | 896 ms |

Most of what is left is the covers themselves - about 90 KB each, because that
is what a photograph is.

**Still to do.** Configure Cloudinary; the migration script exists. It serves
resized images in modern formats from a CDN, which is the answer to the 90 KB,
and it takes the bytes out of the database as this item originally asked. Until
then a card downloads a full-size photograph to draw it 100px wide - the next
worthwhile step without Cloudinary would be generating a thumbnail at upload
time.

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

~~**Ratings are vestigial.**~~ **built.** The catalogue's star filter and its
"most popular" sort read `rating` and `numReviews`, which no endpoint returned
and no model stored. Neither control did anything - worse, choosing four stars
matched zero books, so the catalogue looked empty rather than unfiltered.

The choice was build reviews or drop the controls. They are built.

**Only somebody who bought the book can review it.** That one rule is what makes
a score worth reading: without it a seller rates their own listings five stars
from three accounts and a competitor rates them down from three more. The check
is an order for that book by that account, and every review carries a **Verified
purchase** badge because of it. A seller cannot review their own listing even
after buying a copy of it.

One review per person per book, enforced by a unique index rather than by a
check that races: writing a second replaces the first, so nobody weights a score
by saying the same thing twice. Reviews can be edited and withdrawn by their
author, and removed by an administrator - which writes an audit row, because an
administrator deleting somebody's words is exactly what that trail is for.

The score is denormalised onto the listing as `ratingAverage` and `ratingCount`,
rewritten on every write. That is what lets the catalogue filter and sort on it
at all: a rating needing a join per book could not have been. It is rounded to
one decimal: 4.333333 is not more informative than 4.3 and looks like a bug.

The book page carries the average, the count, and the **distribution** - five 3s
and a mix of 1s and 5s both average 3, and only one of those is a book worth
buying. The catalogue has the star filter back as a floor ("4 and up"), a
"Highest rated" sort that breaks ties on how many reviews the score rests on,
and stars on every card. The structured data gains an `aggregateRating`, which
is what puts stars under a search result.

A review outlives the account that wrote it, under "Deleted user": the next
buyer's decision rests on it, and a score that fell every time somebody closed
an account would be worth nothing.

Nineteen server tests and ten in the browser.

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

**Phase 3 is done: every route, not just the ones a shopper walks through.**
All 27 routes measured at 360, 768 and 1280 - phone, tablet, laptop - signed out,
as a buyer, as a seller and as an administrator, with a real order, a full cart
and a wishlist behind them.

| | before | after |
| --- | --- | --- |
| routes that scrolled sideways | 6 | **0** |
| worst overflow (`/chat`, 360px) | +999px | **0** |
| routes with content cut off and unreachable | 1 | **0** |
| controls under 40px at 360px | 60 across 11 routes | **0** |
| smallest type | 10px | 12px |

The five that were badly broken:

- **`/chat` carried `minWidth: 1000px`** on its message pane - 999px past the
  edge of a 360px screen, and 148px past a 1280px one. The two panes now take it
  in turns on a phone, the way every chat application does it: the list until a
  conversation is picked, then the conversation with a way back.
- **Checkout was two columns at every width.** 56% of 360px, less 96px of
  padding, is about 106px to write an address in. One column on a phone now, and
  the form rows wrap rather than forcing two 203px inputs side by side.
- **The three order-tracking pages put the card and the order table beside each
  other**, because their container was a flex row - the CSS even carried a
  comment wondering about it. +409px. They stack now, and every table in the
  application sits in a `.table-scroll`, so a table too wide for a phone scrolls
  inside its own box instead of taking the page with it.
- **The admin panel was a fixed 250px sidebar beside the content at every
  width**, leaving 110px of a 360px screen for the table it exists to show. The
  sidebar becomes a strip across the top below 900px. This one reported *no*
  overflow, because `overflow-x: hidden` was hiding it - which is why the
  harness now reports content that is cut off separately from content that
  scrolls. Hidden overflow does not scroll, it amputates.
- **`/seller-books` had four controls in a row that could not wrap**, one of them
  a 300px search box.

Tap targets came from the same few habits: `minHeight: 36` inline (which beats
any stylesheet), icon controls built as `<span>` or even `<svg>` with an
`onClick` and a `tabIndex` - focusable, but Enter did nothing, so a keyboard
user could reach them and not use them - and 13px checkboxes and radios in
labels with no padding. The harness now measures the area that actually
responds: for a control inside a `<label>`, the label.

What is deliberately left: the `mailto:` and `tel:` links inside the prose of the
policy and contact pages are text-sized, which is right for a link in a sentence.

**What is still left.** The inline style objects on pages that work - they carry
no breakpoints and no tokens, so the next person to change one has to rediscover
what it does. And the two banners stacked on the homepage are one more than a
shop needs before its products.

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

**Checkout failed for any basket with two books in it.** Every line of an order
shares one order number - that is how the tracking page gathers an order back
together - but `orderNumber` carried a unique index, so the second book collided
with the first. The request failed with a duplicate key error *after* the first
book's stock had been taken. Found on the first two-book order placed against a
clean database. The index is now compound on `(orderNumber, bookId)`, which is
the integrity the unique flag was reaching for, and `syncIndexes()` runs on
connect so an existing database drops the stale one rather than going on
rejecting every multi-book basket. Two tests cover it.

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

### Growth and performance

~~**No SEO at all.**~~ **done.** There was no Open Graph, Twitter or canonical
tag, no `robots.txt`, no sitemap, and one static `<title>` for all 27 routes.

Every page now says what it is. `useSeo` sets the title, description, canonical
URL, Open Graph and Twitter card per route - about sixty lines rather than a
helmet dependency, because every route here either wants the full set or is
behind a sign-in and wants `noIndex`. That last one is set in `ProtectedRoute`
itself, so every private route is covered, including any added later: a URL that
answers a crawler with a sign-in form is a wasted result for everyone.

**`/robots.txt` and `/sitemap.xml` are served by the API**, at the root, where a
crawler looks. Generated rather than static files, for two reasons: the sitemap
has to list the books that exist right now, and both need absolute URLs on
whatever domain the site is answering. That origin is taken from the request -
`X-Forwarded-Proto` and `X-Forwarded-Host`, which nginx already sends - so a
fresh deployment is correct on any domain without anyone setting a variable.
`PUBLIC_SITE_URL` overrides it, and should be set once the canonical domain is
known; it is the only way to be sure a site answering on two hostnames
advertises one. The Host header comes from the caller, so it is validated rather
than trusted: a request with a nonsense host gets no sitemap rather than a
poisoned one.

Nine tests cover what a crawler finds, including that the sitemap lists every
book, lists nothing that needs an account, and escapes what XML cannot carry.

**Structured data.** The homepage publishes a `WebSite` block with a
`SearchAction` - the thing that can give a site its own search box in a results
page - and every listing publishes a `Book` with an `Offer`: price in BDT,
condition, availability. That is what turns a blue link into a result with a
price on it. A book title is escaped before it goes in: unescaped, a seller
could name a book `</script>` and close the block, and a test pins that.

**What this does not do.** The tags are set in the browser. Google renders
JavaScript and sees them; the link scrapers behind Facebook, WhatsApp, Slack and
X do not, and read `index.html` alone. That file now carries a full set of
site-level defaults, so a shared link previews as the shop rather than as a
blank card - but a *per-book* preview would need the HTML rendered on the
server. Worth doing, and a separate job. The 404 page is also a soft 404: a
single-page app answers 200 for every path, so the `noindex` on it is what keeps
it out of the index.

**The 404 page** was `<h1>404 Not Found</h1>` - a dead end on a shop. It now
says what happened and offers the homepage and the catalogue.

~~**No code splitting.**~~ **done.** `React.lazy` was unused, so somebody
reading the homepage on a phone downloaded the checkout, the admin panel and the
chat before seeing a book. Every route is its own chunk now:

| | before | after |
| --- | --- | --- |
| application chunk | 228.31 kB (51.30 kB gzipped) | **64.49 kB (19.55 kB)** |
| chunks in `dist/assets` | 4 | 32 |

A 72% cut to the code that has to arrive before anything renders. The homepage
is the one route left eager - it is what most visitors see first, and making
them wait for a second request to start it would undo the point. A `Suspense`
fallback covers the moment a chunk is fetched.

~~**No pagination or lazy loading**~~ **done.** The catalogue rendered every
match at once, each card decoding a base64 cover. Fine at six books, not at six
hundred.

Twelve to a page now, with a pager and a count. Measured in the browser against
36 books: 12 cards rendered, 326 DOM nodes, "Showing 1-12 of 36", and the same
figures on page 2 - the page no longer grows with the catalogue. Every cover in
a list carries `loading="lazy"` and `decoding="async"`, so the browser stops
decoding books nobody has scrolled to. The homepage's hero banner is left eager
on purpose: it is the largest thing on the first screen and what the browser
measures as the load.

The filtering itself stays in the browser. It is instant, it works once the
catalogue is loaded, and it was never what made the page heavy. Moving it to
the API is the next step and a larger one, because the page's state model -
filters as client-side edits over a URL - would have to move with it. One
consequence: the page number is not in the URL, so a page of results cannot be
shared or reached with the back button.

~~**17 `console.*` calls** ship to the production bundle.~~ **done.** Sixteen,
in the end: fifteen `console.error` and one `console.log` that printed the
signed-in visitor's address on every visit to the chat.

They go through `reportError` now, which reaches the console in development and
is stripped from a build entirely - `import.meta.env.DEV` is replaced with a
literal, so the branch is removed rather than skipped. Confirmed by grepping the
built chunks: **zero** in the application code, the rest all in React's own
vendor chunk.

The first attempt was `esbuild: { drop: ['console'] }` in the Vite config, which
did nothing at all: Vite 8 builds with Rolldown, and that option belongs to
esbuild. The built bundle said so, which is the only reason it was noticed.

`reportError` is also the one place a browser error reporter would go. There is
none today, which is the real gap behind this item - a caught error in a
visitor's browser now goes nowhere at all.

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
- ~~**Reviews.**~~ Built - see above. What is not built is a way to flag a
  review, and a reply from the seller.

---

## Suggested order

Cheap and high-value first, so each step is shippable on its own.

| Order | Work | Why first |
| ----: | ---- | --------- |
| ~~1~~ | ~~Security headers (S1, S6)~~ **done** | One dependency and a few nginx lines; closed the largest gap |
| ~~2~~ | ~~Kill the dead placeholder, real footer pages (P1)~~ **done** | Visibly broken and visibly untrustworthy |
| ~~3~~ | ~~Uniform auth responses (S2)~~ **done** | A few lines; removes a privacy leak |
| ~~4~~ | ~~Toasts instead of `alert()`~~ **done** | The single biggest change in how the product feels |
| ~~5~~ | ~~Responsive pass with Tailwind tokens~~ **done** — every route measured at 360, 768 and 1280 | Largest effort, largest payoff; most traffic is mobile |
| ~~6~~ | ~~SEO metadata, sitemap, `robots.txt`~~ **done** | Growth work, meaningless before the site is presentable |
| ~~7~~ | ~~Upload validation, OTP attempt limits (S4, S5)~~ **done** | Hardening, once the surface is settled |
| ~~8~~ | ~~Account deletion and export (P2), audit log (P3)~~ **done** | Compliance before real users arrive |
| ~~9~~ | ~~Code splitting, lazy images, pagination~~ **done** | Performance, once there is enough content to matter |

**All nine are done.** Items 1–4 were each an afternoon; item 5 took the longest
and is the one a visitor notices first.

What is left is in the sections above, and none of it blocks a launch:

- **Per-book link previews** need HTML rendered on the server. Google sees the
  per-route tags today; Facebook and WhatsApp see the site-level defaults.
- ~~**Server-side filtering and paging** on the catalogue.~~ **Done.** The
  browse page fetched every listing in the database and filtered, sorted and
  sliced them in the browser. Measured against 307 listings, the page it needed
  to draw twelve books:

  ```
  every listing (as it was)   140,180 bytes   23 ms
  one page (as it is)           5,519 bytes    7 ms
  ```

  and the second number does not grow with the catalogue. Every filter is a
  named query parameter now, which also retired the `{ filter_key,
  filter_input }` pair that let a caller name the document path to query.

  The part worth recording: the first version of the indexes left `_id` off the
  end of each one. The catalogue sorts by `{ <field>, _id }` so books that tie
  cannot shuffle between pages, and a sort is only served by an index when it
  is a prefix of that index's keys - so every query still scanned all 307
  documents and sorted them in memory. All 400-odd tests passed, because the
  answers were right. `explain()` said `COLLSCAN` and `IN-MEMORY SORT`; with
  `_id` appended it reads 12 documents examined per page. There is a test on
  the query plan now, because that is the form the regression would take.

  The administrator's book table went the same way, and it was worse: it
  fetched every listing *and* every user account, the second only to turn an
  e-mail into a name in the "Owner" column, then searched what it had in the
  browser. `/book/admin` sends a page and resolves the sellers on it — 11,811
  bytes for twenty-five rows, one request, and the search reaches the database
  so it can find a listing that is not on the page you are looking at. With
  both pages moved, there is no "every listing" endpoint left to call.

  User Management was the worst of the three, and not for the reason it looked
  like. It asked for every account with `select('-password')` — every field
  except the password — and `profilePicture` is stored as a base64 data URI.
  Measured against 303 accounts, two thirds of them with a photograph:

  ```
  every account, every field but the password   10,890,235 bytes
  one page of the three columns it draws             3,661 bytes
  ```

  It also sent every user's address and phone number to draw a table of name,
  e-mail and join date. Those three fields are what it sends now.

  And the index lesson arrived a second time, in a different disguise. The
  filter was `role: { $ne: 'admin' }`, which is the natural way to say
  "everyone else" — but an inequality on the leading field of an index leaves
  the fields after it unordered, so the sort was blocking again: 303 keys read
  and sorted in memory. `role: 'user'` selects exactly the same accounts, since
  the enum has two values, and reads 25 keys in index order. Both tables have a
  query-plan test now.

  The orders and returns tables followed, and the returns table turned out to
  be the worst of the lot. A return request carries the buyer's photographs of
  the defect, as base64, on the document — and the administrator's table
  downloaded every one of them to draw seven columns of text and a "View
  Images" button that had no `onClick` and opened nothing. Measured against 120
  requests and 400 orders:

  ```
  every return request   9,760,991 bytes  →   9,717
  every order line         495,514 bytes  →  30,450   (25 orders, 49 lines)
  ```

  The photographs are addresses now, behind a check that only the buyer who
  uploaded one or an administrator may fetch it, and the button opens them —
  by fetching with the session and handing the tab a blob, because a plain
  link would arrive with no Authorization header and be refused.

  Two details worth keeping. Orders page by **order**, not by line: a basket of
  three books is three rows, and a page that cut between them would show part
  of a purchase. And the buyer's list used to fetch every return request the
  account had ever made — photographs included — only to work out which books
  had a return in progress; each line now carries its own `returnStatus`.
- **A browser error reporter.** `reportError` is the seam and it currently goes
  nowhere in production.
- ~~**Redis for the one-time codes**, before the API runs on more than one
  instance.~~ **Done, and it mattered on one instance too.** They lived in a
  `Map` in the process, so every restart threw away every code in flight -
  somebody halfway through signing up or resetting a password got "invalid
  code" and started again, on every deploy and every time a sleeping instance
  woke. They are a MongoDB collection with a TTL index now, which also retired
  the sweep that kept the map from growing. Proved by issuing a code in one
  process and spending it in another.

  Stored as an HMAC under the server's secret rather than as the code: six
  digits is a million possibilities, so a plain hash is recovered from a table
  instantly, and a record that survives a restart is one that can be read out
  of a backup.
- **P4**, base64 covers in MongoDB, whenever image hosting is switched on.
- The **business capability** list below: payments, delivery, reviews, stock
  reconciliation. Those are products, not fixes.

And two things that are yours rather than mine: the contact details in
`client/src/config/site.ts` are still the unverified ones carried over from the
original footer, and the policy pages need a real legal entity name and a review
by somebody qualified.

---

## Dead code, removed

A pass over the whole project once the nine items were done, looking for what
nothing uses. Two of the things it turned up were not dead at all.

**A stylesheet kept alive by a dead component.** `Table.tsx` was rendered by
nothing, but it imported `Table.css`, and nine pages write their own
`<table className="styled-table">`. The styling for every table in the
application arrived only as a side effect of an unused file being in the bundle;
deleting the component would have quietly unstyled all nine. The rules are in
`index.css` now, next to the pages that actually use them.

**A cart that emptied on the server and not on screen.** Checkout cleared the
cart with a bare `apiFetch` - no await, no error handling, and no cache
invalidation - so the badge in every header went on showing items that were no
longer there. `useClearCart` already existed, unused, and does it properly.

Removed outright:

| | |
| --- | --- |
| `components/Table.tsx`, `BackButton.tsx`, `inputField.tsx` | rendered by nothing |
| `pages/admin/TransactionHistory.tsx` | an orphan copy; the admin panel imports the one in `pages/` |
| `assets/react.svg`, `public/vite.svg` | Vite template leftovers |
| `GET /api/user/test` | answered "Api route is working!" to anyone; `/health` is the endpoint for that |
| `isSelfOrAdmin` | defined, never called |
| `_books` state in `Descriptionform` | written, never read |
| commented-out markup in `Descriptionform` and `SignUp` | |

**The rating controls are gone.** A five-star filter, a "Most Popular" sort and
a "Rating: N/A" line on every card, all reading a field no endpoint returns and
no model stores. The filter did not merely do nothing: choosing four stars
matched zero books, which is a dead end that looks like an empty catalogue. The
sort is "Newest first" now, on `createdAt`, which exists.

**They came back, on real data.** Ratings and reviews were built straight after
this - verified purchasers only, one per person, with the star filter and a
"Highest rated" sort restored on a score that exists. See "Ratings are
vestigial" above.

**The favicon was Vite's logo**, which is the first thing a visitor sees of the
shop, in the tab, before the page has rendered. It is the shop's own mark now.

---

## Checked and found not to be a problem

Recorded so the next person does not spend the time twice.

**The Socket.IO `400` in the nginx access log.** A polling request with a `sid`
returns 400 shortly after each connection. It is the stale long-poll being
closed once the transport upgrades, and the log shows the `101 Switching
Protocols` that precedes it. Chat works through nginx; the line is noise.
