# Contributing to BookStoreBD

Thanks for taking the time to contribute. This guide covers everything you need
to get a change merged.

## Table of contents

- [Getting set up](#getting-set-up)
- [Branching](#branching)
- [Commit messages](#commit-messages)
- [Before you open a pull request](#before-you-open-a-pull-request)
- [Code style](#code-style)
- [Project conventions](#project-conventions)
- [Reporting bugs](#reporting-bugs)

---

## Getting set up

```bash
git clone https://github.com/UtshaBasak/MernBookstore.git
cd MernBookstore
npm install
npm run install:all

cp server/.env.example server/.env
cp client/.env.example client/.env
# fill in MONGO, JWT_SECRET, SMTP_USER and SMTP_PASS in server/.env
# generate a secret with: openssl rand -hex 48

npm run dev
```

Or, without installing Node or MongoDB at all:

```bash
docker compose up --build
docker compose run --rm seed
```

The full setup notes live in the [README](README.md#getting-started), and the
Docker path is in [Running with Docker](README.md#running-with-docker).

---

## Branching

Branch off `master` and use a short, descriptive name prefixed with the kind of
change:

| Prefix      | Use for                        | Example                          |
| ----------- | ------------------------------ | -------------------------------- |
| `feat/`     | A new capability               | `feat/seller-analytics`          |
| `fix/`      | A bug fix                      | `fix/cart-stock-race`            |
| `refactor/` | Restructuring without behaviour change | `refactor/order-controller` |
| `docs/`     | Documentation only             | `docs/api-reference`             |
| `chore/`    | Tooling, dependencies, CI      | `chore/bump-vite`                |

---

## Commit messages

Write messages in the imperative mood, with a subject line under 72 characters:

```text
fix: remove stock-out books from every cart on checkout

The decrease-stock handler reserved stock after creating the order, so a
race on the last copy could oversell. Reserve first, then record.
```

Prefixes that map onto the branch table above (`feat:`, `fix:`, `refactor:`,
`docs:`, `chore:`) keep the history readable.

---

## Before you open a pull request

Run both checks locally — CI runs the same ones and will block the merge
otherwise:

```bash
npm run lint    # ESLint across client/ and server/
npm test        # server + client suites
npm run build   # production client bundle
```

Then confirm:

- New behaviour has a test, and a fixed bug has a regression test
- No `.env` file, secret, credential or `node_modules` directory is staged
- Any new environment variable is documented in the matching `.env.example`
  **and** in the README's environment table
- New endpoints are added to the README's API reference
- The client uses `API_BASE_URL` from `src/config/api.js` — never a hardcoded host

Open the PR against `master` and fill in the template.

---

## Code style

- **Modules:** ES modules everywhere (`import`/`export`), on both client and server.
  The server's `package.json` sets `"type": "module"`, so CommonJS `require`
  will fail at runtime.
- **Formatting:** 2-space indent, single quotes, semicolons, LF line endings.
  [`.editorconfig`](.editorconfig) and [`.gitattributes`](.gitattributes) enforce
  the whitespace rules automatically in most editors.
- **Linting:** ESLint 10 flat config, one per package. Fix warnings rather than
  disabling rules; if a disable is genuinely needed, add a comment explaining why.
- **Tests:** Vitest in both packages. Import `describe`/`it`/`expect` from
  `vitest` explicitly rather than relying on globals, so ESLint stays happy.
  Server tests use the helpers in `server/tests/helpers/`; do not start your
  own MongoDB instance, one is shared across the run.
- **Tests are hermetic.** `server/.env` is not read under Vitest, and the
  optional integration variables are cleared in every worker, so a suite cannot
  pass or fail based on which services a given developer happens to have
  configured. A test that needs one sets it itself.

---

## Project conventions

### Server

- One router and one controller per domain, named `<domain>.route.js` and
  `<domain>.controller.js`.
- Routers stay thin — request handling logic belongs in the controller.
- `app.js` must remain side-effect free: no `listen`, no database connection.
  Anything that starts the process belongs in `index.js`.
- Read configuration through `config/env.js`, never `process.env` directly.
- Never return a stack trace, raw error object or password field in a response.
- **Take the acting user from `req.user`, never from a request parameter.** An
  `?email=` or a body field is supplied by the caller and proves nothing. Guard
  new routes with `requireAuth`, `requireAdmin`, or an ownership check, and add
  a test for the unauthorised case as well as the happy path.
- **Every route gets a Zod schema.** Add it to `server/schemas/`, wire it with
  `validate({ body, query, params })`, and let the handler trust the parsed
  result rather than re-checking types. For a multipart route, `validate` goes
  *after* multer, which is what populates `req.body`.

### Client

- Route-level screens go in `src/pages/`, shared UI in `src/components/`.
- Every network call resolves its origin through `src/config/api.js`, and uses
  `apiFetch` (or axios, which has an interceptor) so the bearer token is
  attached. A bare `fetch` to the API will be anonymous and get a `401`.
- Client-side route guards decide what to *render*. They are not a security
  boundary — the server re-checks the token and role on every request.
- Only variables prefixed with `VITE_` reach the browser bundle — never put a
  secret in `client/.env`.

---

## Reporting bugs

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
and include reproduction steps, what you expected, and what actually happened.
For anything security-sensitive, contact a maintainer directly instead of filing
a public issue.
