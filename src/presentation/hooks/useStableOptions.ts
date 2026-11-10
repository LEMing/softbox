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
import { DEFAULT_SCENE } from '../../scenes';

export interface StableOptions {
  options: SimpleViewerOptions;
  structuralKey: string;
  runtimeKey: string;
}

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
  const structuralKey = useMemo(
    () =>
      JSON.stringify({
        pathTracing: structuralPart(options.pathTracing, ...RUNTIME_PATH_TRACING_FIELDS),
        staticScene: options.staticScene,
        renderer: structuralPart(options.renderer, ...RUNTIME_RENDERER_FIELDS),
        camera: options.camera,
        controls: structuralPart(options.controls, ...RUNTIME_CONTROLS_FIELDS),
        environment: structuralPart(options.environment, ...RUNTIME_ENVIRONMENT_FIELDS),
        scene: options.scene ?? DEFAULT_SCENE,
        lighting: options.lighting,
        helpers: structuralPart(options.helpers, 'gizmo'),
        rendering: options.rendering,
        replaceWithScreenshotOnComplete: options.replaceWithScreenshotOnComplete,
        loaders: options.loaders,
        units: options.units ?? 'meters',
        floorAlignment: options.floorAlignment ?? true,
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

  const runtimeKey = useMemo(() => {
    const merged = mergeWithPreset(defaultOptions, options);
    return JSON.stringify(pickRuntimeOptions(merged));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the runtime set is fully determined by these inputs; depending on `options` would recompute on every unrelated change.
  }, [options.preset, options.backgroundColor, options.backgroundColorEdge, options.variant, options.renderer, options.environment, options.controls, options.animations, options.pathTracing]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- the keys are content hashes of `options`; depending on `options` itself would defeat the stable reference.
  const stableOptionsRef = useMemo(() => options, [structuralKey, runtimeKey]);

  return { options: stableOptionsRef, structuralKey, runtimeKey };
}
