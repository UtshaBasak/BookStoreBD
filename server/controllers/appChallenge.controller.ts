import type { RequestHandler } from 'express';

import { captchaSiteKey } from '../utils/captcha.js';

/**
 * The bot check for the Android app: Cloudflare Turnstile, the same check the
 * website's sign-in uses, on a page of its own that the app opens in a web
 * view. The page passes the token to the app (challenge.js), and the app sends
 * it with the sign-in or sign-up code request as `captchaToken`, where it is
 * verified exactly as the website's is.
 *
 * Served by this site because Turnstile only runs on the hostnames its keys
 * are registered for. Nothing on the page but the check, under the site's own
 * Content Security Policy: no inline script, nothing from anywhere but here
 * and Cloudflare.
 */

const escapeAttribute = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** GET /app/challenge?theme=light|dark */
export const appChallengePage: RequestHandler = (req, res, next) => {
  const siteKey = captchaSiteKey();
  if (!siteKey) {
    next();
    return;
  }
  // Literals only: nothing from the request is written into the page.
  const theme = req.query.theme === 'dark' ? 'dark' : req.query.theme === 'light' ? 'light' : 'auto';
  const background = theme === 'dark' ? '#0f0d18' : '#f8f7fc';
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Security check - BookStoreBD</title>
<style>
  html, body { margin: 0; height: 100%; background: ${background}; }
  main { display: flex; min-height: 100%; align-items: center; justify-content: center; }
</style>
</head>
<body>
<main>
  <div class="cf-turnstile" data-sitekey="${escapeAttribute(siteKey)}" data-theme="${theme}"
       data-callback="bookstoreChallengeDone" data-error-callback="bookstoreChallengeFailed"
       data-expired-callback="bookstoreChallengeExpired" data-timeout-callback="bookstoreChallengeExpired"></div>
</main>
<script src="/app/challenge.js"></script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</body>
</html>
`;
  res.set('Cache-Control', 'no-store').type('html').send(html);
};

/**
 * Hands Turnstile's answer to the app, through the message channel the app
 * opens for this site's origin only (androidx.webkit's WebMessageListener).
 * Opened in an ordinary browser, it does nothing.
 */
const CHALLENGE_SCRIPT = `(function () {
  'use strict';
  function send(message) {
    var channel = window.BookStoreBDChallenge;
    if (channel && typeof channel.postMessage === 'function') channel.postMessage(JSON.stringify(message));
  }
  window.bookstoreChallengeDone = function (token) { send({ type: 'token', token: String(token) }); };
  window.bookstoreChallengeFailed = function (code) { send({ type: 'error', code: String(code) }); return true; };
  window.bookstoreChallengeExpired = function () { send({ type: 'expired' }); };
})();
`;

/** GET /app/challenge.js */
export const appChallengeScript: RequestHandler = (_req, res) => {
  res.set('Cache-Control', 'public, max-age=3600').type('application/javascript').send(CHALLENGE_SCRIPT);
};
