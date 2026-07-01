import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ViewerPreset } from './types/options';

/**
 * Visual presets: cohesive deltas layered over the defaults (deep-merged) so a
 * model looks intentional on first paint. Each preset only sets the fields that
 * define its look — lighting, environment, tone mapping, background — and
 * inherits everything else (camera auto-framing, controls, grid) from the
 * defaults. Explicit user options are applied on top and always win.
 */
export const VIEWER_PRESETS: Record<ViewerPreset, Partial<SimpleViewerOptions>> = {
  studio: {
    backgroundColor: '#f0f0f7',
    renderer: { toneMappingExposure: 1.2 },
    environment: { environmentIntensity: 1 },
    helpers: { studioEnvironment: true, darkStudioMode: false },
  },
  product: {
    backgroundColor: '#ffffff',
    renderer: { toneMappingExposure: 1.4 },
    environment: { environmentIntensity: 1.25 },
    helpers: { studioEnvironment: true, darkStudioMode: false },
  },
  neutral: {
    backgroundColor: '#d9d9de',
    renderer: { toneMappingExposure: 1 },
    environment: { environmentIntensity: 0.9 },
    helpers: { studioEnvironment: true, darkStudioMode: false },
  },
  dark: {
    renderer: { toneMappingExposure: 1.3 },
    environment: { environmentIntensity: 1.15 },
    helpers: { studioEnvironment: true, darkStudioMode: true },
  },
  outdoor: {
    backgroundColor: '#bcd4e6',
    renderer: { toneMappingExposure: 1.3 },
    environment: { environmentIntensity: 1.1 },
    lighting: {
      hemisphereLight: { skyColor: '#cfe6ff', groundColor: '#4a4a44', intensity: 1.4 },
    },
    helpers: { studioEnvironment: true, darkStudioMode: false },
  },
  photoreal: {
    pathTracing: { enabled: true },
    replaceWithScreenshotOnComplete: true,
    renderer: { toneMappingExposure: 1.2 },
    environment: { environmentIntensity: 1 },
    helpers: { studioEnvironment: true, darkStudioMode: false },
  },
};

/** The partial options for a preset, or an empty object when none is set. */
export function resolvePreset(preset?: ViewerPreset): Partial<SimpleViewerOptions> {
  return preset ? VIEWER_PRESETS[preset] : {};
}
