import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ViewerPreset } from './types/options';
import { deepMerge } from './utils/deepMerge';
import { resolveScene } from './scenes';

/**
 * Visual presets: cohesive deltas layered over the defaults (deep-merged) so a
 * model looks intentional on first paint. Each preset only sets **runtime** look
 * fields — background color (plus an optional radial-vignette edge colour),
 * tone-mapping exposure and environment intensity — so switching presets is
 * applied live (no viewer rebuild, no model reload) and everything else (camera
 * auto-framing, lighting rig, controls, grid) is inherited from the defaults.
 * Explicit user options always win.
 */
export const VIEWER_PRESETS: Record<ViewerPreset, Partial<SimpleViewerOptions>> = {
  studio: {
    backgroundColor: '#f0f0f7',
    renderer: { toneMappingExposure: 1.15 },
    environment: { environmentIntensity: 0.5 },
  },
  product: {
    backgroundColor: '#ffffff',
    renderer: { toneMappingExposure: 1.2 },
    environment: { environmentIntensity: 0.55 },
  },
  neutral: {
    backgroundColor: '#d9d9de',
    renderer: { toneMappingExposure: 1.1 },
    environment: { environmentIntensity: 0.45 },
  },
  dark: {
    // A radial cove: a slightly-lifted centre behind the subject falling off to
    // a near-black edge, so the model floats in a dark studio instead of on a
    // flat grey scrim. Lower env intensity + a touch more exposure deepen the
    // contrast while keeping the subject bright — a punchier hero read.
    backgroundColor: '#242430',
    backgroundColorEdge: '#050507',
    renderer: { toneMappingExposure: 1.3 },
    environment: { environmentIntensity: 0.42 },
  },
  outdoor: {
    backgroundColor: '#bcd4e6',
    renderer: { toneMappingExposure: 1.2 },
    environment: { environmentIntensity: 0.6 },
  },
};

/** The partial options for a preset, or an empty object when none is set. */
export function resolvePreset(preset?: ViewerPreset): Partial<SimpleViewerOptions> {
  return preset ? VIEWER_PRESETS[preset] : {};
}

/**
 * Layer the resolved look in four stages: `defaults`, then the chosen scene
 * (the structural set), then the chosen preset (deep-merged so it only tweaks
 * the fields that define its look), then the caller's explicit `options` on
 * top (they always win). Scene and preset never overlap — scenes set only
 * structural fields, presets only runtime ones, each pinned by a test.
 * Single source of truth for both viewer construction and the runtime
 * look-update path.
 */
export function mergeWithPreset(
  defaults: SimpleViewerOptions,
  options: SimpleViewerOptions
): SimpleViewerOptions {
  const withScene = deepMerge(defaults, resolveScene(options.scene));
  return deepMerge(deepMerge(withScene, resolvePreset(options.preset)), options);
}
