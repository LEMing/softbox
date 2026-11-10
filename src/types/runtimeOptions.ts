import { SimpleViewerOptions } from './SimpleViewerOptions';

export const RUNTIME_RENDERER_FIELDS = [
  'toneMappingExposure',
  'bloom',
  'vignette',
  'filmGrain',
  'colorGrade',
] as const;
export const RUNTIME_ENVIRONMENT_FIELDS = ['environmentIntensity'] as const;
export const RUNTIME_CONTROLS_FIELDS = ['autoRotate', 'autoRotateSpeed'] as const;
export const RUNTIME_PATH_TRACING_FIELDS = ['enabled'] as const;

export function pickRuntimeOptions(options: SimpleViewerOptions): Partial<SimpleViewerOptions> {
  const runtime: Partial<SimpleViewerOptions> = {
    backgroundColor: options.backgroundColor,
    backgroundColorEdge: options.backgroundColorEdge,
  };
  if ('variant' in options) {
    runtime.variant = options.variant ?? null;
  }
  runtime.renderer = {
    bloom: options.renderer?.bloom ?? false,
    vignette: options.renderer?.vignette ?? false,
    filmGrain: options.renderer?.filmGrain ?? false,
    colorGrade: options.renderer?.colorGrade ?? false,
  };
  if (options.renderer?.toneMappingExposure !== undefined) {
    runtime.renderer.toneMappingExposure = options.renderer.toneMappingExposure;
  }
  if (options.environment?.environmentIntensity !== undefined) {
    runtime.environment = { environmentIntensity: options.environment.environmentIntensity };
  }
  if (options.controls?.autoRotate !== undefined || options.controls?.autoRotateSpeed !== undefined) {
    runtime.controls = {
      autoRotate: options.controls?.autoRotate,
      autoRotateSpeed: options.controls?.autoRotateSpeed,
    };
  }
  if (options.animations?.autoplay !== undefined || options.animations?.speed !== undefined) {
    runtime.animations = {
      autoplay: options.animations?.autoplay,
      speed: options.animations?.speed,
    };
  }
  if (options.pathTracing?.enabled !== undefined) {
    runtime.pathTracing = { enabled: options.pathTracing.enabled };
  }
  return runtime;
}
