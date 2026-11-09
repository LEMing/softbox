import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import dts from 'unplugin-dts/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/__mocks__/**/*'],
      bundleTypes: true,
    }),
  ],
  server: {
    watch: {
      ignored: ['!**/*.ts', '!**/*.tsx'],
    },
  },
  build: {
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => (format === 'es' ? 'simple-viewer.es.js' : 'simple-viewer.cjs')
    },
    rollupOptions: {
      external: [
        /^react(\/.*)?$/,
        /^react-dom(\/.*)?$/,
        'three',
        /^three\/examples\/jsm\/loaders\/(DRACOLoader|KTX2Loader)\.js$/,
        /^three\/examples\/jsm\/libs\/meshopt_decoder\.module\.js$/,
      ]
    }
  }
})
