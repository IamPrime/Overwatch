import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
// Port of the API server the dev proxy below forwards /api to. The root `npm run dev` (scripts/dev.js)
// picks a free one and passes it as API_PORT; running Vite on its own falls back to PORT from the
// root .env (next to server.js, not frontend/.env), then 3000.
const apiPort = process.env.API_PORT || loadEnv('', '..', '').PORT || 3000

export default defineConfig({
  server: {
    // Lets local dev leave VITE_API_BASE empty (relative paths) same as production same-origin
    // hosting - `vite dev` runs on its own port (5173) separate from the Express API (3000), so
    // without this, relative /api/* requests would hit Vite's dev server instead of server.js.
    // Port comes from apiPort above.
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // API calls (and Supabase auth, which goes to a different origin anyway) must never
      // be precached/intercepted - this app is useless offline, the service worker here
      // exists purely to satisfy Chrome/Android's "active fetch handler" installability check.
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        name: 'Overwatch - GrubWatch Food & Nutrition Analysis',
        short_name: 'GrubWatch',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#800080',
        icons: [
          { src: '/overwatch-images/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/overwatch-images/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/overwatch-images/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
})
