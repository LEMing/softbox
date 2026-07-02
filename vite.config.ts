import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src/**/*.ts', 'src/**/*.tsx'],
      exclude: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'src/__mocks__/**/*'],
      insertTypesEntry: true,
      // Bundle all declarations into a single dist/index.d.ts. This removes the
      // extensionless relative imports that break `moduleResolution: nodenext`
      // (TS2834) and keeps only bare external imports (three, react).
      rollupTypes: true,
    }),
  ],
  server: {
    watch: {
      ignored: ['!**/*.ts', '!**/*.tsx'],
    },
  },
  build: {
    // public/ holds site assets (og-image); they must not ship in the library.
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      // ESM + CJS (not UMD): consumers use bundlers or Node `require`, never a
      // `<script>` global — and UMD cannot expose Three.js addons / the path
      // tracer as `THREE.*` globals anyway.
      formats: ['es', 'cjs'],
      // The package is "type": "module", so the CJS bundle must use a `.cjs`
      // extension to be parsed as CommonJS by Node (a `.js` file would be loaded
      // as ESM and `require()` would see no exports).
      fileName: (format) => (format === 'es' ? 'simple-viewer.es.js' : 'simple-viewer.cjs')
    },
    rollupOptions: {
      // Externalize the `three` CORE and React so the consumer's single copy is
      // used. Most Three.js addons (examples/jsm/*), three-gpu-pathtracer and
      // threedgizmo are BUNDLED — three's exports map does not resolve
      // extensionless addon subpaths, so externalizing them would break the
      // entrypoints. The bundled addons still import the external `three` core,
      // so there is no duplicate core copy.
      //
      // The compression decoders are the exception: they are imported lazily
      // with explicit `.js` specifiers (which DO resolve through three's exports
      // map) and externalized, because each embeds a multi-megabyte WebAssembly
      // blob that Vite would otherwise inline as base64 into every consumer's
      // bundle. Externalized, they load on demand from the consumer's own three.
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
