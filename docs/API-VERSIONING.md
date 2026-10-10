# API versioning

The website and the API are deployed together, so the website can change with
the API on every push. The Android app cannot: a release stays installed on
phones for months. The app therefore calls a versioned API that keeps working
for every build still in use.

## Two prefixes, one API

| Prefix | Used by | Changes |
| --- | --- | --- |
| `/api` | The website | Freely, together with the website |
| `/api/v1` | The Android app | Additions only |

Both prefixes are served by the same routers (`server/app.ts`), with the same
validation, authorisation and rate limits; a request counts against one budget
whichever prefix it uses. `/api/v1/app` adds the few endpoints only the app
needs: its configuration and its sign-in (see the README's API reference).

## What may change in v1

Allowed at any time:

- a new endpoint;
- a new optional request field, or a new query parameter with a default;
- a new response field;
- a new value in a list the app treats as open, such as a notification type
  (the app shows an unknown type generically).

Not allowed in v1, because an installed app would break:

- removing or renaming an endpoint or a response field;
- changing a field's type or meaning, such as a price in paisa instead of taka;
- making an optional request field required;
- tightening validation so that a request a released app sends is refused.

`server/tests/apiVersioning.test.ts` pins the response fields the app reads. A
change that fails it belongs in a new version.

## Making a breaking change

1. Mount the new behaviour under `/api/v2`, leaving `/api/v1` as it was.
2. Release an app that uses `/api/v2`.
3. Keep `/api/v1` for at least six months after that release, sending
   `Deprecation` and `Sunset` headers on it.
4. Raise `ANDROID_MIN_VERSION_CODE` to the first build that uses `/api/v2`.
   Older builds are then answered `426` with `code: "app-update-required"`,
   and the app asks to be updated; `/api/v1/app/config` stays reachable so it
   can say where the update is.
5. Remove `/api/v1`.

## Identifying the app

The app sends `X-Client: android/<versionCode>` on every request. The version
code is derived from the version name, as in the app's build: 1.2.3 is 10203.
Requests without the header, such as the website's, are never refused by the
version check.
