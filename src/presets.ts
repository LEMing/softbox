import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ViewerPreset } from './types/options';
import { deepMerge } from './utils/deepMerge';
import { resolveScene } from './scenes';

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

export function resolvePreset(preset?: ViewerPreset): Partial<SimpleViewerOptions> {
  if (!preset) {
    return {};
  }
  return VIEWER_PRESETS[preset] ?? {};
}

export function mergeWithPreset(
  defaults: SimpleViewerOptions,
  options: SimpleViewerOptions
): SimpleViewerOptions {
  const withScene = deepMerge(defaults, resolveScene(options.scene));
  return deepMerge(deepMerge(withScene, resolvePreset(options.preset)), options);
}
