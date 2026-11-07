import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Builds the playground site (index.html + src/main.tsx) as a regular app —
// everything bundled, served from GitHub Pages under /softbox/. The
// library build stays in vite.config.ts; `npm run dev` serves this same app.
export default defineConfig({
  plugins: [tailwindcss(), react()],
  base: '/softbox/',
  build: {
    outDir: 'site-dist',
  },
})
