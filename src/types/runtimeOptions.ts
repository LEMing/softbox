import { SimpleViewerOptions } from './SimpleViewerOptions';

/**
 * Single source of truth for which `SimpleViewerOptions` fields are
 * runtime-tunable — applicable to a live viewer via `ViewerCore.updateOptions()`
 * without rebuilding it. Consumed by `useStableOptions` (to exclude these from
 * the structural key and build the runtime key) and `useViewerCore` (to build
 * the runtime-apply effect's payload), so a new runtime field is added here
 * once instead of being hand-copied across both hooks.
 */
// animations has no non-runtime fields, so unlike its siblings it needs no
// entry here — useStableOptions never has to strip anything from it via
// structuralPart.
export const RUNTIME_RENDERER_FIELDS = ['toneMappingExposure'] as const;
export const RUNTIME_ENVIRONMENT_FIELDS = ['environmentIntensity'] as const;
export const RUNTIME_CONTROLS_FIELDS = ['autoRotate', 'autoRotateSpeed'] as const;
// `enabled` toggles the tracer on a live viewer (no rebuild, no model refetch);
// the other pathTracing fields configure the tracer at construction and stay
// structural.
export const RUNTIME_PATH_TRACING_FIELDS = ['enabled'] as const;

/** Extracts just the runtime-tunable fields from a resolved options object. */
export function pickRuntimeOptions(options: SimpleViewerOptions): Partial<SimpleViewerOptions> {
  const runtime: Partial<SimpleViewerOptions> = {
    backgroundColor: options.backgroundColor,
  };
  if (options.renderer?.toneMappingExposure !== undefined) {
    runtime.renderer = { toneMappingExposure: options.renderer.toneMappingExposure };
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
