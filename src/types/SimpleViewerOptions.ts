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
  ControlsUIOptions,
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
   * Built-in control overlay — a floating toolbar (orbit/pan/zoom, screenshot,
   * fullscreen), a model-name badge, and a settings button. Opt-in: omitted /
   * `false` shows nothing, `true` enables all pieces, an object toggles them.
   */
  ui?: boolean | ControlsUIOptions;
}