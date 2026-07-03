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

export interface SimpleViewerOptions {
  /**
   * A one-word visual preset (`studio`, `product`, `neutral`, `dark`, `outdoor`)
   * that sets a cohesive lighting/environment/tone look. Any other option you
   * pass overrides the preset's values.
   */
  preset?: ViewerPreset;

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
  onLoad?: () => void;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  animationLoop?: ((time: number) => void) | null;
  
  // Special features
  replaceWithScreenshotOnComplete?: boolean;

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