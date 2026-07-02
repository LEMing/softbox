Changelog
=========

3.14.0
---

### BVH-accelerated raycasts
* Click picking and hotspot occlusion now run on a **BVH** (three-mesh-bvh): each loaded model gets a bounds tree built once at load time, making raycasts logarithmic instead of linear — a 10-100x speedup on high-poly models. Models passed as raw `THREE.Object3D` get their BVH lazily on the first pick (occlusion for such models accelerates after that first pick). Both raycast sites use `firstHitOnly`, and `raycast` is patched **per mesh instance**, never on shared three.js prototypes — the consumer's own objects are untouched. Skinned, morph-target, instanced and batched meshes are excluded (they keep their stock, semantics-correct raycast). The BVH is released with the model's geometry on disposal.
* New **`selection`** option: `selection: { bvh: false }` skips the build everywhere — load time and the lazy first-pick path (~25% extra geometry memory; the build also sorts each geometry's index in place, which is invisible to rendering but matters if you rely on triangle order). Changing it rebuilds the viewer.

3.13.1
---

### Playground site demos the new APIs
* **Click the model to pin a hotspot** — the site now listens to `object:selected` and drops a numbered `<Hotspot occlude>` pin at the hit point; click a pin to remove it, switch models to clear them.
* **Download still** button (bottom-right) — grabs a 1920px PNG through `handle.captureStill()` and downloads it. No library code changes.

3.13.0
---

### Hotspot annotations + click selection
* Added the **`<Hotspot position={[x,y,z]}>`** component: render it as a child of `SimpleViewer` to pin DOM content (your own JSX, or a built-in dot pin) to a world-space point of the scene. The anchor is projected through the camera after every rendered frame, so it tracks orbiting, zooming and resizes with no per-frame React re-renders. Anchors behind the camera are hidden; opt-in **`occlude`** also hides a hotspot when the model covers its anchor.
* Revived the **`object:selected`** event — it was declared in the event map but nothing ever emitted it. A click on the loaded model (drags are ignored via a 5px threshold) now raycasts and emits `{ object, point }` on both the core and public buses; `point` is the world-space hit, ready to feed straight into a `<Hotspot>`. Clicks on empty space emit nothing.
* New engine-agnostic `ISelectionService` + `ThreeSelectionService` (Raycaster) following the existing service pattern; `ViewerCore.getModel()` exposes the loaded model. `SimpleViewer` now accepts `children`, rendered as overlays inside the viewer container.

3.12.0
---

### One-line photoreal mode + programmatic stills
* Added the **`pathTraced`** prop — `<SimpleViewer object={url} pathTraced />` turns on progressive path tracing in one word (shorthand for `options.pathTracing.enabled = true`). It composes with a partial `options.pathTracing` (your tuning fields are kept, the default tuning fills the rest); an explicit `options.pathTracing.enabled` wins. Path tracing remains a construction-time render mode.
* Added **`handle.captureStill({ width?, height? })`** on the imperative ref: returns a PNG **data URL** of the current scene. In raster mode it renders one fresh frame at the exact requested pixel size (the drawing buffer is temporarily resized with pixel ratio 1, the camera aspect follows, and everything is restored in the same task — nothing flickers on screen); omitting a dimension keeps the canvas aspect, omitting both captures at the canvas drawing-buffer size. In **path-traced** mode it waits for the accumulation to finish (only while the tracer is actively accumulating — a completed, failed or reset tracer captures the canvas as it stands instead of waiting forever) and never dangles: disposing the viewer or a model error settles the promise with an error. Explicit `width`/`height` in path-traced mode are rejected rather than silently downgraded to a non-path-traced render. Captures also wait for any in-flight model load, so you never photograph the previous scene.
* New `IRenderer.getPixelRatio()` on the core renderer interface; `CaptureStillOptions` exported from the package root.

3.11.1
---

### Playground site
* Added the public playground site at **https://leming.github.io/ThreeDViewer/** — a full-viewport live viewer with sample models, window-level **drag & drop** of your own `.glb`/`.gltf`, the built-in preset picker, and copyable install/usage snippets. The site is the dev harness (`npm run dev`) built as an app (`npm run build:site`) and deployed to GitHub Pages on every push to `main`; it consumes the library from source, so it always demos the latest `main`.
* `package.json` now points `homepage` at the site. No library code changes.

3.11.0
---

### Built-in preset picker (opt-in)
* Added an opt-in **preset picker** rendered by the library itself: `options.ui = { presets: true }` shows a row of curated chips (`studio | product | neutral | dark | outdoor`) floating bottom-center over the canvas. Picking a chip switches the visual preset **live** — same runtime path as the `preset` prop, so no rebuild and no model reload. Off by default; consumers who render their own chrome see no change.
* A picked preset overrides the consumer's `preset` prop/option until the consumer changes theirs — an updated `preset` from props always wins. `ui.onPresetChange` reports picks (e.g. to persist the choice). With no preset set, the `studio` chip shows as active, since the defaults are the studio look.
* New `UIOptions` type (`options.ui`) reserved for built-in UI chrome; UI-only, so toggling it never rebuilds the viewer. The dev harness now dogfoods the built-in picker instead of its own preset row.

3.10.0
---

### Reflective floor with a contact shadow, by default
* The default floor is now the **glossy glass grid** (`helpers.grid.type: 'hexagonal_glass'`) instead of the wireframe. The model sits on it (floor alignment already put the model's base at `y=0`), the tiles reflect the environment, and a new **transparent shadow-catcher** renders the model's contact shadow — so floor, reflection and shadow all read together out of the box. Set `helpers.grid.type` back to `'hexagonal_wire'` (or `'square_wire'` / `'stone_tiles'`, or disable the grid) to change it.
* The glass tiles are transmissive, so a cast shadow barely registered on them before; the glass grid now adds a `ShadowMaterial` disc at floor level that catches the shadow clearly while staying invisible everywhere else.

3.9.0
---

### Fix the over-lit default (double lighting)
* Rebalanced the default lighting so models are no longer blown out. When the polyhaven HDRI was dropped for the procedural studio environment (3.7.0), the explicit lights were left at their old, HDRI-compensating strengths — so the bright RoomEnvironment (image-based lighting) plus a full ambient/hemisphere/directional rig plus `toneMappingExposure: 1.5` **double-lit** every scene into a washed-out overexposure. The studio environment is now treated as the primary light source and the explicit lights as subtle accents: `toneMappingExposure` `1.5 → 1.1`, `environment.environmentIntensity` `1.0 → 0.7`, ambient `π → 0.3`, hemisphere `1.0 → 0.3`, directional key `π → 2.0`.

### Presets apply live — switching one no longer breaks the scene
* **Fixed:** switching a preset used to rebuild the whole viewer (preset was a *structural* option), which tore down the WebGL renderer, dropped the model and re-framed the camera onto the empty grid. Presets are now **runtime-only**: each sets just the background color, tone-mapping exposure and environment intensity, applied live via `updateOptions` — so switching `studio` → `dark` → `product` updates the look instantly with **no rebuild and no model reload**. Added engine-agnostic live setters (`IRenderer.setToneMappingExposure`, `IScene.setEnvironmentIntensity`) and taught `updateOptions` to apply them; preset exposures/intensities are rebased onto the balanced lighting baseline above.
* The preset set is now `studio | product | neutral | dark | outdoor` (all live-switchable). `photoreal` was removed as a preset — path tracing is a construction-time render mode (`pathTracing.enabled`), not a look you flip between at runtime.

3.8.0
---

### Perfect first paint — one-word visual presets
* Added a **`preset`** prop (and `options.preset`) that sets a cohesive lighting / environment / tone-mapping / background *look* in one word, so a model looks intentional on first paint with zero manual tuning: **`studio`** (clean neutral backdrop — the balanced default), **`product`** (bright high-key white for e-commerce hero shots), **`neutral`** (flat, accurate inspection), **`dark`** (dramatic dark backdrop), **`outdoor`** (daylight-leaning sky tint), and **`photoreal`** (a path-traced still). Usage: `<SimpleViewer object={url} preset="product" />`.
* A preset is **deep-merged over the defaults**, so it only adjusts the fields that define its look and inherits everything else — camera auto-framing (`camera.autoFitToObject`, already on), controls, grid. Any explicit option you pass still wins over the preset. Combined with the procedural studio environment (3.7.0) and auto-framing, the default output is premium with no configuration.
* Exported `ViewerPreset` (the union), `VIEWER_PRESETS` (the preset table) and `resolvePreset()` for inspection/composition, plus a reusable `deepMerge` behavior behind the layering. Changing the preset rebuilds the viewer (it is a structural option); it is not swallowed by the runtime-options fast path.

3.7.0
---

### No network for the default look — and the background color works again
* **Removed the hot-linked polyhaven HDRI** that every viewer fetched on startup. The default environment is now the **procedural studio environment** (`helpers.studioEnvironment`, already on by default): it lights the scene and supplies reflections with **zero network requests** — no CDN dependency, no CORS surface, no "grey scene until the sky downloads." Set `environment.url` to your own HDR/EXR/image to use a custom map.
* **The background color is honored under the studio environment.** Previously the studio environment painted its raw PMREM texture as the background (a washed-out sphere) and swallowed `backgroundColor`. It now lights the scene while the clean `backgroundColor` shows through — so `backgroundColor` (build-time and the live `updateOptions` path) actually takes effect. Dark studio mode still paints its own dark scrim. `applyToScene` gained a `setBackground` flag (default `true`) to express this.

3.6.0
---

### Compressed models load out of the box
* The glTF/GLB loader now wires the **DRACO**, **KTX2/Basis** and **Meshopt** decoders, so compressed assets exported by Blender, `gltfpack`, `gltf-transform`, etc. load with no extra setup — previously they failed. Configure via the new `loaders` option (`{ draco?, ktx2?, meshopt?, dracoDecoderPath?, ktx2TranscoderPath? }`): every decoder is on by default; set one to `false` to skip it, or point `dracoDecoderPath` / `ktx2TranscoderPath` at a self-hosted copy for a fully offline setup. The DRACO/KTX2 WebAssembly is fetched on demand from a jsDelivr URL pinned to the installed Three.js revision; Meshopt needs no external file. `KTX2Loader` also detects the GPU's supported texture formats via the renderer. The new `LoaderOptions` type is exported.

### No bundle-size cost
* The decoders are **imported lazily on the first model load and externalized from the build**, so the base bundle is unchanged (~147 kB gzip, vs. ~1 MB if they were bundled eagerly — each decoder embeds a multi-megabyte WebAssembly blob that Vite would inline as base64). Lazy `import()` also means the library still works when consumed from CommonJS, where a static import of these ESM-only add-ons would throw. The DRACO/KTX2 worker pools are terminated on viewer disposal.

3.5.0
---

### Compatibility (wider reach)
* **React 18 is now supported.** The `react` / `react-dom` peer ranges widened from `^19.0.0` to `>=18.0.0 <20.0.0`. The library only uses React APIs present in both majors (standard hooks + `forwardRef` / `useImperativeHandle`), the bundled `threedgizmo` likewise uses standard hooks only, and the full test suite passes under React 18.3.1. This unblocks the large share of apps still on React 18 that previously could not install the package at all.
* **Three.js r184 / r185 are now supported.** The `three` peer range widened from `>=0.177.0 <0.184.0` to `>=0.177.0 <0.186.0`, and the dev/build toolchain (`three`, `@types/three`) moved to r185. Typecheck and the full suite pass against r185; all bundled three add-ons (`three-gpu-pathtracer`, `three-mesh-bvh`) resolve cleanly on the wider range.

### Release hygiene
* Bumped to `3.5.0` to re-align the published version. Versions 3.1–3.4 were developed but never published to the registry (which was stuck at `3.0.1`); 3.5.0 is the first release to carry all of that work — the loading overlay (3.3.0), console-warning fixes (3.3.1), the NaN-bounding-sphere fix (3.3.2), and the compatibility widening above — to npm in one clean, correctly-labeled version.

3.3.2
---

### Bug fixes
* Fixed `THREE.BufferGeometry.computeBoundingSphere(): Computed radius is NaN` (model-size-dependent). The dynamic grid gives small objects a single-hex layout (`hexRadius: 0` / `divisions: 1`), and `HexagonalWireGrid` then divided the grid size by `radius * 2 === 0`, producing `Infinity`/`NaN` hex vertex positions. The divisor is now floored at 1 (`StoneTileGrid` divisor likewise), and `addDynamicGrid` skips grid creation entirely for an empty or non-finite bounding box.

3.3.1
---

### Console hygiene
* Stopped the per-frame `THREE.WebGLShadowMap: PCFSoftShadowMap has been deprecated` warning: three r183+ deprecated `PCFSoftShadowMap` and silently falls back to `PCFShadowMap`, so the default `shadowMapType` is now `1` (`PCFShadowMap`) — the value three already used, so shadows render identically, just without the warning. (Set `renderer.shadowMapType` explicitly if you want a different mode.)
* `ViewerCore.resize()` is now a no-op after dispose. A queued resize (resize `requestAnimationFrame` / `ResizeObserver`) could fire after teardown — notably the React StrictMode unmount→remount in dev — and render against a disposed renderer, producing `GL_INVALID_VALUE: glGetProgramiv: Program object expected` errors. It now bails when disposed.

3.3.0
---

### Loading UX
* Added a **built-in loading overlay**. Previously, while a model was being fetched/parsed the scene was just blank with no feedback. `SimpleViewer` now shows a spinner (and an error state if loading fails) from the moment a model is provided until it is on screen. Configure via the new `loadingIndicator` option: `true`/omitted shows the default overlay, `false` disables it (render your own from the loading events), or pass `{ enabled?, label?, errorLabel?, color?, backdrop? }` to customize. The overlay is UI-only and non-interactive (`pointer-events: none`); changing the option never rebuilds the viewer. The default scrim is tuned to keep the spinner legible on both light and dark backgrounds, and the spinner honors `prefers-reduced-motion`.
* `model:loading` is now actually emitted (with `{ url }`) at the start of a URL load **and forwarded to the public viewer-handle events** — previously only `model:loaded` / `model:error` fired, so consumers (including the "roll your own" path) had no "load started" signal. The new `LoadingIndicatorOptions` type is exported.
* `ViewerCore.loadModel()` now **serializes** calls: changing `object` faster than a load resolves no longer rejects the second load as `INVALID_STATE` and silently drops it — loads queue and the latest wins. `SimpleViewer` also guards against a superseded load writing stale overlay state.

3.2.0
---

### Tooling & cleanup
* Removed the dead `MemoryMonitor` — every logging branch was an empty no-op, and it was still wired into `ResourceManager.disposeSceneResources()` including a pointless `setTimeout(…, 2000)` that scheduled another no-op on every screenshot disposal. Deleted the class and its three call sites + timer.
* `disposeSceneContents` now clears the scene's `__originalEnvironmentTexture` back-reference (used by the path tracer) when freeing the background/environment, so it can no longer point at a just-disposed texture.
* Added **`eslint-plugin-react-hooks`** to the lint gate (`rules-of-hooks: error`, `exhaustive-deps: warn`, enforced at `--max-warnings 0`). The handful of intentional partial dependency arrays (the structural-vs-runtime options split, ref-accessed event handlers, content-hash keys) are now documented with justified inline disables; future accidental missing deps are caught.

### Internal architecture
* Began decomposing the `ViewerCore` god class: extracted the scene-dressing logic (helpers, lighting, background, and environment-map/studio setup) out of the ~214-line `initialize()` into a focused, engine-agnostic `SceneConfigurator` collaborator. `ViewerCore` drops from 813 to 716 lines and `initialize()` is now a slim orchestration; the per-`await` disposal guards are preserved via an `isDisposed` callback (behavior-identical). Added dedicated `SceneConfigurator` tests.
* De-duplicated the two hand-synced `ViewerEventMap` interfaces (the engine-agnostic core map and the public Three.js-typed map) into a single generic `ViewerEventMap<TObject, TCamera, TControls, THandle>` in the shared events kernel. Core instantiates it with its interfaces, the public surface with concrete Three.js types — one source of truth, so the two can no longer drift. No change to the public event type's resolved shape.

### Resource management (GPU bug fix)
* Fixed a **use-after-dispose + leak** in `StoneTileGrid`. `GridFactory` holds grid styles as static singletons, and `StoneTileGrid` cached loaded textures across every grid it ever built. Because the canonical scene disposal frees the textures attached to a grid's material on teardown, the singleton then handed those **already-disposed** textures to the next stone-tile grid (a GPU use-after-dispose), while the cache itself was never cleared (`GridFactory.disposeGridStyle` is never called) — an unbounded leak. `StoneTileGrid` is now stateless like the other grid styles: each grid loads and owns its textures, which are freed exactly once by scene teardown. Added the first tests for the grids module.

3.1.0
---

### Resource management (GPU bug fixes)
* Fixed a dispose-after-use on the **default** screenshot path: `ResourceManager.disposeSceneResources()` no longer disposes the environment service. Its PMREM textures are still referenced by `scene.background` / `scene.environment` (kept alive for restore via `keepBackgrounds`), and `restoreFromScreenshot` does not re-apply the environment — freeing them when the screenshot was captured left **broken reflections and a blank backdrop** once the user dismissed a path-traced screenshot (`replaceWithScreenshotOnComplete: true` + `environment.url`). Environment textures are now released exactly once, at full teardown (`dispose()`).

### React integration (performance)
* Stopped a per-frame React re-render: `useViewerCore` no longer subscribes the render loop's `onStateChange` into a `setState`. The render loop calls `updateRenderInfo()` every frame, so on non-static scenes this forced the `SimpleViewer` subtree to re-render up to ~60×/sec for a `state` value no consumer read. The reactive `state` (unused) was removed from the hook's return; per-frame render info remains available imperatively via `ViewerCore.getState()`.
* Added the first behavioral tests for the hook layer (previously untested): the no-per-frame-subscription guarantee, plus the v3 **structural-vs-runtime options split** — a `backgroundColor` change applies via `updateOptions()` without rebuilding the viewer, while a structural change (e.g. `camera.fov`) disposes and recreates it.

### Lifecycle correctness
* `ViewerCore.initialize()` now bails out after each `await` (environment service init, environment-map load, path-tracer init) if the viewer was disposed in the meantime. A StrictMode unmount or a structural-option rebuild can call `dispose()` while initialization is still in flight; previously the resumed continuation re-populated freed textures and attached resources to an orphaned scene/disposed renderer (a bounded leak). This was the only unguarded async path in the engine-agnostic core.

### Tooling
* Added enforced **coverage thresholds** (`coverageThreshold` in `jest.config.js`), so the CI `Test` step now fails on coverage regressions instead of merely collecting an unused report. Global floors lock in the current numbers; per-path floors pin the refactor-sensitive core high (`src/core/managers/` ≥95%, `src/core/ViewerCore.ts` ≥92%, `src/infrastructure/three/disposal.ts` 100%). A `text-summary` reporter now prints the totals in the CI log. Ratchet upward over time toward the 80% target.

### Clean architecture (DOM out of the path tracer)
* Removed the DOM `<img>` overlay management from `ThreePathTracingService` and the three DOM-leaked methods (`getPausedFrameBase64`, `hasImageOverlay`, `removeImageOverlay`) from the core `IPathTracingService` interface — the last clean-architecture violation, where a pixel-computing infrastructure service manipulated DOM elements and exposed them through a core contract. The service now only presents the final frame on the canvas and emits `pathtracing:paused`; the path-traced result is shown by `ScreenshotManager` (when `replaceWithScreenshotOnComplete`) or by the preserved canvas buffer. `getPausedFrameBase64` was already dead public API. Net −184 lines.
* `ViewerFactory` now also forces `preserveDrawingBuffer` when path tracing is enabled (not only for screenshot-on-complete), so the final path-traced frame reliably persists on the canvas after the loop stops now that the stable `<img>` overlay is gone.
* `ViewerCore.resize()` no longer reaches into the path-tracing service's overlay state; it restarts accumulation off the existing `pathTracingCompleteHandled` flag.

3.0.1
---

### Documentation
* Added an **"Upgrading from 2.x to 3.0"** section to the README and a `MIGRATION_GUIDE.md` — the npm page was missing migration notes and the removal of `options.refs` / the unimplemented handle methods
* Synced `package-lock.json` to keep `three-gpu-pathtracer` / `threedgizmo` in devDependencies (they are bundled, not runtime deps)

3.0.0
---

### Cleanup & React polish
* Decomposed `ThreePathTracingService.render()` — the disabled-render, single-sample accumulation, and completion-capture blocks are now focused private methods (`renderWhileDisabled`/`accumulateOneSample`/`captureCompletedFrame`); verified behaviour-preserving via unit tests and a live path-traced render
* Extracted the path-tracing completion logic out of the render-loop callback into `handlePathTracingComplete()`, and hoisted the duplicated default sample count into a named constant
* Removed dead code: `OptionsValidator`, `HexGrid`, `PerformanceMonitor`, `ExtendedTypes`, unused barrel files, and the unused `useViewerEvents`/`useViewerStatus` hooks
* Dropped redundant devDependencies (`@types/lodash`, `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` — provided by `typescript-eslint`)
* Memoized the `ViewerContext` value, added a reset action to `ViewerErrorBoundary`, and removed the side-effecting `useMemo` ref writes in `SimpleViewer`/`useStableOptions`

### Architecture guardrails
* Added GitHub Actions CI running lint, type check, tests and build on every push/PR
* Added an ESLint clean-architecture boundary: `src/core` can no longer import `three`, `three-gpu-pathtracer`, or anything from `infrastructure`/`presentation`
* Removed the last `core -> infrastructure` import in `ViewerCore` (now uses the engine-agnostic `hasInternalRenderer` guard)
* Added `typecheck` and `knip` npm scripts; `knip` is a **blocking** CI gate (zero dead files/exports/deps)

### Resource management (GPU memory leak fixes)
* Unified all teardown through a single Three.js disposal utility that frees geometries, materials, **the textures a material references**, light shadow maps, and scene background/environment textures
* `ResourceManager.dispose()` now releases the whole scene graph (grid, gradient background, axes, shadow maps) instead of only detaching children — fixes an unbounded GPU leak on unmount and on option-change rebuilds
* The dynamic grid is now disposed before being replaced on every model swap
* Model material textures are now disposed on swap/unmount

### Runtime options (no more full rebuild on every change)
* Added `ViewerCore.updateOptions(partial)` to apply runtime-tunable options to a live viewer
* Options are now split into a structural set (rebuilds the viewer) and a runtime set; changing the background color no longer tears down the WebGLRenderer or re-fetches the model
* `createGradientBackground` disposes the previous background texture before applying a new one (leak-safe runtime updates)
* `useStableOptions` now returns `{ options, structuralKey, runtimeKey }` (**breaking** for direct consumers of this internal hook) and no longer writes a ref inside `useMemo`

### Screenshot capture
* `preserveDrawingBuffer` is forced on automatically when `replaceWithScreenshotOnComplete` is enabled, so the captured frame is no longer blank
* Capture now validates the result before hiding the canvas and disposing scene resources

### Public contract & boundaries
* `ViewerCore` now exposes `getRenderer()/getScene()/getCamera()/getControls()/requestRender()`; the React layer uses these instead of reaching into private fields via reflective casts
* `SimpleViewerHandle` moved to a dedicated type module (`types/SimpleViewerHandle`), breaking the `events -> component` dependency cycle
* `SimpleViewerHandle` is now honest: `loadModel` and `dispose` are implemented; the previously-advertised-but-unimplemented `startRendering`/`stopRendering`/`captureScreenshot` were removed (**breaking**)
* `index.ts` now exports the option sub-types, the `ControlType` enum, and `ThreeViewerError`/`ErrorCode`/`ErrorContext`

### Packaging
* Added a `types` condition (and a `./package.json` export) to the `exports` map so types resolve under `node16`/`nodenext`/`bundler` module resolution
* Ship **ESM + CJS** instead of ESM + UMD. The CJS bundle uses a `.cjs` extension so Node loads it as CommonJS under `"type": "module"` (a `.js` bundle was parsed as ESM, so `require()` saw no exports)
* Externalize the `three` CORE and React only; Three.js addons (`examples/jsm/*`), `three-gpu-pathtracer` and `threedgizmo` are bundled — three's exports map can't resolve extensionless addon subpaths and they have no UMD global, so externalizing them broke both entrypoints. Bundled addons still import the consumer's `three`, so there's no duplicate core.
* `defaultOptions` no longer reads `window` at module load (SSR/Node-import safe)
* Bundle declarations into a single `dist/index.d.ts` (`rollupTypes`) and remove the `three` resolve-alias, so published types resolve under `nodenext`/`bundler`: no extensionless relative imports (was TS2834) and no leaked `node_modules/three/...` paths (was TS2307)
* Removed the dead `refs`/`ThreeJSRefs` option, which was the only thing exposing concrete `OrbitControls`/`MapControls` addon types in the public surface
* Added consumer smoke tests wired into CI: `npm run smoke` (loads the built ESM + CJS entrypoints) and `npm run type-smoke` (type-checks a consumer against the published types under `nodenext` and `bundler`)
* Capped the `three` peer range to the tested window (`>=0.177.0 <0.184.0`)
* Raised `engines.node` to `>=18`

### Examples & docs
* Replaced the outdated `v2-patterns` examples (which used a props API that never existed and imported non-existent subpaths) with an accurate `examples/basic-usage.tsx`, type-checked in CI (`npm run typecheck:examples`) so examples can't silently rot

2.6.1
---
* Fix Texture type casts for Three.js r183

2.6.0
---

### Dependency Updates
* **Updated threedgizmo**: Upgraded from 1.1.0 to 1.2.0

### React 19 Support
* Updated `peerDependencies` for `react` and `react-dom` to `^19.0.0`
* Updated `@types/react` and `@types/react-dom` to `^19.0.0`
* Updated `@testing-library/react` to `^16.1.0` for React 19 compatibility
* Updated `RefObject<T>` to `RefObject<T | null>` for React 19 mutable ref semantics
* Updated `vite.config.ts` external react entries for build

2.5.0
---

### Dependency Updates
* **Updated Three.js**: Upgraded `three` from 0.168.0 to 0.177.0 (peerDependency)
* **Updated @types/three**: Upgraded from 0.168.0 to 0.177.0 (devDependency)
* **Updated threedgizmo**: Upgraded from ^0.6.0 to ^1.1.0 (dependency)

2.4.3
---

### Security Updates
* **Fixed npm vulnerabilities**: Updated dependencies to resolve 1 critical vulnerability
  - Added 12 packages and updated 1 package
  - All security vulnerabilities resolved

2.4.2
---

### Improvements
* **Removed console logging**: Cleaned up console output by removing debug logs
  - Removed memory monitoring logs for cleaner production output
  - Removed render loop state change logs
  - Removed environment service texture loading logs
  - Removed model loading progress logs
  - Removed renderer initialization logs
  - Removed scene setup debug logs
  - Removed viewer core initialization logs
* **Default options updates**: 
  - Changed default camera FOV from 75 to 45 for better perspective
  - Added default environment map URL for better initial lighting
  - Adjusted environment blur from 0.5 to 0.15 for sharper reflections

2.4.1
---

### Improvements
* **Removed crypto dependency**: Replaced native crypto.randomUUID() with custom UUID implementation
  - Eliminates external dependency for better compatibility
  - Uses template-based approach for cleaner code
  - Added comprehensive tests for UUID generation
  - Note: Uses Math.random() which is suitable for internal IDs but not cryptographically secure

2.4.0
---

### Architecture Improvements
* **Refactored ViewerCore**: Split monolithic ViewerCore into focused manager classes
  - `ModelManager`: Handles model loading and manipulation
  - `StateManager`: Manages viewer state and updates
  - `ResourceManager`: Manages resource disposal and memory
  - `ScreenshotManager`: Handles screenshot functionality
* **Improved Separation of Concerns**: Each manager has a single responsibility
* **Better Testability**: Comprehensive test coverage for all manager classes

### New Features
* **Dark Studio Mode**: Added new dark studio environment option
  - Creates a professional dark backdrop for better model visibility
  - Configurable through environment settings

### Code Quality
* **Linting Enforcement**: Added strict linting requirements to development workflow
  - All code must pass ESLint with zero warnings
  - Fixed all existing linting errors across the codebase
* **Test Coverage**: Added comprehensive tests for all manager classes
  - Achieved high test coverage for new code
  - Mocked external dependencies for better test isolation

### Developer Experience
* **Updated CLAUDE.md**: Enhanced development guide with mandatory linting requirements
* **Clean Test Output**: Mocked console.error in tests for cleaner test output

2.3.0
---

### New Features
* **Customizable Grid Styles**: Added GridFactory pattern to support multiple grid rendering styles
  - Square wire grid: Traditional wireframe grid
  - Hexagonal wire grid: Wireframe hexagonal pattern
  - Hexagonal glass grid: Translucent glass-like hexagonal tiles
  - Stone tiles grid: Textured stone tile grid with material properties
* **Enhanced Grid Configuration**: Grid helper now accepts detailed configuration options
  - Type selection for different grid styles
  - Opacity control for translucent grids
  - Material properties (metalness, roughness, transmission)
  - Texture support (diffuse, normal, roughness maps)
  - Geometry customization (height, bevel, randomization)
* **Default Grid Creation**: Added support for creating default grids on initialization
  - Configurable size and divisions
  - Automatic grid type selection based on options

### Technical Improvements
* **Grid Architecture**: Implemented extensible grid system
  - `IGridStyle` interface for custom grid implementations
  - `GridFactory` for creating different grid types
  - Separated grid styles into dedicated classes
* **Backward Compatibility**: Maintained compatibility with existing boolean grid options
  - Legacy `grid: true` still works as before
  - New object-based configuration is optional

2.2.0
---

### Bug Fixes
* **Environment Blur**: Fixed environment blur settings not being applied correctly

2.1.0
---

### Architecture Changes
* **Clean Architecture Implementation**: Complete restructuring following clean architecture principles
  - Core layer: Business logic and interfaces (framework-agnostic)
  - Infrastructure layer: Three.js implementations and adapters
  - Presentation layer: React components and hooks
* **Functional Components**: Migrated from class-based to functional React components with hooks
* **Dependency Inversion**: All dependencies flow inward, core doesn't depend on infrastructure

### New Features
* **Type Safety**: Enforced strict TypeScript with no 'any' types allowed
  - Created comprehensive type definitions and interfaces
  - Type guards for runtime type checking
  - Result pattern for error handling throughout
* **Modular Architecture**: 
  - Separated concerns into focused modules
  - Adapter pattern for Three.js integration
  - Service interfaces for extensibility
* **Improved Testing**: 
  - Better test isolation with clean architecture
  - Mock implementations for all external dependencies
  - Maintained 86%+ test coverage

### Internal API Changes (No public API changes)
* **Component Structure**: 
  - `SimpleViewer` now uses functional component architecture
  - New hooks: `useViewerCore`, `useViewerEvents`, `useViewerState`
  - Context-based state management
* **Service Interfaces**:
  - `IPathTracingService`: Abstracted path tracing functionality
  - `IEnvironmentService`: Environment map management
  - `ISceneSetupService`: Scene configuration and helpers
* **Factory Pattern**: `ViewerFactory` for creating viewer instances with proper dependency injection

### Removed
* Legacy class-based components and managers
* Direct Three.js dependencies in core business logic
* Deprecated utilities and option mappers
* `Resizer.ts`, `loadModel.ts`, and other standalone utilities

### Technical Improvements
* **ESLint Configuration**: Migrated to ESLint v9 flat config format
* **Type Definitions**: Comprehensive TypeScript types with no implicit 'any'
* **Error Handling**: Consistent Result<T> pattern throughout the codebase
* **Code Organization**: Clear separation between layers with explicit boundaries

2.0.0
---
**Breaking Changes** — see the notes below for upgrade instructions

### New Features
* **Event System**: Introduced event-driven architecture with typed events
  - `model:loaded`, `model:error`, `render:complete`, `controls:change`, `error` events
  - Replace callback-based API with EventEmitter pattern
* **Error Handling**: Implemented Result pattern for all manager methods
  - No more throwing errors - all operations return `Result<T, E>`
  - Enhanced error context with `ThreeViewerError` class and error codes
* **TypeScript Improvements**: 
  - Modular option interfaces for better type safety
  - New types: `Result<T>`, `ViewerEventMap`, `ErrorCode`
* **Configuration Validation**: Comprehensive validation for all options with helpful error messages
* **Test Coverage**: Achieved 86%+ test coverage across all modules

### Configuration Changes
* **Nested Structure**: Migrated from flat to nested configuration
  - Camera options: `cameraFov` → `camera.fov`, `cameraPosition` → `camera.position`
  - Render options: `antialias` → `render.antialias`, `shadowMap` → `render.shadowMap`
  - Control options: `enableDamping` → `controls.enableDamping`
  - Helper options: `axes` → `helpers.axes`, `grid` → `helpers.grid`
  - Lighting: `lightning` → `lighting` (fixed typo)
  - Path tracing: `pathTracingSettings` → `pathTracing`
  - Environment: `envMapUrl` → `environment.url`

### API Changes
* `SimpleViewerHandle` now includes `events` property
* Manager methods return `Result<T>` instead of throwing
* Async initialization for PathTracingManager and EnvironmentMapManager

### Security
* Updated vite from 5.4.1 to 6.3.5 to fix esbuild vulnerability (GHSA-67mh-4wv8-2f99)

### Deprecations
* Flat configuration properties (will be removed in v3.0)
* Callback-based event handlers (`onLoad`, `onError`, etc.)

0.11.0
---
* Add blur env map
* Use new threedgizmo 0.6.0

0.10.0
---
* Make light optional
* Use threedgizmo 0.2.1

0.9.1
---
* Fix bug with default static rendering

0.9.0
---
* Add ability to send an url as an input object

0.8.0
---
* Add support for three-gpu-pathtracer rendering
* Add env map support for realistic lighting and reflections

0.7.0
---
* Add studio background

0.6.0
---
* Use threedgizmo 0.2.0

0.5.0
---
Added support for MapControls
Added an optional gizmo controller

0.4.1
---
* Update Readme

0.4.0
---
* Add a fix for options drilling
* Add ability to set external scene, renderer, contols, etc.
* Add support for helpers color options

0.3.1
---
* Added a minor fix for number of frames per second

0.3.0
---
* Added ability to pass external animation func

0.2.0
---
* Added ability to set custom options for the viewer

0.1.0
---
* Added auto aligner and resizer
* Added a bunch of performance improvements

0.0.0
---
* Initial Release
