/**
 * Drives headless Chrome over CDP and reports anything the page complained
 * about - CSP violations in particular - plus whether React actually mounted.
 *
 * Usage: node cspcheck.mjs <debugging-port> <url> [<url> ...]
 */
const port = process.argv[2];
const urls = process.argv.slice(3);

const listTargets = async () => {
  const res = await fetch(`http://127.0.0.1:${port}/json/list`);
  return res.json();
};

const send = (ws, id, method, params = {}) =>
  ws.send(JSON.stringify({ id, method, params }));

const checkOne = async (wsUrl, url) => {
  const ws = new WebSocket(wsUrl);
  const problems = [];
  let mounted = false;

  await new Promise((resolve, reject) => {
    let id = 0;
    const timer = setTimeout(resolve, 12000);

    ws.onerror = reject;

    ws.onopen = () => {
      send(ws, ++id, 'Log.enable');
      send(ws, ++id, 'Runtime.enable');
      send(ws, ++id, 'Page.enable');
      send(ws, ++id, 'Page.navigate', { url });
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      if (msg.method === 'Log.entryAdded') {
        const e = msg.params.entry;
        if (e.level === 'error' || e.source === 'security') {
          problems.push(`[${e.source}/${e.level}] ${e.text}`);
        }
      }

      if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
        problems.push(
          `[console.error] ${msg.params.args.map((a) => a.value ?? a.description ?? '').join(' ')}`
        );
      }

      // Once the load event fires, give React a moment then read the DOM.
      if (msg.method === 'Page.loadEventFired') {
        setTimeout(() => {
          send(ws, 900, 'Runtime.evaluate', {
            expression: "document.getElementById('root')?.children.length ?? -1",
          });
        }, 3500);
      }

      if (msg.id === 900) {
        mounted = (msg.result?.result?.value ?? -1) > 0;
        clearTimeout(timer);
        resolve();
      }
    };
  });

  ws.close();
  return { problems, mounted };
};

const targets = await listTargets();
const page = targets.find((t) => t.type === 'page');
if (!page) {
  console.log('no page target found');
  process.exit(1);
}

let failed = false;
for (const url of urls) {
  const { problems, mounted } = await checkOne(page.webSocketDebuggerUrl, url);
  const csp = problems.filter((p) => /Content Security Policy|violates|Refused to/i.test(p));

  console.log(`\n${url}`);
  console.log(`  React mounted        : ${mounted ? 'yes' : 'NO'}`);
  console.log(`  CSP violations       : ${csp.length}`);
  for (const c of csp.slice(0, 8)) console.log(`      ${c}`);

  const other = problems.filter((p) => !csp.includes(p));
  console.log(`  other page errors    : ${other.length}`);
  for (const o of other.slice(0, 5)) console.log(`      ${o.slice(0, 160)}`);

  if (!mounted || csp.length) failed = true;
}

process.exit(failed ? 1 : 0);
