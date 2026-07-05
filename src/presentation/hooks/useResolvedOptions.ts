import { useMemo } from 'react';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { ViewerPreset } from '../../types/options';

/**
 * Folds the `preset`, `pathTraced` and `turntable` prop shorthands into an
 * options object. `activePreset` overrides `options.preset`; `pathTraced`
 * sets `pathTracing.enabled` only when the consumer hasn't set it —
 * `mergeWithPreset` deep-merges this onto the defaults downstream, so the
 * default tuning (maxSamples/bounces) survives without being re-layered
 * here; `turntable` likewise sets `controls.autoRotate` only when the
 * consumer hasn't. The same `options` reference is returned when no
 * shorthand applies.
 */
export function useResolvedOptions(
  options: SimpleViewerOptions,
  activePreset: ViewerPreset | undefined,
  pathTraced: boolean | undefined,
  turntable: boolean | undefined,
  animations: boolean | undefined
): SimpleViewerOptions {
  return useMemo(() => {
    const presetChanged = options.preset !== activePreset;
    const foldPathTraced = pathTraced === true && options.pathTracing?.enabled === undefined;
    const foldTurntable =
      turntable !== undefined && options.controls?.autoRotate === undefined;
    const foldAnimations =
      animations !== undefined && options.animations?.autoplay === undefined;
    if (!presetChanged && !foldPathTraced && !foldTurntable && !foldAnimations) {
      return options;
    }
    return {
      ...options,
      ...(presetChanged ? { preset: activePreset } : {}),
      ...(foldPathTraced
        ? { pathTracing: { ...options.pathTracing, enabled: true } }
        : {}),
      ...(foldTurntable
        ? { controls: { ...options.controls, autoRotate: turntable } }
        : {}),
      ...(foldAnimations
        ? { animations: { ...options.animations, autoplay: animations } }
        : {}),
    };
  }, [options, activePreset, pathTraced, turntable, animations]);
}
