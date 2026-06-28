import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  resolve: {
    alias: {
      'three': resolve(__dirname, 'node_modules/three')
    }
  },
  plugins: [
    react(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/__mocks__/**/*'],
      insertTypesEntry: true,
    }),
  ],
  server: {
    watch: {
      ignored: ['!**/*.ts', '!**/*.tsx'],
    },
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'SimpleViewer',
      formats: ['es', 'umd'],
      fileName: (format) => `simple-viewer.${format}.js`
    },
    rollupOptions: {
      // Externalize peers and runtime deps (incl. three subpaths/addons) so the
      // consumer's single copy of three is used everywhere — no addon/core skew,
      // no double-shipping of three-gpu-pathtracer / threedgizmo.
      external: [
        /^react(\/.*)?$/,
        /^react-dom(\/.*)?$/,
        /^three(\/.*)?$/,
        'three-gpu-pathtracer',
        'threedgizmo',
      ],
      output: {
        globals: (id: string) => {
          if (id === 'react') return 'React'
          if (id === 'react/jsx-runtime') return 'jsxRuntime'
          if (id === 'react-dom') return 'ReactDOM'
          if (id.startsWith('three-gpu-pathtracer')) return 'ThreeGPUPathTracer'
          if (id.startsWith('threedgizmo')) return 'ThreeDGizmo'
          if (id.startsWith('three')) return 'THREE'
          return id
        }
      }
    }
  }
})
