# threedviewer

[![npm version](https://img.shields.io/npm/v/threedviewer)](https://www.npmjs.com/package/threedviewer)
[![CI](https://github.com/LEMing/ThreeDViewer/actions/workflows/ci.yml/badge.svg)](https://github.com/LEMing/ThreeDViewer/actions/workflows/ci.yml)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/LEMing/ThreeDViewer/blob/main/package.json)

**The batteries-included React 3D viewer — any GLB looks studio-shot in one line.**

```tsx
<SimpleViewer object="/model.glb" />
```

Balanced studio lighting, a glossy glass floor with a contact shadow, auto-framing, compressed-asset decoders — all on by default, zero configuration, zero external CDN requests.

[![threedviewer playground](https://raw.githubusercontent.com/LEMing/ThreeDViewer/main/public/og-image.png)](https://leming.github.io/ThreeDViewer/)

**▶ [Live playground](https://leming.github.io/ThreeDViewer/)** — drag & drop your own `.glb`, switch presets live, click the model to pin hotspots, download a still.

## Install

```bash
npm install threedviewer
```

Peer dependencies: `react` / `react-dom` `>=18 <20`, `three` `>=0.177 <0.186`.

## Quick start

```tsx
import { SimpleViewer } from 'threedviewer';

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

DRACO, KTX2/Basis and Meshopt compressed assets load out of the box — the decoders are wired in and fetched lazily only when an asset actually needs them.

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

## Photoreal mode & stills

```tsx
<SimpleViewer object={url} pathTraced />
```

`pathTraced` turns on progressive path tracing (a construction-time render mode). Capture a PNG programmatically — in raster mode at any resolution, in path-traced mode once the accumulation completes:

```tsx
const handle = viewerRef.current;
const dataUrl = await handle.captureStill({ width: 1920 }); // PNG data URL
```

## Hotspot annotations & click selection

Pin DOM content to a world-space point — it tracks orbiting, zooming and resizes:

```tsx
import { SimpleViewer, Hotspot } from 'threedviewer';

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

The handle exposes `scene`, `camera`, `renderer`, `controls`, `events`, `loadModel(source)`, `captureStill(options?)` and `dispose()`.

## Configuration

Everything is optional — the defaults are the point. Pass `options` to override any part:

```ts
import { ControlType, defaultOptions } from 'threedviewer';

const options: SimpleViewerOptions = {
  preset: 'studio',              // one-word look; explicit options below win over it
  backgroundColor: '#f0f0f7',
  staticScene: false,            // stop the render loop when nothing moves

  camera: { position: [60, 60, 60], fov: 45, autoFitToObject: true },

  // The procedural studio environment lights the scene by default (zero network
  // requests). Point environment.url at an HDR/EXR/image to use your own.
  environment: { environmentIntensity: 0.7 },

  renderer: { antialias: true, toneMappingExposure: 1.1 },

  controls: { type: ControlType.OrbitControls, enableDamping: true },

  helpers: {
    grid: { type: 'hexagonal_glass' }, // glossy glass floor; also: hexagonal_wire, square_wire, stone_tiles
    gizmo: false,                      // optional viewport orientation gizmo
    studioEnvironment: true,
  },

  pathTracing: { enabled: false, maxSamples: 16 },

  ui: { presets: false },        // built-in preset picker chips
  selection: { bvh: true },      // BVH-accelerated raycasts for picking/occlusion
  loadingIndicator: true,        // built-in loading overlay (object form customizes it)
  loaders: {},                   // DRACO/KTX2/Meshopt decoder config (self-host paths, toggles)
};
```

See [`defaultOptions`](https://github.com/LEMing/ThreeDViewer/blob/main/src/defaultOptions.ts) for the full annotated set and the typed option interfaces exported from the package root.

### Loading indicator

A built-in overlay shows while a model loads (and an error state if it fails) — the scene is never blank. Customize or disable it:

```tsx
<SimpleViewer object={url} options={{ loadingIndicator: { label: 'Loading…' } }} />
<SimpleViewer object={url} options={{ loadingIndicator: false }} /> // drive your own via events
```

### Viewport gizmo

```ts
helpers: { gizmo: { placement: 'top-right', size: 128 } }
```

Interactive orientation cube: click to snap the camera to axis views, synchronized with the controls.

### Path tracing options

`pathTracing`: `enabled`, `maxSamples` (completion cap), `bounces`, `transmissiveBounces`, `renderScale`, `lowResScale`, `dynamicLowRes`. With `replaceWithScreenshotOnComplete: true` (default) the finished frame replaces the live canvas until the user interacts.

## Upgrading

- **3.x → 3.14**: additive — presets, `ui`, `pathTraced`, `captureStill`, `Hotspot`, `object:selected`, `selection` are all new surface; existing options keep working. React peer widened back to `>=18 <20`.
- **2.x → 3.0**: breaking release (removed no-op APIs, ESM+CJS packaging). See [MIGRATION_GUIDE.md](https://github.com/LEMing/ThreeDViewer/blob/main/MIGRATION_GUIDE.md).

Full history: [CHANGELOG.md](https://github.com/LEMing/ThreeDViewer/blob/main/CHANGELOG.md)

## License

MIT
