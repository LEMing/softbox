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
} from './options';

export interface SimpleViewerOptions {
  // Scene settings
  backgroundColor?: string | number;
  staticScene?: boolean;

  // Component options
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
}