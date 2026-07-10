Changelog
=========

4.14.0
---

### A higher-contrast studio environment for crisper reflections

The default image-based lighting was three's stock `RoomEnvironment` — an even, neutral
room that gave glossy materials a soft, flat wash with no distinct highlights. The studio
environment is now pushed to a higher-contrast "product-shot" look before it's baked: the
reflected surround (the room walls + furniture) is darkened and the emissive soft-box
panels are slightly concentrated, so metals and glossy surfaces show crisp, distinct
highlights against a deeper background instead of an even grey reflection. The contrast is
applied to the one shared room scene before PMREM, so the raster environment map and the
path tracer's cube capture stay identical, and the raster/traced looks continue to match.
Combined with the 4.13.0 three-point rig, the default read is noticeably more dimensional
without touching material colours or the neutral white balance.

4.13.0
---

### A real studio three-point lighting rig

The default lighting was a single key plus a generous omnidirectional ambient/hemisphere
wash — soft and flat, with no crisp specular and no edge separation. It's now a proper
studio three-point rig, the first (biggest) half of the "expensive" render-quality wave.

* **New `fillLight` and `rimLight` options** (`AccentLightOptions`: colour, intensity,
  position) join the existing `directionalLight` key. Both are soft and **shadowless** —
  only the key casts a shadow, so the contact shadow stays single and clean. The fill is
  added after the key so `findDirectionalLight` still resolves the key as the shadow source.
* **The default rig is now a balanced three-point setup:** a stronger key (intensity 1.9 →
  2.4) for a crisper specular; a soft cool-neutral **fill** from the opposite/lower side
  that opens the shadowed side so it reads as form, not a black void; and a cool **rim/back
  light** behind and above the subject that kicks a bright edge along the top/back
  silhouette — the single biggest cue that separates the model from the backdrop. The
  omnidirectional base drops (ambient 0.5 → 0.32, hemisphere 0.45 → 0.3) so the shadow side
  stays deep enough for contrast and the key/rim do the shaping. The result reads more
  dimensional and "hero" — crisper metals, real form, a separated silhouette — while
  neutral models are still not tinted (warmth stays in the materials, not the key).

4.12.0
---

### A punchier hero look: radial-vignette backdrop, tighter crop, quieter shadow

Closing the render-quality gap against reference viewers (Sketchfab et al.) on the
same model — the cheap, high-leverage half: pure look tuning, no lighting rewrite yet.

* **New: a radial-vignette backdrop, and the `dark` preset now uses it.** Set the new
  top-level `backgroundColorEdge` option and the backdrop is painted as a soft radial
  gradient — `backgroundColor` behind the subject falling off to `backgroundColorEdge`
  in the corners — instead of a flat fill, so the model floats in a studio cove. The
  `dark` preset ships this by default (a slightly-lifted centre `#242430` easing to a
  near-black `#050507`), which reads far more "hero" than the old flat `#1a1a1f` scrim.
  Omit the edge colour for a flat background (every light preset stays flat). It is a
  runtime field, so switching presets applies it live with no viewer rebuild.
* **Tighter default framing.** Auto-fit now leaves ~65% breathing room beyond an exact
  fit instead of 100%, so the subject fills more of the frame — a more product-like
  hero crop. (Models with a hand-tuned camera are unaffected.)
* **A quieter, softer, tighter contact shadow.** The baked contact shadow was a large,
  fairly dark smear; it is now lower-opacity (0.85 → 0.55), softer (a wider area-light
  aperture and more per-pass blur) and tighter (the disc no longer stretches as far
  under tall models), so it grounds the model with a calm soft pool instead of pulling
  focus. The pre-bake/live catcher opacity drops to match.
* **The `dark` preset reads punchier** — a touch more exposure (1.2 → 1.3) with lower
  environment intensity (0.5 → 0.42) deepens the contrast while keeping the subject
  bright.

4.11.0
---

### Let an external camera driver own the camera (first-person / custom controls)

* **The render loop now skips `controls.update()` while the controls are disabled.** Previously the loop called `OrbitControls.update()` every frame unconditionally, and because `update()` re-aims the camera at the orbit target, any consumer trying to drive the camera itself (e.g. its own `FirstPersonControls` for a walk mode) was fought frame-by-frame and could never take over. Now, setting `handle.controls.enabled = false` hands the camera to the consumer: the loop stops updating OrbitControls but keeps rendering, so the externally-driven camera is shown. One-shot `update()` calls (camera fit, serialization) are unaffected.

### Runtime background & environment

* **New handle methods to change the backdrop and lighting after init, without a rebuild:** `setEnvironmentMap(url)` loads an equirectangular HDRI/LDR image as the reflections + background (textures are cached by URL, so toggling the same map on/off is cheap); `resetEnvironment()` restores the built-in studio environment and the clean gradient background; `setBackgroundImage(source)` paints an uploaded image (URL, `File`, or `HTMLImageElement`) as a plain sRGB backdrop while leaving the environment lighting untouched; `setBackgroundColor(color)` sets a solid background (and clears a background image). These reuse the existing environment service, dispose the replaced background texture, and force a path-tracing re-accumulation so a live traced session picks up the change.

4.10.1
---

### Path-tracing backdrop survives free rotation (infinity dome)

* **The path-traced studio backdrop is now an axisymmetric "infinity dome" instead of a 3-sided cove.** The 4.9.0 cove was open at the front and back-walled — fine head-on, but orbiting past ±90° swung its solid back wall between the camera and the model (a grey plane), and on the open side the model floated against raw background. The dome is a surface of revolution (a flat floor sweeping up through a big concave fillet into a near-vertical wall, open at the top), so it looks identical from every azimuth — a seamless soft-lit sweep behind the subject at any angle, with the same real contact shadow. The open top still lets the studio environment light the interior (a sealed box would occlude the tracer's environment sampling and go dark). It stays invisible in the raster view and is shown to the tracer only during ingest.

4.10.0
---

### Let self-grounded models keep their authored height

* **New `floorAlignment` option (default `true`).** By default softbox drops the loaded model onto the floor at y=0, snapping its lowest point down. For a model that carries its own ground (e.g. an embedded ground slab), that snap grabs the bottom of the slab and shifts everything above it upward. Set `floorAlignment: false` to skip both the align and the snap so such a model keeps its authored Y.

4.9.0
---

### Path tracing: converges cleanly, grounds the model, and dissolves in smoothly

* **The path tracer now accumulates to 1024 samples by default (was 16).** Sixteen samples is far too few to resolve a traced frame — it came out as a heavy stipple of noise. It now refines to a clean image while the camera rests. `pathTracing.maxSamples` still overrides it to trade convergence time for cleanliness.
* **The model is grounded in a studio cyclorama with a real contact shadow instead of floating.** The default studio floor is an invisible `ShadowMaterial` catcher — a raster shadow-map trick the path tracer can't use — so the traced view had no surface to cast a shadow onto and the model floated. The shadow floor now also carries a real matte **3-sided cyclorama** (floor sweeping up into a back wall and two side walls through big rounded fillets, open at the top and front) that stays invisible in the raster view and is shown to the tracer only while it ingests the scene. The traced frame gets a physically-correct contact shadow and a seamless soft-lit wraparound backdrop; the raster view is unchanged (still the clean invisible-floor look).
* **Enabling path tracing now dissolves in from the raster frame instead of flashing coarse noise.** The first path-traced samples are near-random (salt-and-pepper + fireflies); previously that noise slammed straight over the clean raster view. The viewer now snapshots the raster the instant accumulation starts and fades it out over the resolving tracer image (held fully opaque for the first few samples, then eased out), so the ugly early frames stay hidden and only the converging image shows through. The snapshot is tone-mapped to match the on-screen frame exactly, and the whole effect is cosmetic — if it can't run it silently falls back to showing samples directly.

4.8.0
---

### Opt-in post-processing + a cleaner studio default

* **New: opt-in post-processing effects.** `renderer.bloom`, `renderer.vignette` and `renderer.filmGrain` route the raster view through a lazily-loaded composer — the chunk only downloads when at least one effect is on, so a viewer that uses none pays nothing in bundle weight or per-frame cost. Bloom adds a restrained glow to genuinely blown highlights (headlights, hot speculars), the vignette darkens the frame edges to focus the subject, and the film grain lays a **fixed, non-animated** photographic speckle over the frame. Each is off by default and toggles independently; all are ignored while path tracing is active (the tracer draws to the canvas itself).
* The composited path keeps the renderer's tone mapping and exposure (through `OutputPass`), so an effect-on frame matches the plain-render look; it carries MSAA so the model's edges don't alias; and it refreshes its scene/camera every frame so it tracks a swapped camera or a reloaded model instead of freezing on the ones captured when the composer was built.
* **New default floor: a clean studio "shadow floor."** The default is now an invisible shadow-catching disc (`helpers.grid.type: 'shadow_floor'`) instead of the matte hex-paver tiles — the model reads as a product shot sitting on the background with a soft contact shadow, not on a patterned field. The real-scale hex "ruler" floor is one option away (`helpers.grid.type: 'hexagonal_glass'`).
* **Tighter default framing: field of view 45° → 30°.** A longer lens flattens the perspective for a more product-like hero shot; the deep fallbacks in `ViewerFactory`/`ThreeCamera` match the default.
* **The camera can no longer dip below the floor.** `controls.maxPolarAngle` now defaults to the horizon (π/2), so orbiting never swings under the ground to look up at the model's underside.
* Playground: a new **POST** row toggles bloom / vignette / grain live.

4.7.0
---

### Warmer, richer default render (Khronos PBR Neutral tone mapping)
* **Default tone mapping is now Khronos PBR Neutral instead of ACES Filmic.** ACES desaturates bright values toward white, which clipped saturated paint highlights (a glossy orange roof went white and lost its colour) and left the whole render looking pale. PBR Neutral — designed for product/e-commerce — rolls highlights off filmically while preserving material hue, so colours stay rich and highlights keep their tint.
* **Fixed a latent tone-mapping-operator bug:** the numeric tone-mapping enum was renumbered in three r160+ (AgX/Neutral were added), so `toneMapping: 6` in the defaults — commented "ACESFilmic" — was actually AgX and only rendered as ACES via an unrelated string fallback. The operator map now covers `agx` and `neutral` and maps the real `THREE.*ToneMapping` constants, so selecting AgX or Neutral works instead of silently falling back to ACES.
* **Brighter, softer, bright-but-matte default lighting:** a near-neutral studio key (was pure white, so genuinely white models are no longer tinted) over a generous diffuse ambient/hemisphere fill for an evenly-lit high-key studio look, with a warm-neutral bounce instead of a cold blue one. Brightness comes from the diffuse fill rather than the IBL, so `environmentIntensity` drops 0.7 → 0.5 (reflections read matte instead of mirror-glossy) while exposure nudges 1.1 → 1.15 to keep the frame bright. Presets retuned to match the new operator.
* The default camera field of view is normalized to 45° everywhere (the `defaultOptions` already used 45; the deep fallbacks in ViewerFactory/ThreeCamera were 75° — a wide, distorted perspective — and now match), for a flatter, product-style framing.
* **Removed two dead path-tracing colour overrides** — a `pathTracer.environmentIntensity = 2.0` assignment (three-gpu-pathtracer never reads that property; it reads `scene.environmentIntensity`) and a paired `exposure = 1.5` block behind an always-false guard. Path tracing already inherited the scene/renderer colour state; this just deletes the misleading dead code so the converged frame's exposure/env is unambiguously the raster path's.

4.6.0
---

### Path tracing toggles live
* **`pathTracing.enabled` is now a runtime option** — flipping it applies to the running viewer instead of rebuilding it. Previously every toggle tore down the WebGLRenderer and **re-fetched the whole model**, and the freshly-built camera started at aspect 1 (a stale resize memo meant the new viewer never got sized), so the path-traced frame rendered stretched and — because the tracer bakes the aspect and only refreshes on a camera move — stayed stretched. Turning path tracing on/off is now instant, keeps the model in memory, and preserves the correct aspect ratio. The other `pathTracing` fields (`maxSamples`, `bounces`, …) still configure the tracer at construction and remain structural.
* **Fixed:** disabling path tracing after it converged left the grainy final frame frozen on the canvas — the completed accumulation was still being preserved. Disabling now hands the canvas straight back to the raster renderer.
* **Fixed:** a structural rebuild (e.g. changing `units`) could leave the rebuilt viewer's camera at the default square aspect until the next real resize, distorting the first frames. A rebuilt viewer is now always re-sized to its canvas.
* **Changed:** the tracer service is always created (it's a lazy facade — the heavy chunk still loads only on first enable), and `preserveDrawingBuffer` is always on, so any viewer can turn path tracing on at runtime and capture a still. The per-frame cost is negligible for idle viewers.

4.5.0
---

### Interactive path tracing
* **Fixed: path tracing never actually ran under the default studio environment.** The procedural studio room exists only as a PMREM texture, whose packed layout the tracer cannot read — the tracer silently waited for an environment forever and every "path-traced" frame was really the raster fallback. The studio room is now also captured into a plain HDR cube map (tone mapping off, like PMREM's own pipeline) and registered as the tracer's ingest source; the tracer converts it to the equirectangular map it needs by itself. Path tracing now works out of the box, with any preset.
* **Fixed: camera motion with path tracing enabled smeared the model into torn slivers.** Two causes, both fixed: the tracer's setup left the renderer's `autoClear` permanently off, so every raster fallback frame stacked over the last one; and accumulated samples were presented mid-motion against a camera that had already moved. Motion now renders plain cleared raster frames, and accumulation (re)starts only after the camera has rested for a settle window (200 ms), with a single camera re-sync — never a per-move scene re-ingest (BVH rebuild).
* **Changed: the tracer stays warm and re-accumulates instead of dying after one convergence.** Completion used to dispose the path tracer 100 ms after presenting the frame; the first camera move after that left a stale frame frozen on the canvas with nothing ever rendering again. The converged frame now stays live, and any camera move re-arms a fresh accumulation from the new viewpoint. Give-up pauses (no WebGL2, no usable environment) stay paused — there is nothing warm to resume.
* **Changed: `replaceWithScreenshotOnComplete` now defaults to `false`.** The DOM-snapshot overlay was built for one-shot path tracing; it blocks interaction behind an `<img>` and reloads the entire model on the first click. With the tracer interactive it adds nothing — the option remains for consumers who want the old behavior.
* While animations play, accumulation is suspended (animated geometry can never converge against the ingested BVH) and the raster renderer shows the motion; pausing playback re-ingests the resting pose and re-converges.
* The render loop now wakes from the controls' own change event — after it wound down (converged accumulation, idle static scene), user interaction reliably restarts rendering.
* Playground: new **path traced** chip in the Render row toggles the mode live and updates the copyable snippet.

4.4.2
---

### Internal decomposition & stricter input validation
* The scene-setup service (grown to ~860 lines across ten concerns) is now a thin facade over focused modules — floor grid, floor snapping, shadow rig, contact shadow, lighting, gradient background, units scaling, camera framing. No public API change; every operation behaves as before.
* **Changed:** `fitCameraToObject` was the one scene-setup operation still blind-casting its inputs — an object, camera, or controls that wasn't unwrappable was cast anyway and either silently mis-framed the scene or crashed deep inside Three.js. It now fails loud with `INVALID_PARAMETER` like every other operation. Cameras must be perspective or orthographic (the two kinds whose projection can be refitted); controls must come from the viewer's own adapters.
* The environment service's `applyToScene` goes through the same shared adapter-unwrap helpers as the rest of the codebase (the last hand-rolled `instanceof` unwraps), so it now also accepts a raw `THREE.Scene`/`THREE.Texture` in addition to the viewer's adapters.

4.4.1
---

### Bug fix
* **Fixed:** models whose geometry sits away from the origin lost their shadows and stood beside their own floor — the whole grounding pipeline assumed origin-centered content. The fitted shadow frustum is centered on the key light's aim axis, and the light's target was hardcoded to the origin, so for an off-origin model the tightly fitted frustum missed it entirely; the dynamic floor grid (with its live shadow catcher) also always spawned at the origin. The light rig now re-aims at the loaded model's center on every load — shifting position and target together, so the configured light direction (and the shadow's look) is preserved and repeated loads cannot drift — the contact-shadow bake aims its stand-in light the same way, and the floor grid centers under the model. Only the viewer's own rig is re-aimed; lights embedded in a loaded model are never touched. For origin-centered models the light direction and framing are preserved exactly.

4.4.0
---

### Lazy viewport boot
* New option `loading: 'lazy'` (default `'eager'`) defers the entire viewer boot — WebGL context creation, model fetch, first render — until the canvas first approaches the viewport (200 px preload margin), like `<img loading="lazy">`. On pages with many viewers (e-commerce grids), only the visible ones pay for a GL context and a model download; browsers cap concurrent WebGL contexts, so an eager grid could silently kill contexts before this.
* The gate latches open: scrolling away, or changing `loading` after boot, never tears down a running viewer. Flipping `'lazy'` → `'eager'` before the viewer was ever visible boots it immediately. Where `IntersectionObserver` is unavailable (SSR, legacy browsers) the option degrades to eager — a viewer that boots eagerly beats one that never boots.

4.3.2
---

### Performance & resilience
* **Changed:** the contact-shadow bake no longer burns a fixed 96 synchronous GPU passes regardless of the device: it times one probe pass (with a forced GPU sync via a 1×1 readback) and fits the pass count to a ~100 ms budget, clamped to 24–96. An untimed warm-up pass runs first so the probe measures steady-state cost, not the model's one-time buffer uploads and shadow-program links — without it, big models on fast GPUs would be punished with a low pass count for the wrong reason. A healthy GPU keeps full quality; a software rasterizer or an integrated GPU under a heavy model degrades pass count instead of freezing the page on every model load and animation pause. An explicit `passes` option still bakes exactly that count, and an unreadable target type skips the sync fence (checked up front — `readRenderTargetPixels` logs instead of throwing) and degrades to full quality — never worse than before.
* **Fixed:** a lost WebGL context now aborts the bake gracefully — before it started (every GL call would be a silent no-op) or mid-accumulation (a partial texture must not replace the working live shadow). Both abort paths also evict any previously baked disc — stale for the new model/pose, and destined to come back as an opaque black blob once the context is restored — and put the live `ShadowMaterial` catcher back in charge.
* `HexagonalWireGrid` now honours `hexRadius: 0` the same way the glass grid does since 4.3.1 (`??` instead of a falsy fallback).

4.3.1
---

### Performance
* **Fixed:** the hex-tile floor built a separate mesh, `ExtrudeGeometry`, `MeshPhysicalMaterial` and wrapper `Group` for every tile — at real-world paver scale (a fixed physical tile under a large model, up to the 60-ring cap) that is ~11,000 tiles and ~22,000 scene objects, multiplying into thousands of draw calls and GPU allocations that dominated first paint and slowed every path-tracer scene ingest. The whole floor is now a single merged mesh with one shared material: tiles are translated copies of one canonical geometry, so the merge is plain attribute replication. Visual output is unchanged (same vertices, same material); the floor stays fully visible to the path tracer, which does not expand `InstancedMesh` instances — the reason instancing was not used.
* `styleOptions.hexRadius: 0` (the dynamic grid's single-tile request for very small objects) is no longer coerced through a falsy fallback to a divisions-derived radius.

4.3.0
---

### Unknown animation clip names fail loudly
* **Changed:** playing an animation clip the model does not carry was a silent no-op — a typo'd name left the model frozen with nothing on the console and nothing to catch. `IAnimationService.play` and `ViewerCore.playAnimations` now return `Result<void>` and err with `INVALID_PARAMETER` naming the unknown clip and the clips the model actually carries; the imperative `handle.playAnimations(name)` throws that error, consistent with `loadModel`/`captureStill`.
* State problems are diagnosed as state, not as a bad name: a named play with no clips attached at all (no model loaded yet, or a clipless model) errs with `INVALID_STATE` — the name may be perfectly right for the model about to load. Same for a viewer assembled without an animation service.
* Declarative `animations.autoplay` with an unknown clip name (via options or `updateOptions`) surfaces the same error as a console error instead of failing the model load or crashing the host React tree. Setting autoplay through `updateOptions` before any model has loaded stays quiet — the merged option simply applies (and validates) when the load lands, as it always did.
* A bare `playAnimations()` on a model without clips remains a declared no-op (`autoplay: true` on a static model stays valid).

4.2.2
---

### Bug fixes
* **Fixed:** enabling the turntable while a path-traced `captureStill()` was already waiting for the accumulation hung the returned promise until dispose — auto-rotation resets the accumulation every frame, so the wait could never converge. The pending capture now rejects with the same `INVALID_STATE` error the up-front turntable check uses. Video captures are unaffected (a turntable does not invalidate them).
* **Fixed:** the path tracer's rapid-reset throttle (50 ms) could swallow the accumulation reset issued right after a model swap — if the camera was moving as the load resolved, the tracer kept sampling the *previous* model's geometry until the next camera pause. Model-swap resets now bypass the throttle; camera-move resets stay throttled.

4.2.1
---

### Bug fix
* **Fixed:** the baked contact-shadow disc (and the live `ShadowMaterial` catcher) were handed to the path tracer along with the rest of the scene — the tracer computes physically-correct contact shadows itself, so the contact area rendered double-dark in path-traced mode. Both helpers are now hidden for the duration of the scene ingest and restored right after, so the raster fallback keeps its baked shadow.

4.2.0
---

### Errors reach the consumer; the load callbacks finally work
* **Fixed:** a viewer construction or initialization failure (most commonly: WebGL unavailable) left the built-in overlay spinning forever with the error visible only in the console. The overlay now switches to its error state with the failure message, and `useViewerCore` exposes the failure as `initError`.
* `options.onLoad`, `options.onProgress` and `options.onError` were typed and documented but never invoked — dead options since they were introduced. They are now wired: `onLoad` fires on every `model:loaded`, `onError` fires on model load errors **and** on construction/initialization failures, and `onProgress` reports URL-download progress as a 0–1 fraction (only when the server sends a total size). Callbacks are read live through a ref — changing them never rebuilds the viewer and never calls a stale closure.
* New `model:progress` event (`{ url, loaded, total }` in bytes) on both the core and the public event bus, threaded from the GLTF loader through a new optional `onProgress` parameter on the `IModelLoader` port.
* **Deprecated:** `options.animationLoop` — it was never read by anything since the 3.x architecture rewrite and remains ignored. The type stays through 4.x so existing code keeps compiling; it will be removed in 5.0. The render loop is fully managed (turntable/animations/path tracing drive it automatically).

4.1.3
---

### Bug fix
* **Fixed:** `snapObjectToFloor` sank single-sided (glTF-default) closed meshes below the floor — the downward sampling rays backface-culled the model's true, down-facing contact surface, so an upper surface read as the lowest point and the model dropped by that much too far, up to its full height. Every sample now also casts upward from below the model (catching the culled contact surfaces) and the lowest point is the minimum over both passes; up-facing bottom surfaces like ground decals keep working through the downward pass.

4.1.2
---

### Bug fixes
* **Fixed:** changing `units` on a mounted viewer was silently ignored — the option was in neither the structural nor the runtime key of the option-change detection, so nothing happened until some unrelated structural change rebuilt the viewer with the "new" units long after the fact. `units` is now a structural option: changing it rebuilds the viewer and re-wraps the model, like the other load-time options.
* **Fixed:** an unknown `units` string from an untyped (JS) consumer silently fell back to meter scale — the exact wrong-scale failure the option exists to prevent. Validation now happens at the top of `ViewerFactory.createViewer` (before any GPU/DOM resource exists, so nothing leaks on failure) and rejects prototype-chain names (`'toString'`, …) via an own-property check, failing with `INVALID_PARAMETER` naming the invalid value and the valid ones. Inside `<SimpleViewer>` the failure is contained to a console error instead of crashing the host application's React tree.

4.1.1
---

### Bug fix
* **Fixed:** any `units` other than `'meters'` silently disabled GLTF animation playback — the units scale wrapper became the model root, and the animation service only looked for clips on the root itself. Clip discovery now descends past wrapper groups to the first `animations`-bearing node and roots the `AnimationMixer` there, which also fixes the same silent no-op for consumer-passed objects whose clips live one level down (e.g. `loadModel(group.add(gltf.scene))`), and keeps root-relative track paths (`'.scale'` …) bound to the authored scene instead of a wrapper whose transform the viewer owns.

4.1.0
---

### `units` option — models authored in inches/feet/cm render at real scale
* New `options.units` (`'meters'` — default — `'centimeters'`, `'millimeters'`, `'feet'`, `'inches'`): the loaded model is wrapped in a scale group converting its authored unit to the viewer's 1-unit-=-1-meter convention, so the real-scale hex-paver floor, the baked contact shadow and auto-framing are correct for CAD-style models that aren't authored in meters.
* The conversion never mutates the model's own transform: consumer-provided `Object3D`s survive option-change rebuilds without compounding, and models with a corrective root scale keep it. A failed conversion fails the load loudly instead of rendering 39× off.
* Applies to both URL-loaded models and directly passed `Object3D`s; the `ModelUnits` type is exported.

4.0.0
---

### Package renamed: `threedviewer` → `softbox`
* The package is now published as **`softbox`** (`npm install softbox`); the repository moved to https://github.com/LEMing/softbox and the playground to https://leming.github.io/softbox/. The old `threedviewer` package is deprecated on npm with a pointer here and receives no further releases.
* No API changes — 4.0.0 is 3.20.0 plus the rename. Update the dependency and the import specifier (`from 'threedviewer'` → `from 'softbox'`) and everything keeps working. See [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md).
* The playground chrome, README hero image, code snippets, packaging smoke tests and the console warning prefix all carry the new name.

3.20.0
---

### Studio-grade baked contact shadows
* New `ContactShadowBaker`: after a model loads, the viewer bakes a soft area-light contact shadow by averaging 96 jittered one-sample shadow renders — golden-angle disc sampling of a ~9° area light plus zenith-weighted sky-hemisphere passes for ambient occlusion — into a HalfFloat texture on a floor disc. The result is sharp and dark right at the contact points and progressively softer with distance (the distance-dependent penumbra a single real-time shadow-map pass cannot produce), and costs nothing per frame once baked.
* The bake runs in a private throwaway scene with a stand-in light, so the live scene and key light are never touched; the model's materials have `colorWrite` masked during the bake so only its shadow reaches the accumulation texture.
* Playing animations falls back to the real-time `ShadowMaterial` catcher (a baked snapshot would lag the moving model); pausing re-bakes the shadow for the stopped pose.
* The shadow disc clips itself to the actual tile coverage, and the dynamic floor now includes the model's height in its sizing — the cast shadow always has floor to land on instead of hovering in mid-air past the last tile.
* **Fixed:** `IObject3D` lacked `castShadow`/`receiveShadow`, so `ModelManager`'s shadow-enabling traverse never matched and no loaded model ever cast a shadow through that code path.
* **Fixed:** the key light's shadow-camera frustum was a fixed ±50 world units regardless of the model; `fitShadowCameraToObject` now fits it after floor snapping, so small models get full shadow-map texel density instead of a blocky smudge.
* New `snapObjectToFloor`: a dense BVH-accelerated raycast drops the model onto the floor tiles, correcting the residual float/penetration the bounding-box alignment leaves on models whose lowest visual point isn't the box bottom.

### Matte concrete hex floor at real NYC-paver scale
* Hex tiles are now matte concrete (roughness 0.9, no transmission) at the fixed real-world size of the NYC hexagonal sidewalk paver — 8 inches across flats per the NYC Street Design Manual, edge length ≈ 0.1173 m. The tile is a physical scale reference like a ruler and deliberately does not resize with the model.
* **Fixed:** `HexTileConfig.getYPosition` placed tile tops a full tile-height below y=0, so every model visually floated above the floor. Tops now sit exactly at y=0, with a crisp 4% paver chamfer instead of the old rounded 25% bevel.

### Playground
* Opens on a low-poly GMC motorhome by default with a curated camera preset; Khronos sample models are re-hosted locally and rescaled to real-world sizes (lantern 1.2 m, helmet 0.3 m, fox 0.9 m, motorhome 9.3 m as the reference).
* Jest now ignores `.claude/` worktrees so background-agent checkouts can't leak into the test run.

3.19.8
---

### Code health + bug fix
* Refactored `ThreePathTracingService.render()` out of god-method territory (233 lines down to a ~40-line orchestrator): extracted `ensurePathTracerCreated`, `extractThreeObjects`, `initializeSceneForPathTracing` and `accumulateSample` as focused private methods. Removed dead code found along the way: a commented-out block in `initialize()`, a retry loop in `createPathTracer()` that could never actually iterate more than once, and a duplicate `return` in the creation-retry fallback. Deleted the `__pathTracingActive` renderer flag entirely — it was read and cleared in several places but never actually set, so the branch it gated in `ThreeRenderer.render()` was unreachable dead code.
* **Fixed:** a third self-disable path (PMREM environment texture with no original equirectangular source) set `enabled = false` directly instead of going through the `pathtracing:paused` notification added for the other self-disable paths — so, like those, it could leak the render loop's `'path-tracing'` continuous-render demand forever and leave a pending `captureStill()` hanging. It now notifies consistently.
* No other behavior change — verified via the full test suite (497 tests, all passing unchanged except updates for the removed dead code) plus a full local run of the Playwright render-smoke suite on real WebGL pixels.

3.19.7
---

### Code health
* Centralized the runtime-tunable option list (background color, tone-mapping exposure, environment intensity, turntable, animation autoplay/speed) into `src/types/runtimeOptions.ts` — a `pickRuntimeOptions()` helper plus shared field-name constants, now consumed by `useStableOptions` (structural/runtime key split) and `useViewerCore` (the runtime-apply effect), instead of each hand-listing the same fields separately. No behavior change.

3.19.6
---

### Bug fix
* **Fixed:** `pauseAnimations()` followed by `playAnimations()` restarted every clip from t=0 instead of resuming from the paused pose, contradicting the documented contract. `play()` now only restarts via `stopAllAction()` when starting a new clip selection; resuming with no clip name just lets playback continue from where it paused.

3.19.5
---

### Bug fixes
* **Fixed:** `captureStill()`/`captureVideo()` did not check for an active screenshot replacement — calling either while the canvas was hidden behind a captured screenshot image (and its scene resources possibly already released) silently captured a stale or meaningless frame. Both now reject with `INVALID_STATE` while a screenshot is active.
* **Fixed:** `dispose()` racing an in-flight `loadModel()` let the freshly-loaded model be added to a scene nobody renders, with no future `dispose()` call left to reclaim its GPU resources. The load now detects the race after it resolves and disposes the orphaned model instead of installing it, returning `INVALID_STATE`.

3.19.4
---

### Packaging fix
* **Fixed:** CJS consumers under `moduleResolution: node16`/`nodenext` got ESM-flavored type declarations through the `require` condition (arethetypeswrong's "Masquerading as ESM") — the build now emits a `dist/index.d.cts` twin and the exports map serves it to `require()`, matching the `.cjs` runtime file. `npm run attw` (`@arethetypeswrong/cli --pack`) is now part of `prepublishOnly` and CI so this class of packaging regression is caught automatically.

3.19.3
---

### Bug fix
* **Fixed:** overlapping `captureVideo()` calls shared the same `'video-capture'` render-loop continuous-rendering reason, so the first take to finish released it out from under a still-recording second take, starving its frame forwarding. Each take now holds its own uniquely-tagged reason, so concurrent captures no longer interfere with each other.

3.19.2
---

### Bug fixes
* **Fixed:** `captureStill()` in path-traced mode could hang forever if the tracer gave up on the accumulation on its own (renderer never became ready, or the environment texture never arrived) instead of reaching its sample target — the service now notifies that give-up the same way it notifies a normal completion, so the pending capture settles and returns the canvas as it stands instead of never resolving.
* **Fixed:** combining `turntable` (or any live `controls.autoRotate`) with path tracing made `captureStill()` hang forever — every camera move resets the accumulation, so it could never reach the sample target. It now rejects with `INVALID_STATE` instead of waiting on a completion that will never come; pause `autoRotate` before capturing a path-traced still.
* **Fixed:** `mergeWithPreset` shallow-spread the caller's explicit options onto the deep-merged defaults+preset, so any partial sub-object override (e.g. `renderer: { antialias: false }`) silently wiped out the rest of that sub-object (tone mapping, exposure, etc.) instead of overriding just the given field. Presets and defaults now survive partial overrides correctly.

3.19.1
---

### Bug fixes
* **Fixed:** the render loop's idle detection could never re-arm after `releaseContinuous` dropped demand on a frame that rendered nothing (e.g. right after `captureVideo`/`pauseAnimations` finish on a `staticScene: true` viewer) — the idle timer is now armed based on current demand, not on whether that specific frame rendered, so the loop reliably idles out again instead of spinning forever.
* Replaced a structural double-cast that let `ViewerCore` peek at `ThreeRendererAdapter`'s private field to detect a torn-down renderer with a proper `IRenderer.isDisposed()` port method — closes an engine-agnostic-core boundary leak found in the 2026-07-05 re-audit (see `docs/AUDIT_2026-07-05.md`).

3.19.0
---

### Video capture
* New **`captureVideo(options?)`** on the imperative handle — records the live canvas for a few seconds (default 3) via `MediaRecorder` + `canvas.captureStream` (zero dependencies) and resolves with the encoded clip: WebM in Chromium/Firefox, MP4 in Safari. Motion is captured as it happens — pair with `turntable` for a product-card orbit clip or `animations` for a character loop. Options: `duration`, `fps`, `mimeType` (auto-picks the best supported flavor), `videoBitsPerSecond`.
* The render loop is held continuous for the whole take (the `'video-capture'` reason), so clips come out full-motion even on otherwise idle static scenes; disposal mid-capture settles the promise with `INVALID_STATE` instead of leaving it dangling.
* Render-smoke proves the pipeline end to end in CI: a real 1.5 s turntable take must encode to a substantial `video/*` blob.

3.18.2
---

### Playground: motion demo
* The playground grew a **Motion** row — `turntable` and `animations` toggle chips that flip the live viewer props (no rebuild), plus the animated Khronos **Fox** sample (Survey/Walk/Run clips) to give the animations toggle something to show. The usage snippet is now live: it reflects the toggles you have on, so what you copy is what you see. Site-only change — nothing in the published package.

3.18.1
---

### README refresh
* Scannable **"What you get"** feature index; bundle-size badge + payload facts in the hero (~105 kB gzip core, lazy tracer/decoder chunks, pixel-asserting CI); **Next.js / SSR** dynamic-import recipe; imperative-handle and configuration docs caught up with the animation API; upgrading notes collapsed to "3.x → latest is additive".

3.18.0
---

### GLTF animation playback
* New **`animations`** prop on `SimpleViewer` — `<SimpleViewer object={url} animations />` plays ALL of the model's animation clips, looped, as soon as it loads. Works for GLTF files and for passed `THREE.Object3D`s carrying clips on `.animations`.
* **`options.animations`** for tuning: `autoplay: true | 'ClipName'` (one clip or all) and `speed` (playback rate, applied live). Toggling autoplay is live — pause/resume without a rebuild, like presets and the turntable.
* **Imperative control on the handle:** `getAnimationNames()`, `playAnimations(name?)`, `pauseAnimations()` — enough to build play/pause UI or clip pickers.
* Architecture: playback lives in `ThreeAnimationService` (an `AnimationMixer` behind the engine-agnostic `IAnimationService` port); the render loop holds an `'animations'` continuous-rendering reason while playing, composing with the turntable and path tracing instead of fighting them. The loader now copies `gltf.animations` onto the model root (the standard three convention).
* Render-smoke proves playback on real pixels: with `animations` on, frames captured 1 s apart must differ.

3.17.0
---

### Turntable auto-rotate
* New **`turntable`** prop on `SimpleViewer` — a one-word showcase mode that slowly orbits the camera around the model: `<SimpleViewer object={url} turntable />`. Equivalent to `options.controls.autoRotate: true` (which finally works — the option existed but was never applied); speed via `options.controls.autoRotateSpeed` (2 ≈ one orbit per 30 s). Rotation pauses automatically while the user drags and resumes on release. Toggling is **live** — like presets, flipping `turntable` (or `controls.autoRotate` / `autoRotateSpeed`) never rebuilds the viewer or reloads the model.
* The render loop now tracks continuous-rendering demand by named reason (path tracing, turntable), so one subsystem finishing cannot silently freeze another — a completed path-traced frame no longer stops a spinning turntable's loop.
* **Fixed:** with `staticScene: true`, a live option change (preset switch, background, turntable) arriving after idle detection had stopped the render loop repainted nothing — the dead frame chain ignored the request. `updateOptions` now revives the loop.
* Render-smoke now proves the rotation on real pixels: frames captured 1.5 s apart must differ.

3.16.6
---

### Tag-triggered npm release workflow (architecture roadmap item 3, final piece)
* New `Release` GitHub Actions workflow: pushing a `vX.Y.Z` tag publishes to npm (through the full `prepublishOnly` gate) and creates the GitHub release. It refuses to publish when the tag and `package.json` version disagree. Requires the `NPM_TOKEN` repository secret (npm automation token); until that secret exists the workflow is inert.

3.16.5
---

### Browser render-smoke CI (architecture roadmap item 8)
* New Playwright suite (`npm run test:render`) drives a self-contained harness page — the real viewer on a procedural torus knot, no network — in headless Chromium with software WebGL and asserts on **actual rendered pixels**: the default look paints a light background with the model covering a sane fraction of the frame, the dark preset is measurably darker than the default (range assertions, never exact pixels, so they hold across rasterizers), a `Hotspot` anchored at the origin lands horizontally centered on the model base, and `captureStill()` returns a substantial PNG. Any `console.error`/page error fails the suite. Runs as a parallel CI job; jest stays fast and jsdom-only. This closes the audit's "zero pixel observation" gap — a black-screen regression in the real Three.js adapters now fails CI instead of shipping.

3.16.4
---

### Hotspot projection math moved behind a core port (architecture roadmap item 12)
* `Hotspot` no longer imports Three.js. The per-frame work — projecting the anchor to canvas pixels, the behind-the-camera check and the occlusion raycast — moved to `ThreeAnchorProjector` (infrastructure) behind the new engine-agnostic `IAnchorProjector` port, obtained via `viewer.createAnchorProjector()`. The component is now pure React: it wires viewer events to DOM styles. Same view-state memoization (camera matrix + canvas size) and identical behavior; no API changes.

3.16.3
---

### SimpleViewer decomposed into focused hooks (architecture roadmap item 14)
* `SimpleViewer` shrank from 279 to 152 lines by lifting its four separable concerns into named, individually-tested hooks — no behavior or API change: **`usePickedPreset`** (the built-in picker's echo-aware selection state machine), **`useResolvedOptions`** (the `preset`/`pathTraced` prop-shorthand fold), **`useModelLoader`** (the keyed load effect + overlay load state) and **`useForwardedEvents`** (core→public event bridge). The component is now a thin composition over hooks plus the imperative handle and overlay chrome.

3.16.2
---

### Core type purity (architecture roadmap item 13)
* `RendererOptions` and `LightingOptions` no longer import `three`: `shadowMapType`/`toneMapping` are documented `number`s (the same THREE constants you already pass), `outputColorSpace` is a `string`, and a directional light's `position` is a shared `Vec3Like | [number, number, number]`. This stops the engine-agnostic core from transitively importing Three.js types through `SimpleViewerOptions` — and a new ESLint rule forbids `three` imports under `src/types/options` so it can't regress. Fully backward compatible: a `THREE.Vector3` or `THREE.PCFSoftShadowMap` still assigns exactly as before (pinned by a test).

3.16.1
---

### Disposal correctness batch + hygiene sweep (architecture roadmap items 10 & 15)
* **Fixed:** disposing a viewer while its path-traced screenshot was on show left the shared canvas `display: none` — the successor viewer React rebuilds on the same element rendered invisibly. `ScreenshotManager.dispose()` now unhides it.
* PMREM environment builds no longer leak one framebuffer per viewer: the render targets (not just their textures) are retained and disposed. `ThreeEnvironmentService` also refuses to cache a texture that finished loading after `dispose()` (StrictMode remounts / fast rebuilds).
* `disposeMaterial` walks `ShaderMaterial.uniforms` for textures (they are not direct properties). `ThreePathTracingService` lost its vestigial instance registry and now clears its event listeners on dispose.
* **Documented object ownership:** the viewer disposes geometries/materials/textures of `THREE.Object3D`s you pass when they are replaced or on unmount — pass a `.clone()` to keep the original.
* Hygiene: `src/core/events/ViewerEvents.ts` renamed to `CoreViewerEvents.ts` (two same-named files, one directory apart, was a landmine); `deepMerge` typed with an honest `DeepPartial<T>`; shared `Vec3Like` for the selection/event point payloads; the event-forwarding hook lost its `as never` casts; `ViewerGizmo` computes a declarative style instead of an eight-property effect; the glass/font chrome tokens are shared between the built-in picker and the site; ViewerCore test mock bases are typed as their ports so interface growth breaks compilation, not runtime.

3.16.0
---

### Path tracer no longer weighs down every consumer (architecture roadmap item 6)
* `three-gpu-pathtracer` was eagerly bundled into the entry chunk — ~49 kB gzip, about 40% of the payload — even for the vast majority of consumers who never enable path tracing. The tracer now lives in its own chunk behind a **dynamic import**: the new `LazyPathTracingService` facade loads the real service inside `initialize()` and delegates from then on (settings applied before the load finishes are replayed). **Base bundle: ~154 → ~105 kB gzip.** Same mechanism as the compression decoders; no API changes — `pathTracing.enabled` works exactly as before, the chunk just loads on demand.
* `ThreePathTracingService` is intentionally no longer re-exported from the infrastructure barrel (a static re-export would drag the tracer back into the entry chunk).

3.15.2
---

### One unwrap module, enforced layer boundaries (architecture roadmap items 4 & 7)
* The "call `getThreeX()` if present, else instanceof" adapter-unwrap duck-type was hand-rolled six times across two layers. It now lives once in `infrastructure/three/unwrap.ts` (`toThreeObject/Camera/Scene/Renderer/Controls`, null on miss); Hotspot, SimpleViewer, EventAdapter, ThreeSelectionService and ThreeSceneSetupService all delegate to it (EventAdapter keeps its non-null fallbacks on top).
* ESLint boundary rules now match the architecture: core rules cover `.tsx` and additionally ban `three-mesh-bvh` and site imports; new direction rules forbid infrastructure→presentation/site and presentation→site. All rules pass with zero violations.

3.15.1
---

### ViewerCore decomposed (architecture roadmap item 1)
* `ViewerCore` shrank from 947 to 585 lines by extracting two focused core modules, with **zero public-API changes**: **`PathTracingCoordinator`** owns the path-tracing lifecycle around the render loop (initialization, accumulation resets, PT-aware frame rendering, completion detection and its side effects), and **`CaptureController`** owns the whole `captureStill` subsystem (raster resize-render-restore cycle, the path-traced wait state machine, dispose settlement). Both are pinned with per-path coverage locks.
* Shared helpers extracted on the way: `applyCameraAspect` (used by resize and capture) and `canvasToPngDataUrl` (the empty-buffer guard, now shared with `ScreenshotManager` instead of duplicated). Dead `lastFrameTime` bookkeeping, an unreachable service-recreation branch and duplicated jsdocs are gone; the remaining service fields are `readonly`.

3.15.0
---

### Audit quick wins (architecture roadmap items 2, 5, 9, 11)
* **LICENSE file added** — the package always declared MIT but shipped no license text; the standard MIT license now lives at the repo root and in the npm tarball.
* **Unified imperative-handle errors:** `loadModel()` used to resolve silently when called before the viewer was ready, while `captureStill()` threw an untyped `Error`. Both now throw a typed `ThreeViewerError` with `ErrorCode.COMPONENT_NOT_MOUNTED`.
* **Structural/runtime contract fixed:** directly changing `renderer.toneMappingExposure` or `environment.environmentIntensity` no longer tears the viewer down — they ride the live `updateOptions` path (previously only preset switches did). `loaders` changes now correctly rebuild the viewer (they configure the loader at construction; before they were silently ignored).
* **Coverage ratchet turned:** global floors raised from 48/32/34/48 to 70/62/55/70 (%), with new per-path locks for `bvh.ts`, `ThreeSelectionService` and `Hotspot`. `prepublishOnly` now also runs the package smoke and type-smoke gates. Corrected the 3.5.0 CHANGELOG entry (that version never actually reached npm).

3.14.1
---

### Docs & metadata
* README rewritten as the package's storefront: hero shot linking to the live playground, badges, and sections for everything 3.8-3.14 shipped — presets and the built-in picker, `pathTraced` + `captureStill`, `<Hotspot>` + `object:selected`, BVH selection options. The stale pre-3.9 defaults block (CDN environment URL, old lighting values) is gone.
* `repository.url` normalized (`npm pkg fix`) so npm stops auto-correcting it at publish. Removed two unreferenced cover images. No library code changes.

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
* Bumped to `3.5.0` to re-align the published version. Versions 3.1–3.4 were developed but never published to the registry (which was stuck at `3.0.1`); 3.5.0 was intended as the first release to carry all of that work — the loading overlay (3.3.0), console-warning fixes (3.3.1), the NaN-bounding-sphere fix (3.3.2), and the compatibility widening above — in one clean, correctly-labeled version. (In the end nothing between 3.0.1 and 3.14.0 was published; 3.14.0 was the version that actually reached npm.)

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
