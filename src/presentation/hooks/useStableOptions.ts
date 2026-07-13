import { useMemo } from 'react';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import {
  RUNTIME_RENDERER_FIELDS,
  RUNTIME_ENVIRONMENT_FIELDS,
  RUNTIME_CONTROLS_FIELDS,
  RUNTIME_PATH_TRACING_FIELDS,
  pickRuntimeOptions,
} from '../../types/runtimeOptions';
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
/** The sub-object without its runtime-tunable fields; undefined when empty. */
const structuralPart = <T extends object>(part: T | undefined, ...runtimeFields: (keyof T)[]) => {
  if (!part) {
    return undefined;
  }
  const structural: Partial<T> = { ...part };
  for (const field of runtimeFields) {
    delete structural[field];
  }
  return Object.keys(structural).length > 0 ? structural : undefined;
};

export function useStableOptions(options: SimpleViewerOptions): StableOptions {
  // Construction-time options: a change requires rebuilding the viewer. Note
  // callbacks (onLoad/onProgress/onError) are intentionally excluded — they
  // are read live through a ref (useOptionCallbacks) and identity churn on
  // them must never rebuild the viewer.
  // UI-only options (loadingIndicator, ui) are also excluded on purpose: they
  // are React chrome over the canvas and must never rebuild the viewer.
  // `loading` is excluded too: it gates WHEN the first boot happens (consumed
  // directly by useViewerCore's viewport gate, which latches open) — changing
  // it later must neither rebuild nor tear down a booted viewer.
  const structuralKey = useMemo(
    () =>
      JSON.stringify({
        // pathTracing minus `enabled`: toggling the tracer applies live
        // (updateOptions) — flipping it must not rebuild or re-fetch the model.
        // The other fields (samples, bounces, …) configure the tracer at
        // construction, so a change to them still rebuilds.
        pathTracing: structuralPart(options.pathTracing, ...RUNTIME_PATH_TRACING_FIELDS),
        staticScene: options.staticScene,
        // renderer/environment minus their runtime-tunable fields: a direct
        // toneMappingExposure / environmentIntensity change is exactly what
        // the live updateOptions path exists for and must not rebuild.
        renderer: structuralPart(options.renderer, ...RUNTIME_RENDERER_FIELDS),
        camera: options.camera,
        // The turntable fields toggle live (updateOptions), like the look
        // fields — flipping auto-rotate must not reload the model.
        controls: structuralPart(options.controls, ...RUNTIME_CONTROLS_FIELDS),
        environment: structuralPart(options.environment, ...RUNTIME_ENVIRONMENT_FIELDS),
        // The scene selects the physical set (floor, backdrop, environment
        // build) — structural by definition. Normalized so absent and the
        // explicit default share a key.
        scene: options.scene ?? 'studio_dome',
        lighting: options.lighting,
        // helpers minus `gizmo`: the gizmo is React chrome over the canvas
        // (read live by SimpleViewer, touched by nothing in core), so toggling
        // it must not tear down the WebGL context and refetch the model.
        helpers: structuralPart(options.helpers, 'gizmo'),
        rendering: options.rendering,
        replaceWithScreenshotOnComplete: options.replaceWithScreenshotOnComplete,
        // The loader is constructed with these — changing them needs a rebuild.
        loaders: options.loaders,
        // The units conversion wraps the model at load time — changing it
        // needs a rebuild to re-wrap. Normalized so absent and explicit
        // 'meters' (the default) share a key.
        units: options.units ?? 'meters',
        // Consumed once at ModelManager construction and applied at load
        // time, exactly like `units`. Normalized: absent means enabled.
        floorAlignment: options.floorAlignment ?? true,
        // Normalized so absent / {} / { bvh: true } (all "BVH on") share a key
        // and only a real opt-out change rebuilds the viewer.
        selectionBvh: options.selection?.bvh !== false,
      }),
    [
      options.pathTracing,
      options.staticScene,
      options.renderer,
      options.camera,
      options.controls,
      options.environment,
      options.scene,
      options.lighting,
      options.helpers,
      options.rendering,
      options.replaceWithScreenshotOnComplete,
      options.loaders,
      options.units,
      options.floorAlignment,
      options.selection,
    ]
  );

  // Runtime-tunable look, resolved through the preset so switching a preset
  // (studio → dark, …) applies live via updateOptions instead of rebuilding.
  const runtimeKey = useMemo(() => {
    const merged = mergeWithPreset(defaultOptions, options);
    return JSON.stringify(pickRuntimeOptions(merged));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the runtime set is fully determined by these inputs; depending on `options` would recompute on every unrelated change.
  }, [options.preset, options.backgroundColor, options.backgroundColorEdge, options.renderer, options.environment, options.controls, options.animations, options.pathTracing]);

  // Recomputed only when a structural or runtime key changes, so the returned
  // reference stays stable across unrelated parent re-renders.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- the keys are content hashes of `options`; depending on `options` itself would defeat the stable reference.
  const stableOptionsRef = useMemo(() => options, [structuralKey, runtimeKey]);

  return { options: stableOptionsRef, structuralKey, runtimeKey };
}
