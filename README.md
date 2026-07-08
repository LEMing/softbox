# softbox

<!-- The size badges are static (bundlephobia/bundlejs both mismeasure this
     dual-chunk package: they bundle `three`, our peer dep, or read the tiny
     re-export entry). Refresh the numbers from our own build after a release
     that changes the bundle:
       npm run build && for f in dist/index-*.js dist/ThreePathTracingService-*.js; do
         b=$(gzip -c "$f" | wc -c); awk -v b="$b" -v n="$f" 'BEGIN{printf "%s %.1f kB gzip\n", n, b/1000}'; done
     index-* = core (badge rounds down to match the README's ~117 kB),
     ThreePathTracingService-* = the lazy path-tracer chunk. -->
[![npm version](https://img.shields.io/npm/v/softbox)](https://www.npmjs.com/package/softbox)
[![core size](https://img.shields.io/badge/core-117%20kB%20gzip-blue)](https://bundlephobia.com/package/softbox)
[![path tracer chunk](https://img.shields.io/badge/%2B%20path%20tracer-51%20kB%20gzip-lightgrey)](https://bundlephobia.com/package/softbox)
[![CI](https://github.com/LEMing/softbox/actions/workflows/ci.yml/badge.svg)](https://github.com/LEMing/softbox/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/LEMing/softbox/blob/main/LICENSE)

**The batteries-included React 3D viewer — any GLB looks studio-shot in one line.**

> Formerly published as [`threedviewer`](https://www.npmjs.com/package/threedviewer) — renamed in 4.0.0, same API. See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md).

```tsx
<SimpleViewer object="/model.glb" />
```

Balanced studio lighting, a real-scale matte concrete floor with a baked soft contact shadow, auto-framing, compressed-asset decoders — all on by default, zero configuration. Lighting needs zero network requests (the studio environment is procedural); the DRACO/KTX2 decoder wasm is fetched only when a model actually uses that compression, from a CDN by default or [self-hosted](#loaders) for offline use. The core is ~117 kB gzip; the path tracer lives in a lazy chunk that loads only when enabled. Every release is gated by 590+ unit tests plus a Playwright suite that asserts **real WebGL pixels** in CI.

[![softbox playground](https://raw.githubusercontent.com/LEMing/softbox/main/public/og-image.png)](https://leming.github.io/softbox/)

**▶ [Live playground](https://leming.github.io/softbox/)** — drag & drop your own `.glb`, switch presets live, click the model to pin hotspots, download a still.

## What you get

- **[Visual presets](#visual-presets)** — `studio · product · neutral · dark · outdoor`, one word, switched live
- **[Turntable](#turntable)** — one-word showcase auto-rotate that pauses while the user drags
- **[Animations](#animations)** — GLTF clips autoplay with one word; play/pause/clip-picker API
- **[Photoreal mode](#photoreal-mode--stills)** — progressive path tracing + `captureStill()` PNG export
- **[Video capture](#video-capture)** — `captureVideo()` records the canvas to WebM/MP4, zero dependencies
- **[Hotspots & click selection](#hotspot-annotations--click-selection)** — DOM pins on world-space points, BVH-accelerated picking
- **Compressed assets** — DRACO, KTX2/Basis and Meshopt decoders wired in, fetched lazily
- **Built-in chrome** — loading overlay, preset picker, viewport gizmo — all optional, all off-or-subtle by default
- **Typed end to end** — every option, event payload and handle method ships TypeScript types

## Install

```bash
npm install softbox
```

Peer dependencies: `react` / `react-dom` `>=18 <20`, `three` `>=0.177 <0.186`.

## Quick start

```tsx
import { SimpleViewer } from 'softbox';

function App() {
  return (
    <div style={{ width: '100%', height: '400px' }}>
      <SimpleViewer object="https://modelviewer.dev/shared-assets/models/RobotExpressive.glb" />
    </div>
  );
}
```

A `THREE.Object3D` works too:

```tsx
<SimpleViewer object={new THREE.Mesh(geometry, material)} />
```

## Visual presets

One word sets a cohesive look — background, tone mapping, environment intensity. Presets switch **live**: no rebuild, no model reload.

```tsx
<SimpleViewer object={url} preset="product" />
// studio | product | neutral | dark | outdoor
```

Let your users switch presets with the built-in picker (off by default):

```tsx
<SimpleViewer object={url} options={{ ui: { presets: true } }} />
```

## Turntable

One word puts the model on a slowly rotating showcase turntable. It pauses while the user drags and resumes on release; toggling is live, like presets.

```tsx
<SimpleViewer object={url} turntable />
// speed: options.controls.autoRotateSpeed (2 ≈ one orbit / 30 s)
```

## Animations

One word plays everything the GLTF carries — all clips, looped, from the moment the model loads.

```tsx
<SimpleViewer object={url} animations />
```

Pick one clip, tune the speed, or build your own play/pause UI via the handle:

```tsx
<SimpleViewer object={url} options={{ animations: { autoplay: 'Walk', speed: 1.5 } }} />

viewerRef.current.getAnimationNames(); // ['Walk', 'Idle', ...]
viewerRef.current.pauseAnimations();
viewerRef.current.playAnimations('Idle');
```

Turntable and animations compose — a spinning, walking robot is two words.

## Photoreal mode & stills

```tsx
<SimpleViewer object={url} pathTraced />
```

`pathTraced` turns on interactive progressive path tracing: the frame converges whenever the camera rests, and orbiting shows plain raster frames until the camera settles again — then a fresh accumulation starts from the new viewpoint. It works with every preset, including the default procedural studio. Capture a PNG programmatically — in raster mode at any resolution, in path-traced mode once the accumulation completes:

```tsx
const handle = viewerRef.current;
const dataUrl = await handle.captureStill({ width: 1920 }); // PNG data URL
```

## Video capture

Record the live canvas into a clip — no dependencies, straight through `MediaRecorder` (WebM in Chromium/Firefox, MP4 in Safari). Motion is captured as it happens, so `turntable` + `captureVideo` is a ready-made product-card orbit:

```tsx
<SimpleViewer ref={viewerRef} object={url} turntable />

const blob = await viewerRef.current.captureVideo({ duration: 5 }); // Blob
// also: fps, mimeType, videoBitsPerSecond
```

## Hotspot annotations & click selection

Pin DOM content to a world-space point — it tracks orbiting, zooming and resizes:

```tsx
import { SimpleViewer, Hotspot } from 'softbox';

<SimpleViewer object="/model.glb">
  <Hotspot position={[0, 1.2, 0]}>
    <div className="pin">Engine</div>
  </Hotspot>
  <Hotspot position={[0.4, 0.2, 0.8]} occlude /> {/* hidden when the model covers it */}
</SimpleViewer>
```

Without children a built-in dot pin is rendered. `occlude` hides the hotspot while the model blocks the line of sight to its anchor.

A click on the model (drags and pinches are ignored) emits `object:selected` with the hit object and world-space point — feed it straight into a `<Hotspot>`:

```tsx
handle.events.on('object:selected', ({ object, point }) => {
  addPin([point.x, point.y, point.z]);
});
```

Raycasts are BVH-accelerated per loaded model (logarithmic on high-poly meshes); opt out with `options.selection = { bvh: false }`.

## Events

Subscribe through the imperative handle:

```tsx
const { events } = viewerRef.current;
events.on('model:loaded', ({ model, loadTime }) => console.log('loaded in', loadTime, 'ms'));
```

| Event | Fires |
|---|---|
| `model:loading` / `model:loaded` / `model:error` | around every model load |
| `render:complete` | after each rendered frame |
| `pathtracing:complete` | once the sample cap is reached |
| `controls:change` | when the camera controls move |
| `object:selected` | when a click hits the loaded model (`{ object, point }`) |
| `error` | any viewer error |

## Imperative handle

```tsx
const viewerRef = useRef<SimpleViewerHandle>(null);
<SimpleViewer ref={viewerRef} object={url} />
```

The handle exposes `scene`, `camera`, `renderer`, `controls`, `events`, `loadModel(source)`, `captureStill(options?)`, `captureVideo(options?)`, `getAnimationNames()`, `playAnimations(name?)`, `pauseAnimations()` and `dispose()`.

## Configuration

Everything is optional — the defaults are the point. Pass `options` to override any part:

```ts
import { ControlType, defaultOptions } from 'softbox';

const options: SimpleViewerOptions = {
  preset: 'studio',              // one-word look; explicit options below win over it
  backgroundColor: '#f0f0f7',
  staticScene: false,            // stop the render loop when nothing moves

  // Unit your model is authored in: meters (default) | centimeters | millimeters
  // | feet | inches. Non-meter models are rescaled on load to the viewer's
  // 1-unit-=-1-meter convention (the real-scale floor, shadows and framing
  // depend on it) without touching the model's own transform.
  units: 'meters',

  camera: { position: [60, 60, 60], fov: 45, autoFitToObject: true },

  // The procedural studio environment lights the scene by default (zero network
  // requests). Point environment.url at an HDR/EXR/image to use your own.
  environment: { environmentIntensity: 0.5 },

  // Khronos PBR Neutral tone mapping by default — keeps saturated material
  // colours through the highlight rolloff (see renderer.toneMapping to change).
  renderer: { antialias: true, toneMappingExposure: 1.0 },

  controls: { type: ControlType.OrbitControls, enableDamping: true, autoRotate: false },

  animations: { autoplay: true, speed: 1 }, // GLTF clip playback

  helpers: {
    grid: { type: 'hexagonal_glass' }, // hex-tile floor (matte concrete by default); also: hexagonal_wire, square_wire, stone_tiles
    gizmo: false,                      // optional viewport orientation gizmo
    studioEnvironment: true,
  },

  pathTracing: { enabled: false, maxSamples: 16 },

  ui: { presets: false },        // built-in preset picker chips
  selection: { bvh: true },      // BVH-accelerated raycasts for picking/occlusion
  loadingIndicator: true,        // built-in loading overlay (object form customizes it)
  loaders: {},                   // DRACO/KTX2/Meshopt decoder config (self-host paths, toggles)

  // Like <img loading="lazy">: defer the WebGL context and model download until
  // the viewer first approaches the viewport. On pages with many viewers only
  // the visible ones boot — browsers cap concurrent WebGL contexts, so an
  // eager grid can silently kill the oldest ones. Once booted, always booted.
  loading: 'eager',              // or 'lazy'
};
```

See [`defaultOptions`](https://github.com/LEMing/softbox/blob/main/src/defaultOptions.ts) for the full annotated set and the typed option interfaces exported from the package root.

### Loading indicator

A built-in overlay shows while a model loads (and an error state if it fails) — the scene is never blank. Customize or disable it:

```tsx
<SimpleViewer object={url} options={{ loadingIndicator: { label: 'Loading…' } }} />
<SimpleViewer object={url} options={{ loadingIndicator: false }} /> // drive your own via events
```

### Loaders

DRACO, KTX2/Basis and Meshopt decoders are wired into the glTF loader by default — compressed exports from Blender, `gltfpack` or `gltf-transform` just load. Meshopt is bundled; the DRACO/KTX2 wasm decoders are fetched **on demand** (only the first time a model actually uses that compression) from a version-pinned jsDelivr URL. For a fully offline, no-CDN setup, self-host the decoder directories:

```ts
loaders: {
  dracoDecoderPath: '/decoders/draco/',   // copy of three/examples/jsm/libs/draco/
  ktx2TranscoderPath: '/decoders/basis/', // copy of three/examples/jsm/libs/basis/
}
```

### Viewport gizmo

```ts
helpers: { gizmo: { placement: 'top-right', size: 128 } }
```

Interactive orientation cube: click to snap the camera to axis views, synchronized with the controls.

### Path tracing options

`pathTracing`: `enabled`, `maxSamples` (completion cap), `bounces`, `transmissiveBounces`, `renderScale`, `lowResScale`, `dynamicLowRes`. The converged frame stays on the live canvas and re-accumulates on camera moves; `replaceWithScreenshotOnComplete: true` (off by default) restores the legacy behavior of swapping in a DOM snapshot instead.

## Next.js / SSR

The viewer renders into a WebGL canvas, so it is client-only. In Next.js, load it dynamically:

```tsx
'use client';
import dynamic from 'next/dynamic';

const SimpleViewer = dynamic(
  () => import('softbox').then((m) => m.SimpleViewer),
  { ssr: false }
);
```

## Upgrading

- **3.x → 4.0**: the package was renamed — `threedviewer` is now **`softbox`**. Swap the dependency and the import specifier; the API is unchanged. See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md).
- **3.0 → 3.x**: additive all the way — presets, `ui`, `pathTraced`, `captureStill`, `Hotspot`, `object:selected`, `selection`, `turntable`, `animations` are new surface on top of 3.0; existing options keep working. React peer is `>=18 <20`.
- **2.x → 3.0**: breaking release (removed no-op APIs, ESM+CJS packaging). See [MIGRATION_GUIDE.md](https://github.com/LEMing/softbox/blob/main/MIGRATION_GUIDE.md).

Full history: [CHANGELOG.md](https://github.com/LEMing/softbox/blob/main/CHANGELOG.md)

## License

MIT
