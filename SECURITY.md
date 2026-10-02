# Security Policy

BookStoreBD handles people's accounts, delivery addresses, phone numbers and
bKash numbers, so security reports are treated as a priority. Thank you for
reporting responsibly.

## Supported versions

Only the current `master` branch, which is what runs at
<https://bookstorebd-loum.onrender.com>, receives security fixes. Older commits
and forks are not maintained.

The team's original group project,
[Prottasha0212/MernBookstore](https://github.com/Prottasha0212/MernBookstore), is
a separate repository and deployment. Report issues in it to its owners.

## Reporting a vulnerability

**Please do not open a public issue, discussion or pull request for a security
problem.** Report it privately, in either of these ways:

1. **GitHub (preferred):** go to the
   [Security tab](https://github.com/UtshaBasak/BookStoreBD/security) and choose
   **Report a vulnerability**. This opens a private advisory that only you and
   the maintainer can see.
2. **E-mail:** <support.utsha@gmail.com>, with "Security" in the subject.

Include what you can of:

- what the problem is, and what an attacker could do with it;
- the steps, request or URL that show it;
- the affected page, endpoint or file;
- whether you think it has been used against the live site.

## What to expect

- An acknowledgement once the report has been read.
- An assessment of how serious it is, and what will be done about it.
- A fix with the priority its severity calls for, then a published advisory
  crediting you, unless you would rather not be named.

The project has a single maintainer, so no fixed response time is promised.
Every private report is read, and a follow-up is welcome if a reply seems
overdue.

## In scope

- The live site and its API, under `/api`
- The code in this repository: client, server, Docker and CI configuration
- Ways to read or change another person's account, orders, messages, addresses
  or payout details
- Ways to place, change or cancel orders, or set prices, outside the rules the
  shop shows

## Out of scope

- Denial of service and load testing. The live site runs on a free hosting
  plan; please do not attempt to overwhelm it.
- Social engineering, phishing, or physical attacks on people
- Reports from automated scanners without a demonstrated impact
- Missing best-practice headers or settings with no exploit
- Problems in third-party services (Render, MongoDB Atlas, Cloudinary, Gmail)
  rather than in how this project uses them

## Known, accepted findings

These findings are already recorded, with the reasoning:

- [`docs/AUDIT.md`](docs/AUDIT.md): the production-readiness audit, including
  the hardening done and still planned, such as storing images outside the
  database (P4).
- [`docs/ROADMAP.md`](docs/ROADMAP.md#known-codeql-findings): CodeQL results
  confirmed as false positives.

A new way to exploit one of these is still worth reporting.

## Safe harbour

Good-faith research that follows this policy will not be treated as an attack.
Please:

- test only against your own accounts, or the demo accounts from a local copy
  (see the README's
  [Running with Docker](https://github.com/UtshaBasak/BookStoreBD#running-with-docker));
- not access, keep or change other people's data beyond the minimum needed to
  show the problem;
- give a reasonable time to fix it before telling anyone else.
