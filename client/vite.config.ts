import { createLogger, defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Keep the vendor libraries in their own chunks so app code can be re-deployed
// without busting the whole bundle cache.
const REACT_CHUNK = ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'];
const VENDOR_CHUNK = ['axios', 'notistack', 'react-icons'];
// Loaded only when a signed-in page opens the live chat (utils/socket.ts), so
// kept out of the vendor chunk every visitor downloads.
const SOCKET_CHUNK = ['socket.io-client', 'socket.io-parser', 'engine.io-client', 'engine.io-parser', '@socket.io/component-emitter'];

/**
 * Vite 8 builds with Rolldown, which accepts only the function form of
 * `manualChunks` — the object form throws "manualChunks is not a function".
 */
const manualChunks = (id: string): string | undefined => {
  const normalized = id.split('\\').join('/');
  if (!normalized.includes('/node_modules/')) return undefined;

  const match = normalized.match(/\/node_modules\/(?:\.pnpm\/)?((?:@[^/]+\/)?[^/]+)/);
  const pkg = match?.[1];
  if (!pkg) return undefined;

  if (REACT_CHUNK.includes(pkg)) return 'react';
  if (VENDOR_CHUNK.includes(pkg)) return 'vendor';
  if (SOCKET_CHUNK.includes(pkg)) return 'socket';
  return undefined;
};

/*
 * One line while the API starts, instead of a stack trace per request.
 *
 * `npm run dev` starts Vite and the API together, and Vite is ready first. An
 * open tab keeps requesting in the meantime, and each refused connection would
 * otherwise print a multi-line `AggregateError [ECONNREFUSED]`, burying real
 * errors in the terminal.
 *
 * Refused connections are collapsed into one warning, repeated at most every
 * ten seconds while it lasts. Every other proxy error, and any response from
 * the API, is reported as normal.
 */
const API_TARGET = process.env.VITE_PROXY_TARGET || 'http://localhost:4000';
const logger = createLogger();
const logError = logger.error.bind(logger);
let lastWaitingNotice = 0;

logger.error = (message, options) => {
  const refused =
    /proxy error/.test(message) &&
    /ECONNREFUSED/.test(`${message} ${String(options?.error?.stack ?? '')}`);

  if (!refused) {
    logError(message, options);
    return;
  }

  const now = Date.now();
  if (now - lastWaitingNotice > 10_000) {
    lastWaitingNotice = now;
    logger.warn(`waiting for the API at ${API_TARGET} - requests will succeed once it is listening`, {
      timestamp: true,
    });
  }
};

/** Every proxied path goes to the same place, and resets the notice once it answers. */
const toApi = (extra: ProxyOptions = {}): ProxyOptions => ({
  target: API_TARGET,
  changeOrigin: true,
  configure: (proxy) => {
    proxy.on('proxyRes', () => {
      lastWaitingNotice = 0;
    });
  },
  ...extra,
});

// https://vite.dev/config/
export default defineConfig({
  customLogger: logger,
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    hmr: { overlay: false },
    // Proxying the API through the dev server makes development same-origin,
    // which is what lets the refresh cookie be first-party here as well as in
    // production. One namespace, so a client-side route like /cart is never
    // mistaken for the endpoint of the same name.
    proxy: {
      '/api': toApi(),
      '/health': toApi(),
      '/socket.io': toApi({ ws: true }),
    },
    watch: {
      // Filesystem events do not cross a Windows bind mount into a Linux
      // container, so hot reload needs polling there. Off by default, since
      // polling is much heavier than native events.
      usePolling: process.env.VITE_USE_POLLING === 'true',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: { manualChunks },
    },
  },
});
