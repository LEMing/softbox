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
// The post-processing effects are runtime: toggling one swaps the composer
// pipeline on the live renderer (ThreeRendererAdapter.setPostProcessing) —
// tearing down the whole viewer (and re-fetching the model) for a display-
// space effect would be the aspect-stretch class of over-rebuild.
export const RUNTIME_RENDERER_FIELDS = [
  'toneMappingExposure',
  'bloom',
  'vignette',
  'filmGrain',
  'colorGrade',
] as const;
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
    backgroundColorEdge: options.backgroundColorEdge,
  };
  // Emitted only when the consumer expresses the option: an absent prop is
  // "uncontrolled" and must not clobber a variant picked imperatively via
  // handle.setVariant() when an unrelated runtime prop changes. The
  // declarative reset is an explicit `variant: null` (resolved from
  // undefined here because deepMerge ignores undefined — the
  // backgroundColorEdge lesson).
  if ('variant' in options) {
    runtime.variant = options.variant ?? null;
  }
  // The effect toggles are always emitted resolved-to-boolean (`?? false`), so
  // REMOVING an effect from the options turns it off on the live viewer —
  // deepMerge ignores `undefined`, which would otherwise leave it stuck on
  // (the backgroundColorEdge lesson). updateOptions guards against re-sends
  // of an unchanged set, so the constant emission costs nothing per update.
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
