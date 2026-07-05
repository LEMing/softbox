import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ViewerPreset } from './types/options';
import { deepMerge } from './utils/deepMerge';

/**
 * Visual presets: cohesive deltas layered over the defaults (deep-merged) so a
 * model looks intentional on first paint. Each preset only sets **runtime** look
 * fields — background color, tone-mapping exposure and environment intensity —
 * so switching presets is applied live (no viewer rebuild, no model reload) and
 * everything else (camera auto-framing, lighting rig, controls, grid) is
 * inherited from the defaults. Explicit user options always win.
 */
export const VIEWER_PRESETS: Record<ViewerPreset, Partial<SimpleViewerOptions>> = {
  studio: {
    backgroundColor: '#f0f0f7',
    renderer: { toneMappingExposure: 1.1 },
    environment: { environmentIntensity: 0.7 },
  },
  product: {
    backgroundColor: '#ffffff',
    renderer: { toneMappingExposure: 1.25 },
    environment: { environmentIntensity: 0.85 },
  },
  neutral: {
    backgroundColor: '#d9d9de',
    renderer: { toneMappingExposure: 1 },
    environment: { environmentIntensity: 0.6 },
  },
  dark: {
    backgroundColor: '#1a1a1f',
    renderer: { toneMappingExposure: 1.15 },
    environment: { environmentIntensity: 0.8 },
  },
  outdoor: {
    backgroundColor: '#bcd4e6',
    renderer: { toneMappingExposure: 1.15 },
    environment: { environmentIntensity: 0.85 },
  },
};

/** The partial options for a preset, or an empty object when none is set. */
export function resolvePreset(preset?: ViewerPreset): Partial<SimpleViewerOptions> {
  return preset ? VIEWER_PRESETS[preset] : {};
}

/**
 * Layer the resolved look in three stages: `defaults`, then the chosen preset
 * (deep-merged so it only tweaks the fields that define its look), then the
 * caller's explicit `options` on top (they always win). Single source of truth
 * for both viewer construction and the runtime look-update path.
 */
export function mergeWithPreset(
  defaults: SimpleViewerOptions,
  options: SimpleViewerOptions
): SimpleViewerOptions {
  return deepMerge(deepMerge(defaults, resolvePreset(options.preset)), options);
}
