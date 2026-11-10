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

export type ModelUnits = 'meters' | 'centimeters' | 'millimeters' | 'feet' | 'inches';

export interface SimpleViewerOptions {
  preset?: ViewerPreset;

  scene?: ViewerScene;

  variant?: string | null;

  units?: ModelUnits;

  floorAlignment?: boolean;

  backgroundColor?: string | number;
  backgroundColorEdge?: string | number;
  staticScene?: boolean;

  animations?: AnimationOptions;
  camera?: CameraOptions;
  controls?: ControlsOptions;
  environment?: EnvironmentOptions;
  helpers?: HelperOptions;
  lighting?: LightingOptions;
  pathTracing?: PathTracingOptions;
  renderer?: RendererOptions;
  rendering?: RenderingOptions;

  onLoad?: () => void;
  onProgress?: (progress: number) => void;
  onError?: (error: Error) => void;
  /**
   * @deprecated Never functional since the 3.x architecture rewrite — the
   * render loop is fully managed (turntable/animations/path tracing drive it).
   * Ignored; will be removed in 5.0.
   */
  animationLoop?: ((time: number) => void) | null;

  replaceWithScreenshotOnComplete?: boolean;

  loading?: 'eager' | 'lazy';

  loadingIndicator?: boolean | LoadingIndicatorOptions;

  loaders?: LoaderOptions;

  ui?: UIOptions;

  poster?: string;

  ar?: boolean | AROptions;

  selection?: SelectionOptions;
}