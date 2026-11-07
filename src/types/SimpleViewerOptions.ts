import {
  CameraOptions,
  ControlsOptions,
  EnvironmentOptions,
  HelperOptions,
  LightingOptions,
  PathTracingOptions,
  RendererOptions,
  RenderingOptions,
  LoadingIndicatorOptions,
  LoaderOptions,
  SelectionOptions,
  UIOptions,
  AROptions,
  ViewerPreset,
  ViewerScene,
  AnimationOptions,
} from './options';

/** Length unit the model's geometry is authored in. */
export type ModelUnits = 'meters' | 'centimeters' | 'millimeters' | 'feet' | 'inches';

export interface SimpleViewerOptions {
  /**
   * A one-word visual preset (`studio`, `product`, `neutral`, `dark`, `outdoor`)
   * that sets a cohesive lighting/environment/tone look. Any other option you
   * pass overrides the preset's values.
   */
  preset?: ViewerPreset;

  /**
   * A one-word scene (`studio_dome`, `studio_soft`) that selects the physical
   * set — floor, backdrop and how the studio environment is built. The
   * structural counterpart of `preset`: switching a scene rebuilds the viewer.
   * Any other option you pass overrides the scene's values.
   */
  scene?: ViewerScene;

  /**
   * KHR_materials_variants variant to show (e.g. a product colorway baked
   * into the GLB). Applies LIVE — switching never rebuilds the viewer or
   * reloads the model. `null` shows the authored default materials; leaving
   * the option out is "uncontrolled" (an imperative `handle.setVariant()`
   * pick survives other option changes); an unknown name warns and keeps
   * the defaults. Enumerate the model's variants via
   * `handle.getVariantNames()`.
   */
  variant?: string | null;

  /**
   * Length unit the model geometry is authored in (default `'meters'`).
   * Non-meter models are rescaled on load — without touching the model's own
   * transform — to the viewer's 1-unit-=-1-meter convention that the
   * real-scale floor, contact shadows and framing rely on.
   */
  units?: ModelUnits;

  /**
   * Drop the loaded model onto the floor at y=0 on load (default `true`). Set
   * `false` for a model that carries its own ground and must keep its authored
   * Y — otherwise softbox snaps the model's lowest point (e.g. the bottom of an
   * embedded ground slab) to the floor, shifting everything above it upward.
   */
  floorAlignment?: boolean;

  // Scene settings
  backgroundColor?: string | number;
  /**
   * Optional darker edge colour for a RADIAL backdrop vignette. When set,
   * `backgroundColor` is painted as the centre (behind the subject) and this as
   * the corners/bottom, floating the model in a soft cove instead of a flat
   * fill. Omit for a flat background. Runtime-tunable (applies on a live preset
   * switch without a rebuild), same as `backgroundColor`.
   */
  backgroundColorEdge?: string | number;
  staticScene?: boolean;

  // Component options
  /** GLTF animation playback (autoplay, speed). */
  animations?: AnimationOptions;
  camera?: CameraOptions;
  controls?: ControlsOptions;
  environment?: EnvironmentOptions;
  helpers?: HelperOptions;
  lighting?: LightingOptions;
  pathTracing?: PathTracingOptions;
  renderer?: RendererOptions;
  rendering?: RenderingOptions;

  // Callbacks
  /** Called when a model finishes loading (each load, including replacements). */
  onLoad?: () => void;
  /**
   * Download progress for URL-loaded models as a 0–1 fraction. Only called
   * when the server reports a total size (Content-Length).
   */
  onProgress?: (progress: number) => void;
  /**
   * Called on viewer construction/initialization failures (e.g. WebGL
   * unavailable) and on model load errors. The built-in overlay shows an
   * error state either way; use this to render your own affordance or report.
   */
  onError?: (error: Error) => void;
  /**
   * @deprecated Never functional since the 3.x architecture rewrite — the
   * render loop is fully managed (turntable/animations/path tracing drive it).
   * Ignored; will be removed in 5.0.
   */
  animationLoop?: ((time: number) => void) | null;

  /**
   * Replace the canvas with an `<img>` snapshot when a path-traced
   * accumulation completes; the first click restores the live viewer by
   * reloading the model (default `false`). A legacy from one-shot path
   * tracing — the interactive tracer keeps the converged frame on the live
   * canvas and re-accumulates on camera moves, so most consumers should
   * leave this off.
   */
  replaceWithScreenshotOnComplete?: boolean;

  /**
   * When to boot the WebGL engine and fetch the model (default `'eager'`).
   * `'lazy'` defers everything until the viewer first approaches the
   * viewport (like `<img loading="lazy">`) — on pages with many viewers
   * only the visible ones pay for a GL context and a model download. Once
   * booted a viewer stays booted; where IntersectionObserver is unavailable
   * the option gracefully degrades to eager.
   */
  loading?: 'eager' | 'lazy';

  /**
   * Built-in loading overlay shown while a model loads. `true`/omitted shows the
   * default spinner; `false` hides it (render your own via the loading events);
   * an object customizes it. UI-only — changing it never rebuilds the viewer.
   */
  loadingIndicator?: boolean | LoadingIndicatorOptions;

  /**
   * Compression decoders for the glTF/GLB loader (DRACO, KTX2/Basis, Meshopt).
   * All enabled by default so compressed assets load with no setup; pass this to
   * disable a decoder or self-host the DRACO/KTX2 WebAssembly files offline.
   */
  loaders?: LoaderOptions;

  /**
   * Built-in UI chrome over the canvas (e.g. `ui: { presets: true }` for the
   * live preset picker). All opt-in; UI-only — never rebuilds the viewer.
   */
  ui?: UIOptions;

  /**
   * Poster image (URL) shown over the canvas until the model's first painted
   * frame. Composes with `loading: 'lazy'`: the poster is the instant,
   * WebGL-free first paint while the real viewer boots and the GLB
   * downloads. Generate one with `handle.captureStill()`. Stays up as the
   * backdrop if the load errs (the error overlay renders above it).
   * UI-only — changing it never rebuilds the viewer.
   */
  poster?: string;

  /**
   * AR handoff button: opens the model in the platform's native AR viewer —
   * AR Quick Look on iOS (needs `iosSrc`, a USDZ counterpart), Scene Viewer
   * on Android (reuses the model's own URL). `true` enables with defaults.
   * The button renders only on devices that can actually hand off, so it is
   * safe to set unconditionally. UI-only — never rebuilds the viewer.
   */
  ar?: boolean | AROptions;

  /**
   * Click-picking / hotspot-occlusion raycast tuning (e.g. `selection: { bvh:
   * false }` to skip the load-time BVH build on memory-constrained targets).
   */
  selection?: SelectionOptions;
}