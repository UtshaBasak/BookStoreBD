# Security events

Every security control in BookStoreBD writes one JSON line each time it makes
a decision: a wrong password, a lock, a failed bot check, a refresh token
used twice, or a refused request for someone else's order. The request log
already records what was asked for and the status code. These events record
why: a `401` from sign-in becomes `auth.signin.failure` with
`reason: "bad_password"` or `"unknown_user"`, so a detection does not have to
guess from status codes.

The events go to standard output along with the request log, through the same
pino logger. They contain no secrets and no plain personal details. An e-mail
address appears only as a keyed hash.

Everything here comes from one helper, `securityEvent()` in
[`server/utils/securityLog.ts`](../server/utils/securityLog.ts). The event
names are a TypeScript union, so a misspelt event does not compile. The tests
are [`securityEvents.test.ts`](../server/tests/securityEvents.test.ts) and
[`noSecretsInLogs.test.ts`](../server/tests/noSecretsInLogs.test.ts).

This is separate from the admin audit trail (the `AuditLog` collection,
`GET /api/audit`). That trail is a durable, queryable record of privileged
changes for administrators. These events are a stream for detection.

---

## The events

Severity is `low`, `medium` or `high`. `low` lines are written at pino's
`info` level and the rest at `warn`.

### Sign-in and sign-up

| Event | Fires when | Severity | Detail |
| --- | --- | --- | --- |
| `auth.signin.success` | A session starts | low | `extra.method`: `password`, `google`, `two_step` or `signup`. `extra.new_browser`: the account had not been signed in from this browser (or app install) before |
| `auth.signin.failure` | A wrong password or an unknown address | low | `reason`: `bad_password` or `unknown_user`. The caller still gets the same "Invalid email or password" for both |
| `auth.lockout` | The fifth wrong password starts the 15-minute lock, or an attempt arrives while locked | high | `reason`: `too_many_failures` or `locked` |
| `auth.2fa.success` | A two-step sign-in code is accepted | low | |
| `auth.2fa.failure` | A two-step code is wrong, expired or used up | medium | Getting this far needs the right password, so the password may have been stolen |
| `auth.otp.sent` | A sign-up or reset code is sent | low | `extra.purpose`: `register` or `reset`. Not written when no code goes out (address already registered, or no account) |
| `auth.otp.failure` | A sign-up or reset code is wrong, expired or used up | medium | `extra.step`: `verify` or `reset` |
| `auth.password.reset` | A password is reset with a code | medium | `extra.sessions_ended` |
| `auth.google.failure` | Google sign-in fails | medium | Website `reason`: `expired` (state missing, forged or stale), `failed` (code exchange or ID token refused, which includes a PKCE mismatch), `unverified`, `codes`. App `reason`: `bad_id_token`, `bad_nonce`, `unverified`. Cancelling at Google is not logged |
| `turnstile.failed` | The Cloudflare bot check fails | low | `reason`: `missing` or `refused`. If Cloudflare cannot be reached the check lets the request through and nothing is logged |

### Sessions and tokens

| Event | Fires when | Severity | Detail |
| --- | --- | --- | --- |
| `session.refresh.reuse_detected` | A refresh token that was already exchanged is presented, and its whole family is revoked | **high** | The strongest single signal in the app. A website session refreshed from two tabs at once can also cause it, which is harmless |
| `session.refresh.device_mismatch` | An Android refresh token arrives without a valid signature from the phone it was issued to | **high** | The token was copied off the phone |
| `auth.token.invalid` | An access token has a bad signature or is malformed | medium | Not written when a token has just expired, which is how every session ends |
| `session.logout_others` | A user signs out all their other devices | low | `extra.sessions_ended` |

### Account changes

| Event | Fires when | Severity | Detail |
| --- | --- | --- | --- |
| `account.password.changed` | The password is changed from the profile | medium | `extra.sessions_ended` |
| `account.bkash.changed` | The bKash payout number is set, changed or removed | **high** | `extra.change`: `set`, `changed` or `removed`. This number decides where a seller's money goes. **The number is never logged** |
| `account.email.changed` | A change of address is confirmed | **high** | `user.email_hash` is the old address. `extra.new_email_hash` is the new one |
| `account.2fa.enabled` / `account.2fa.disabled` | Two-step sign-in is turned on or off | low / medium | |
| `account.deleted` | Members delete their own account | medium | |
| `account.data_exported` | The full data download is used | medium | |
| `account.reauth.failure` | The current password (or e-mailed code) asked for by a sensitive change is wrong | medium | `extra.change`: `password`, `bkash`, `email`, `2fa_off` or `delete_account`. The session is still valid, so this may be someone using an unattended one |

### Access control and abuse

| Event | Fires when | Severity | Detail |
| --- | --- | --- | --- |
| `authz.denied` | A role or ownership check answers 403 | medium | `reason: not_admin` with `extra.required_role`, or `reason: not_owner` with `extra.resource_type`: `order`, `return_request`, `review`, `review_reply`, `seller_review`, `seller_review_reply`, `book`, `chat`. Business rules such as "you cannot review your own listing" are not logged |
| `ratelimit.exceeded` | A request gets 429 from a rate limiter | low | `extra.limiter`: `general`, `auth`, `write`, `crawler` or `client_error`. A sign-in refused by the account lock is `auth.lockout`, not this |
| `upload.url_rejected` | Submitted image URLs are not from this shop's Cloudinary account | medium | `extra.dropped`. The URLs are dropped as before, not refused. Only something other than the site's own pages would send them |

### Administrator actions

| Event | Fires when | Severity | Detail |
| --- | --- | --- | --- |
| `admin.role.granted` | An address in `ADMIN_EMAILS` is promoted to administrator at sign-in or sign-up | high | |
| `admin.user.deleted` | An administrator deletes a member | medium | `user.id` is the administrator; `extra.target_user_id`, `extra.target_role` |
| `admin.payout.recorded` | An administrator records a seller payout | medium | `extra.order_number`, `extra.lines`, `extra.amount`. Not the bKash number or the transaction ID |
| `admin.message.sent` | An administrator sends a message | medium | `extra.audience`, `extra.channel`, `extra.recipient_count` |

There is no `admin.user.deactivated`: the shop has no way to deactivate an
account, only to delete one.

The website routes, the old `/api/user/signin` and `/api/user/signup` aliases
and the Android app's `/api/v1/app/auth/*` routes all run the same handlers.
They write the same events, told apart by `client`.

---

## Fields

| Field | Always | Meaning |
| --- | --- | --- |
| `time` | yes | ISO 8601, UTC |
| `log_type` | yes | Always `"security"`, to separate these lines from request lines |
| `msg` | yes | The event name again, for log viewers that show only the message |
| `event.action` | yes | The event name |
| `event.category` | yes | `authentication`, `session`, `account`, `authorization`, `abuse` or `admin` |
| `event.outcome` | yes | `success` or `failure` |
| `event.severity` | yes | `low`, `medium` or `high` |
| `event.reason` | when known | One word on why |
| `request_id` | in a request | The same id as the request log line and the `X-Request-Id` response header |
| `source.ip` | in a request | The visitor's address, resolved through Cloudflare and Render's proxies (`server/config/trustedProxies.ts`) |
| `user_agent` | when sent | The browser's description of itself, cut to 256 characters |
| `client` | yes | `web`, the app's own `android/<versionCode>`, or `other` for any other `X-Client` value |
| `http.method`, `http.route` | in a request | The path without its query string, with any e-mail address in it replaced by `[email]` |
| `user.id` | when known | The account's database id |
| `user.email_hash` | when an address was given | HMAC-SHA256 of the lower-cased address (see below) |
| `extra` | sometimes | Counts, flags, names and ids only, as listed in the tables |

pino also adds `level`, `pid`, `hostname` and `env`.

### One line from each category

```json
{"level":30,"time":"2026-10-24T13:50:12.345Z","env":"production","log_type":"security","event":{"action":"auth.signin.failure","category":"authentication","outcome":"failure","severity":"low","reason":"bad_password"},"request_id":"9f3c0a52-6d1e-4c3b-a1f0-2b7d9e4c8a11","source":{"ip":"103.0.113.7"},"user_agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64)","client":"web","http":{"method":"POST","route":"/api/auth/signin"},"user":{"id":"665f1c2ab0e4d9a1c3f7e210","email_hash":"3a91d0c4..."},"msg":"auth.signin.failure"}
{"level":40,"time":"2026-10-24T13:52:40.118Z","env":"production","log_type":"security","event":{"action":"session.refresh.reuse_detected","category":"session","outcome":"failure","severity":"high","reason":"reused"},"request_id":"c1d2...","source":{"ip":"203.0.113.50"},"client":"web","http":{"method":"POST","route":"/api/auth/refresh"},"msg":"session.refresh.reuse_detected"}
{"level":40,"time":"2026-10-24T14:01:03.902Z","env":"production","log_type":"security","event":{"action":"account.bkash.changed","category":"account","outcome":"success","severity":"high"},"request_id":"7e44...","source":{"ip":"103.0.113.7"},"client":"android/10203","http":{"method":"PUT","route":"/api/v1/user/profile"},"user":{"id":"665f1c2ab0e4d9a1c3f7e210"},"extra":{"change":"changed"},"msg":"account.bkash.changed"}
{"level":40,"time":"2026-10-24T14:05:21.477Z","env":"production","log_type":"security","event":{"action":"authz.denied","category":"authorization","outcome":"failure","severity":"medium","reason":"not_owner"},"request_id":"0b9a...","source":{"ip":"198.51.100.23"},"client":"web","http":{"method":"GET","route":"/api/order/ORD1729771234"},"user":{"id":"66a01b..."},"extra":{"resource_type":"order"},"msg":"authz.denied"}
{"level":30,"time":"2026-10-24T14:06:00.010Z","env":"production","log_type":"security","event":{"action":"ratelimit.exceeded","category":"abuse","outcome":"failure","severity":"low"},"request_id":"5d2f...","source":{"ip":"198.51.100.99"},"client":"web","http":{"method":"POST","route":"/api/auth/signin"},"extra":{"limiter":"auth"},"msg":"ratelimit.exceeded"}
{"level":40,"time":"2026-10-24T14:10:44.731Z","env":"production","log_type":"security","event":{"action":"admin.message.sent","category":"admin","outcome":"success","severity":"medium"},"request_id":"a8e1...","source":{"ip":"103.0.113.2"},"client":"web","http":{"method":"POST","route":"/api/admin/message"},"user":{"id":"65ff0a..."},"extra":{"audience":"all","channel":"both","recipient_count":312},"msg":"admin.message.sent"}
```

---

## Never logged

In security events and request lines alike:

- Passwords, old or new, right or wrong
- One-time codes of any kind: sign-up, reset, two-step, change of address
- Access tokens, refresh tokens, Google ID tokens and authorisation codes,
  nonces, and any cookie value
- E-mail addresses (only the keyed hash appears)
- Phone numbers, postal addresses and bKash numbers
- Request bodies, and query strings (request lines keep the path only)
- Free text a person typed: names, messages, reviews

`noSecretsInLogs.test.ts` checks this. It signs up, signs in with a typo and
then the right password, refreshes, fills in phone, address and bKash number,
buys a book, and changes the password. It then reads every request line and
event and fails if any of those values, or the address, appears.

---

## Retention

The app does not store these events. It writes them to standard output, and
the host keeps whatever its plan keeps; on Render's free plan that is a short
rolling window. Keeping them longer, or sending them to a SIEM, would be a
separate piece of work.

---

## Notes for detections

- **Joining to requests.** `request_id` matches `req.id` on the request line
  and the `X-Request-Id` response header. A client may send its own
  `X-Request-Id` (up to 128 characters) so that a trace survives a proxy.
  Treat the id as a join key, not as evidence.
- **`email_hash` is keyed.** E-mail addresses are easy to guess, so a plain
  SHA-256 of one can be reversed by hashing a list of addresses. The key is
  derived from `JWT_SECRET` with a label of its own, the same way the sign-in
  lock and the device cookie derive theirs, so there is no extra secret to
  manage. If `JWT_SECRET` is rotated, every hash changes and correlation
  across the rotation is lost (a rotation also signs everyone out).
- **Counting per account and per address.** A lockout is per e-mail address,
  so lots of `auth.signin.failure` events from one `source.ip` spread across
  many `email_hash` values never trigger one. Rate limits are per IP. Credential stuffing is the
  pattern neither control catches on its own.
- **`client` is a claim.** It comes from the `X-Client` header, which any
  caller can set. Only `device_mismatch` and a successful Android refresh
  prove a real phone.
- **`source.ip`** is the visitor as resolved through the trusted proxies, the
  same address the rate limits count. Requests that reach Render without
  passing through Cloudflare's listed ranges are counted by the last proxy's
  address.

### Starting points

```bash
# Only the security events, from a JSON log stream
jq -c 'select(.log_type == "security")' app.log

# High severity
jq -c 'select(.log_type == "security" and .event.severity == "high")' app.log

# Failed sign-ins per IP, and how many accounts each one tried
jq -r 'select(.event.action == "auth.signin.failure") | [.source.ip, .user.email_hash] | @tsv' app.log \
  | sort -u | cut -f1 | uniq -c | sort -rn
```

---

## MITRE ATT&CK mapping

A starting point for detection writing. **Verify each technique against the
current ATT&CK release before publishing.**

| Events | Technique |
| --- | --- |
| `auth.signin.failure`, `auth.lockout`, `auth.otp.failure` | T1110 Brute Force (T1110.001 Password Guessing) |
| `auth.signin.failure` across many `email_hash` from one IP | T1110.003 Password Spraying / T1110.004 Credential Stuffing |
| `auth.2fa.failure` after a correct password; `auth.signin.success` after failures | T1078 Valid Accounts |
| `session.refresh.reuse_detected`, `session.refresh.device_mismatch` | T1550.001 Use Alternate Authentication Material: Application Access Token (theft: T1528) |
| `auth.token.invalid` | T1606 Forge Web Credentials |
| `account.password.changed`, `account.email.changed`, `auth.password.reset` | T1098 Account Manipulation |
| `account.2fa.disabled` | T1556.006 Modify Authentication Process: Multi-Factor Authentication |
| `account.bkash.changed` | T1098 Account Manipulation, toward T1657 Financial Theft |
| `account.data_exported` | T1213 Data from Information Repositories |
| `account.deleted`, `admin.user.deleted` | T1531 Account Access Removal |
| `admin.role.granted` | T1098 Account Manipulation / T1078 Valid Accounts |
| `authz.denied` repeated across ids | T1190 Exploit Public-Facing Application (probing for access-control flaws) |
| `upload.url_rejected` | T1659 Content Injection (attempted) |
| `admin.message.sent` to a broad audience | T1534 Internal Spearphishing, if the administrator account is compromised |
| `ratelimit.exceeded` (`general`) | T1499.002 Endpoint Denial of Service: Service Exhaustion Flood |
| `turnstile.failed`, `ratelimit.exceeded` (`auth`) | Automated T1110 attempts |
