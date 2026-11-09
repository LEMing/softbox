import { useMemo } from 'react';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { ViewerPreset } from '../../types/options';

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
