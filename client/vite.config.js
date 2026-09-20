import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';

// Keep the vendor libraries in their own chunks so app code can be re-deployed
// without busting the whole bundle cache.
const REACT_CHUNK = ['react', 'react-dom', 'react-router', 'react-router-dom', 'scheduler'];
const VENDOR_CHUNK = [
  'axios',
  'notistack',
  'react-icons',
  'socket.io-client',
  'socket.io-parser',
  'engine.io-client',
  'engine.io-parser',
];

/**
 * Vite 8 builds with Rolldown, which accepts only the function form of
 * `manualChunks` — the object form throws "manualChunks is not a function".
 */
const manualChunks = (id) => {
  const normalized = id.split('\\').join('/');
  if (!normalized.includes('/node_modules/')) return undefined;

  const match = normalized.match(/\/node_modules\/(?:\.pnpm\/)?((?:@[^/]+\/)?[^/]+)/);
  const pkg = match?.[1];
  if (!pkg) return undefined;

  if (REACT_CHUNK.includes(pkg)) return 'react';
  if (VENDOR_CHUNK.includes(pkg)) return 'vendor';
  return undefined;
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    hmr: { overlay: false },
    // Proxying the API through the dev server makes development same-origin,
    // which is what lets the refresh cookie be first-party here as well as in
    // production. Keep this list in step with server/config/apiPaths.js.
    proxy: Object.fromEntries(
      [
        '/auth',
        '/book',
        '/cart',
        '/chat',
        '/filter',
        '/health',
        '/order',
        '/purchase',
        '/return',
        '/upload',
        '/uploads',
        '/user',
        '/wishlist',
      ].map((prefix) => [
        prefix,
        {
          target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
          changeOrigin: true,
          ws: prefix === '/socket.io',
        },
      ])
    ),
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
