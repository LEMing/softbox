import {
  CameraOptions,
  ControlsOptions,
  EnvironmentOptions,
  HelperOptions,
  LightingOptions,
  PathTracingOptions,
  RendererOptions,
  RenderingOptions,
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
}