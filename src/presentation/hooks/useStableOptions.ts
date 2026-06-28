import { useMemo } from 'react';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';

export interface StableOptions {
  /** Stable options reference; identity only changes when a key below changes. */
  options: SimpleViewerOptions;
  /** Changes when an option that requires a full viewer rebuild changes. */
  structuralKey: string;
  /** Changes when a runtime-tunable option changes (applied without rebuild). */
  runtimeKey: string;
}

/**
 * Splits options into a "structural" set (which requires recreating the viewer)
 * and a "runtime" set (which can be applied to a live viewer). This prevents a
 * cheap change like the background color from tearing down the WebGLRenderer and
 * re-fetching the model.
 */
export function useStableOptions(options: SimpleViewerOptions): StableOptions {
  const structuralKey = useMemo(
    () =>
      JSON.stringify({
        pathTracing: options.pathTracing,
        staticScene: options.staticScene,
        renderer: options.renderer,
        camera: options.camera,
        controls: options.controls,
        environment: options.environment,
        lighting: options.lighting,
        helpers: options.helpers,
      }),
    [
      options.pathTracing,
      options.staticScene,
      options.renderer,
      options.camera,
      options.controls,
      options.environment,
      options.lighting,
      options.helpers,
    ]
  );

  const runtimeKey = useMemo(
    () => JSON.stringify({ backgroundColor: options.backgroundColor }),
    [options.backgroundColor]
  );

  // Recomputed only when a structural or runtime key changes, so the returned
  // reference stays stable across unrelated parent re-renders.
  const stableOptionsRef = useMemo(() => options, [structuralKey, runtimeKey]);

  return { options: stableOptionsRef, structuralKey, runtimeKey };
}
