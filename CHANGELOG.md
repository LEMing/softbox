Changelog
=========

3.2.0
---

### Tooling & cleanup
* Removed the dead `MemoryMonitor` — every logging branch was an empty no-op, and it was still wired into `ResourceManager.disposeSceneResources()` including a pointless `setTimeout(…, 2000)` that scheduled another no-op on every screenshot disposal. Deleted the class and its three call sites + timer.
* `disposeSceneContents` now clears the scene's `__originalEnvironmentTexture` back-reference (used by the path tracer) when freeing the background/environment, so it can no longer point at a just-disposed texture.
* Added **`eslint-plugin-react-hooks`** to the lint gate (`rules-of-hooks: error`, `exhaustive-deps: warn`, enforced at `--max-warnings 0`). The handful of intentional partial dependency arrays (the structural-vs-runtime options split, ref-accessed event handlers, content-hash keys) are now documented with justified inline disables; future accidental missing deps are caught.

### Internal architecture
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
