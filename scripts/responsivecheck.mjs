/**
 * Drives headless Chrome over CDP and reports how a page behaves at phone,
 * tablet and desktop widths: whether it scrolls sideways, what is causing it,
 * how many tap targets are too small to hit, and the smallest type on screen.
 *
 * Reading the CSS does not answer these questions - a fixed width only
 * overflows once it meets a viewport, and `100vw` only overflows once there is
 * a scrollbar. So it is measured in a browser instead.
 *
 * Usage:
 *   node responsivecheck.mjs <port> <base-url> <route> [<route> ...]
 *
 * Environment:
 *   AUTH_TOKEN, AUTH_EMAIL, AUTH_ROLE   seeded into localStorage, for the
 *                                       routes behind a sign-in guard. Mint the
 *                                       token immediately before the run: an
 *                                       access token lasts fifteen minutes, and
 *                                       an expired one signs the app out to
 *                                       `/sign-in`, so every route measures the
 *                                       sign-in page. The `page` column names
 *                                       what was actually measured, which is
 *                                       how to spot it.
 *   WIDTHS                              comma-separated, default 360,390,768,1280
 */
const port = process.argv[2];
const base = process.argv[3].replace(/\/$/, '');
const routes = process.argv.slice(4);
const widths = (process.env.WIDTHS ?? '360,390,768,1280').split(',').map(Number);

/** Below this, a control is hard to hit with a thumb. */
const MIN_TAP = 40;
/** Widths treated as touch screens: phones and tablets both. */
const TOUCH_BELOW = Number(process.env.TOUCH_BELOW ?? 1024);
/** Below this, body text is hard to read on a phone. */
const MIN_FONT = 12;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.error('no page target - is Chrome running with --remote-debugging-port?');
  process.exit(1);
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
const pending = new Map();
let id = 0;
let consoleErrors = [];

const call = (method, params = {}) =>
  new Promise((resolve) => {
    const callId = ++id;
    pending.set(callId, resolve);
    ws.send(JSON.stringify({ id: callId, method, params }));
  });

const evaluate = async (expression) => {
  const res = await call('Runtime.evaluate', {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  return res?.result?.result?.value;
};

await new Promise((resolve, reject) => {
  ws.onerror = reject;
  ws.onopen = resolve;
});

ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    consoleErrors.push(msg.params.entry.text.slice(0, 120));
  }
};

await call('Log.enable');
await call('Runtime.enable');
await call('Page.enable');

// The session is set up before any app code runs, and cleared first either
// way: a token left over from an earlier run expires, the app's first request
// comes back 401, and it signs out to `/sign-in` - so every route measures the
// sign-in page instead of itself, and looks wonderfully responsive.
await call('Page.navigate', { url: base });
await sleep(1500);
await evaluate('localStorage.clear()');

if (process.env.AUTH_TOKEN) {
  await evaluate(`
    localStorage.setItem('authToken', ${JSON.stringify(process.env.AUTH_TOKEN)});
    localStorage.setItem('userEmail', ${JSON.stringify(process.env.AUTH_EMAIL ?? '')});
    localStorage.setItem('userRole', ${JSON.stringify(process.env.AUTH_ROLE ?? 'user')});
  `);
}

/**
 * Runs in the page. Everything here is measured from laid-out geometry rather
 * than from the stylesheet, which is the only way to catch a width that is
 * fine until it meets a scrollbar.
 */
const MEASURE = `(() => {
  const doc = document.documentElement;
  const overflow = doc.scrollWidth - doc.clientWidth;

  const describe = (el) => {
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (cls ? '.' + cls : '');
  };

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  const all = [...document.querySelectorAll('body *')];

  // Something inside a carousel is meant to extend past the edge - that is
  // what makes it a carousel. Only elements that the page itself cannot
  // contain are worth reporting.
  const inScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };

  // A hidden overflow is not a scroll container: it does not scroll, it
  // amputates. Content past the edge of one is simply unreachable, and the page
  // reports no overflow while it happens - which is how an admin page with its
  // table pushed off the side of a phone looked perfectly clean.
  const clipped = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right <= doc.clientWidth + 1 || r.width < 40 || !visible(el)) continue;
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') break;
      if (ox === 'hidden') {
        clipped.push({ el: describe(el), width: Math.round(r.width), cutAt: Math.round(doc.clientWidth - r.left) });
        break;
      }
    }
  }
  const seenClipped = new Set();
  const cutOff = clipped.filter((c) => !seenClipped.has(c.el) && seenClipped.add(c.el)).slice(0, 4);

  // What is actually sticking out past the right edge.
  const culprits = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.right > doc.clientWidth + 1 && r.width > 40 && visible(el) && !inScroller(el)) {
      culprits.push({
        el: describe(el),
        width: Math.round(r.width),
        right: Math.round(r.right),
        // A width set in vw is the usual cause and worth naming separately.
        vw: (el.getAttribute('style') || '').includes('vw'),
      });
    }
  }
  culprits.sort((a, b) => b.right - a.right);
  const seen = new Set();
  const worst = culprits.filter((c) => !seen.has(c.el) && seen.add(c.el)).slice(0, 6);

  // Controls too small to hit reliably with a thumb.
  const controls = all.filter(
    (el) => ['A', 'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) || el.getAttribute('role') === 'button'
  );
  // A checkbox is 13px wide whatever anyone does, but tapping its label works
  // just as well - so what counts is the area that responds, not the box.
  const target = (el) => {
    const own = el.getBoundingClientRect();
    const label = el.closest('label');
    if (!label) return own;
    const wrapped = label.getBoundingClientRect();
    return wrapped.width * wrapped.height > own.width * own.height ? wrapped : own;
  };

  const small = controls
    .filter(visible)
    .map((el) => ({ el: describe(el), ...(({ width, height }) => ({ w: Math.round(width), h: Math.round(height) }))(target(el)) }))
    .filter((c) => c.w < ${MIN_TAP} || c.h < ${MIN_TAP});

  // The smallest type carrying actual words.
  let smallest = Infinity;
  for (const el of all) {
    if (!visible(el)) continue;
    const text = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 2);
    if (!text) continue;
    const size = parseFloat(getComputedStyle(el).fontSize);
    if (size && size < smallest) smallest = size;
  }

  return {
    viewport: doc.clientWidth,
    scrollWidth: doc.scrollWidth,
    overflowPx: overflow > 1 ? overflow : 0,
    worst,
    cutOff,
    tapTargetsTooSmall: small.length,
    smallestTapTargets: small.slice(0, 4),
    smallestFontPx: smallest === Infinity ? null : Math.round(smallest * 10) / 10,
    mounted: (document.getElementById('root')?.children.length ?? 0) > 0,
    // A fingerprint of what was actually measured. A page that redirected, or
    // rendered an error boundary, looks fine on every other number.
    heading: (document.querySelector('h1, h2, h3')?.textContent ?? '').trim().slice(0, 40),
    textLength: document.body.innerText.trim().length,
  };
})()`;

const report = {};

for (const route of routes) {
  report[route] = {};
  for (const width of widths) {
    await call('Emulation.setDeviceMetricsOverride', {
      width,
      height: 844,
      deviceScaleFactor: 1,
      mobile: width < TOUCH_BELOW,
    });
    // Device metrics alone do not make `pointer: coarse` match - that needs
    // touch emulation, and without it a stylesheet's touch rules are never
    // exercised. A tablet is a touch device too, so the cut-off is above the
    // tablet widths rather than below them: measuring 768px with a mouse said
    // the touch rules were fine there when they had never run.
    await call('Emulation.setTouchEmulationEnabled', {
      enabled: width < TOUCH_BELOW,
      maxTouchPoints: 5,
    });
    consoleErrors = [];
    await call('Page.navigate', { url: base + route });

    // Waiting a fixed number of seconds measures whatever happened to be on
    // screen. Poll for real content instead, so a slow query cannot quietly
    // turn into a page with nothing on it and a clean bill of health.
    let text = 0;
    for (let waited = 0; waited < 12000; waited += 500) {
      await sleep(500);
      text = await evaluate('document.body.innerText.trim().length');
      if (text > 200) break;
    }
    // A moment more for images and the last of the layout to settle.
    await sleep(800);

    const measured = await evaluate(MEASURE);
    // Only meaningful where a thumb is doing the pointing; 39px is a fine
    // target for a mouse, so counting it on a desktop width says nothing.
    if (width >= TOUCH_BELOW) {
      measured.tapTargetsTooSmall = null;
      measured.smallestTapTargets = [];
    }
    report[route][width] = {
      ...measured,
      ...(consoleErrors.length ? { consoleErrors: consoleErrors.slice(0, 3) } : {}),
    };
  }
}

// A one-line summary per route and width, then the detail.
console.log(
  'route'.padEnd(30),
  'width'.padEnd(7),
  'overflow'.padEnd(10),
  'small taps'.padEnd(12),
  'min font'.padEnd(10),
  'cut off'.padEnd(9),
  'page'
);
for (const [route, widths_] of Object.entries(report)) {
  for (const [width, r] of Object.entries(widths_)) {
    const overflow = r.overflowPx ? `+${r.overflowPx}px` : 'none';
    const font = r.smallestFontPx === null ? '-' : `${r.smallestFontPx}px${r.smallestFontPx < MIN_FONT ? ' !' : ''}`;
    console.log(
      route.padEnd(30),
      String(width).padEnd(7),
      overflow.padEnd(10),
      (r.tapTargetsTooSmall === null ? '-' : String(r.tapTargetsTooSmall)).padEnd(12),
      font.padEnd(10),
      String(r.cutOff?.length ?? 0).padEnd(9),
      r.mounted ? `${r.heading} (${r.textLength} chars)` : 'DID NOT MOUNT'
    );
  }
}

console.log();
console.log(JSON.stringify(report, null, 2));
ws.close();
