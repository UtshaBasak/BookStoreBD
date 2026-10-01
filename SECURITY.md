# Security Policy

BookStoreBD handles people's accounts, delivery addresses, phone numbers and
bKash numbers, so a security problem matters even in a small shop. Thank you
for reporting one responsibly.

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

- An acknowledgement, usually within **3 days**.
- An assessment and a plan, usually within **7 days**.
- A fix as fast as its severity calls for, then a published advisory crediting
  you, unless you would rather not be named.

This is a one-person project, so these are aims, not guarantees. If you hear
nothing within a week, please send a reminder.

## In scope

- The live site and its API, under `/api`
- The code in this repository: client, server, Docker and CI configuration
- Ways to read or change another person's account, orders, messages, addresses
  or payout details
- Ways to place, change or cancel orders, or set prices, outside the rules the
  shop shows

## Out of scope

- Denial of service and load testing. The site runs on a free hosting plan;
  please do not try to overwhelm it.
- Social engineering, phishing, or physical attacks on people
- Reports from automated scanners without a demonstrated impact
- Missing best-practice headers or settings with no exploit
- Problems in third-party services (Render, MongoDB Atlas, Cloudinary, Gmail)
  rather than in how this project uses them

## Known, accepted findings

Some findings are already known and recorded, with the reasons:

- [`docs/AUDIT.md`](docs/AUDIT.md): the production-readiness audit. It lists
  what is still open, such as the access token being kept in `localStorage` (S3)
  and the bcrypt cost (S7).
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
