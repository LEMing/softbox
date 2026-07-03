import { useMemo } from 'react';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { ViewerPreset } from '../../types/options';
import defaultOptions from '../../defaultOptions';

/**
 * Folds the `preset` and `pathTraced` prop shorthands into an options object.
 * `activePreset` overrides `options.preset`; `pathTraced` sets
 * `pathTracing.enabled` only when the consumer hasn't set it, layering over
 * the default tuning so enabling via the prop keeps maxSamples/bounces (a
 * consumer `options.pathTracing` otherwise replaces the default wholesale).
 * The same `options` reference is returned when neither shorthand applies.
 */
export function useResolvedOptions(
  options: SimpleViewerOptions,
  activePreset: ViewerPreset | undefined,
  pathTraced: boolean | undefined
): SimpleViewerOptions {
  return useMemo(() => {
    const presetChanged = options.preset !== activePreset;
    const foldPathTraced = pathTraced === true && options.pathTracing?.enabled === undefined;
    if (!presetChanged && !foldPathTraced) {
      return options;
    }
    return {
      ...options,
      ...(presetChanged ? { preset: activePreset } : {}),
      ...(foldPathTraced
        ? { pathTracing: { ...defaultOptions.pathTracing, ...options.pathTracing, enabled: true } }
        : {}),
    };
  }, [options, activePreset, pathTraced]);
}
