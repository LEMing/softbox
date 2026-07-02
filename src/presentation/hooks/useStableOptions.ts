import { useMemo } from 'react';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import defaultOptions from '../../defaultOptions';
import { mergeWithPreset } from '../../presets';

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
  // Construction-time options: a change requires rebuilding the viewer. Note
  // callbacks (onLoad/onProgress/onError) and animationLoop are intentionally
  // excluded — they are read at construction and would churn on identity change.
  // UI-only options (loadingIndicator, ui) are also excluded on purpose: they
  // are React chrome over the canvas and must never rebuild the viewer.
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
        rendering: options.rendering,
        replaceWithScreenshotOnComplete: options.replaceWithScreenshotOnComplete,
        selection: options.selection,
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
      options.rendering,
      options.replaceWithScreenshotOnComplete,
      options.selection,
    ]
  );

  // Runtime-tunable look, resolved through the preset so switching a preset
  // (studio → dark, …) applies live via updateOptions instead of rebuilding.
  const runtimeKey = useMemo(() => {
    const merged = mergeWithPreset(defaultOptions, options);
    return JSON.stringify({
      backgroundColor: merged.backgroundColor,
      toneMappingExposure: merged.renderer?.toneMappingExposure,
      environmentIntensity: merged.environment?.environmentIntensity,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the look is fully determined by these three inputs; depending on `options` would recompute on every unrelated change.
  }, [options.preset, options.backgroundColor, options.renderer, options.environment]);

  // Recomputed only when a structural or runtime key changes, so the returned
  // reference stays stable across unrelated parent re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the keys are content hashes of `options`; depending on `options` itself would defeat the stable reference.
  const stableOptionsRef = useMemo(() => options, [structuralKey, runtimeKey]);

  return { options: stableOptionsRef, structuralKey, runtimeKey };
}
