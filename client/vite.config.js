import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // server: {
  //   proxy: {
  //     '/auth': {
  //       target: 'http://localhost:1015/auth',
  //       secure: false,
  //       changeOrigin: true,
  //     },
  //   },
  // },
       

  plugins: [react(), tailwindcss(),],
});
