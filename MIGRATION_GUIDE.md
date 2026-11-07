# Migration Guide

## 3.x → 4.0.0 — package renamed to `softbox`

4.0.0 is identical to 3.20.0 except for the package name — `threedviewer` is now
**`softbox`** — and the repository/site URLs that moved with it. There are no API
changes.

```bash
npm uninstall threedviewer
npm install softbox
```

Then update the import specifier everywhere:

```diff
-import { SimpleViewer } from 'threedviewer';
+import { SimpleViewer } from 'softbox';
```

The old `threedviewer` package is deprecated on npm with a pointer to `softbox`
and receives no further releases. The sections below keep the old name where it
was historically accurate.

## 2.x → 3.0.0

3.0.0 is a breaking release focused on correctness, packaging, and a cleaner public
surface. For most consumers the migration is small: bump peer dependencies and
remove a couple of APIs that were already non-functional.

### 1. Bump requirements

| Dependency | 2.x | 3.0 |
| --- | --- | --- |
| `react` / `react-dom` | `^18` | **`^19`** |
| `three` (peer) | `>=0.177.0` | **`>=0.177.0 <0.184.0`** |
| Node | `>=16` | **`>=18`** |

```bash
npm install threedviewer@^3 react@^19 react-dom@^19 three@^0.183
```

### 2. Remove `options.refs` / `ThreeJSRefs`

The external scene/camera/renderer injection option was **removed**. It was a no-op
in 2.x — the viewer never read it — so removing it does not change runtime behavior.

```diff
 const options: SimpleViewerOptions = {
   ...defaultOptions,
-  refs: {
-    scene: sceneRef,
-    camera: cameraRef,
-    renderer: rendererRef,
-    controls: controlsRef,
-    mountPoint: mountRef,
-  },
 };
```

The `ThreeJSRefs` type export is gone as well.

### 3. Update the imperative handle (`ref`)

`SimpleViewerHandle.startRendering()`, `stopRendering()`, and `captureScreenshot()`
were **removed** — they were declared optional and never implemented (always
`undefined`). `loadModel()` and `dispose()` are now real, implemented methods.

```ts
// Screenshot — read the canvas directly:
const dataUrl = viewerRef.current?.renderer?.domElement.toDataURL('image/png');

// Still available on the handle:
viewerRef.current?.scene;     // THREE.Scene | null
viewerRef.current?.camera;    // THREE.Camera | null
viewerRef.current?.renderer;  // THREE.WebGLRenderer | null
viewerRef.current?.controls;  // ControlsInstance | null
viewerRef.current?.events;    // typed event emitter
await viewerRef.current?.loadModel(url);
viewerRef.current?.dispose();
```

### 4. Import from the package root

`OptionsValidator` was removed, and the unofficial deep import paths
(`threedviewer/validation`, `threedviewer/utils`, `threedviewer/errors`) never
existed as real entry points. Import everything from the root:

```ts
import {
  SimpleViewer,
  defaultOptions,
  ControlType,
  ThreeViewerError,
  ErrorCode,
  type SimpleViewerOptions,
  type SimpleViewerHandle,
  type SimpleViewerProps,
  type ViewerEventMap,
  type ControlsInstance,
} from 'threedviewer';
```

### 5. Packaging: ESM + CJS (no UMD)

The package now ships an ESM build (`import`) and a CommonJS build (`require`)
instead of ESM + UMD. Bundler and Node consumers are unaffected. The only thing
removed is the UMD `<script>` global build (which could not expose the Three.js
addons / path tracer as globals anyway). Published types now resolve correctly
under `moduleResolution: nodenext` and `bundler`.

### Nothing to change if…

…you render `<SimpleViewer object={…} options={…} />` (optionally with `ref`) and
build your options from `defaultOptions`. The option keys (`renderer`,
`lighting.ambientLight` / `hemisphereLight` / `directionalLight`,
`pathTracing.maxSamples`, `helpers.studioEnvironment`, etc.) are unchanged.

### What you get for free in 3.0

- GPU resources (geometries, materials, **textures**, light shadow maps, grids,
  background/environment) are now fully disposed on unmount and model swap — no
  more leaks when remounting the viewer.
- Reliable screenshot capture for `replaceWithScreenshotOnComplete`.
- Changing `backgroundColor` no longer rebuilds the renderer or re-fetches the model.
- SSR/Node-safe import (no `window` access at module load).

See [CHANGELOG.md](https://github.com/LEMing/softbox/blob/main/CHANGELOG.md) for the complete list.
