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
  ViewerPreset,
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
   * Length unit the model geometry is authored in (default `'meters'`).
   * Non-meter models are rescaled on load — without touching the model's own
   * transform — to the viewer's 1-unit-=-1-meter convention that the
   * real-scale floor, contact shadows and framing rely on.
   */
  units?: ModelUnits;

  // Scene settings
  backgroundColor?: string | number;
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

  // Special features
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
   * Click-picking / hotspot-occlusion raycast tuning (e.g. `selection: { bvh:
   * false }` to skip the load-time BVH build on memory-constrained targets).
   */
  selection?: SelectionOptions;
}