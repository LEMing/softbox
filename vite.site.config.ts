import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Builds the playground site (index.html + src/main.tsx) as a regular app —
// everything bundled, served from GitHub Pages under /ThreeDViewer/. The
// library build stays in vite.config.ts; `npm run dev` serves this same app.
export default defineConfig({
  plugins: [react()],
  base: '/ThreeDViewer/',
  build: {
    outDir: 'site-dist',
  },
})
