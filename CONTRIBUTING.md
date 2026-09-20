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
# fill in MONGO, SMTP_USER and SMTP_PASS in server/.env

npm run dev
```

The full setup notes live in the [README](README.md#getting-started).

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
npm run build   # production client bundle
```

Then confirm:

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

### Client

- Route-level screens go in `src/pages/`, shared UI in `src/components/`.
- Every network call resolves its origin through `src/config/api.js`.
- Only variables prefixed with `VITE_` reach the browser bundle — never put a
  secret in `client/.env`.

---

## Reporting bugs

Open an issue using the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md)
and include reproduction steps, what you expected, and what actually happened.
For anything security-sensitive, contact a maintainer directly instead of filing
a public issue.
