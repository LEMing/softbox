import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ViewerScene } from './types/options';

/**
 * Scenes: named SETS layered over the defaults (deep-merged), the structural
 * counterpart of `VIEWER_PRESETS`. Where a preset grades the picture (runtime
 * look fields, applied live), a scene selects the physical set the model
 * stands in — floor, backdrop and how the studio environment is built — so
 * each scene only sets **structural** fields and switching one rebuilds the
 * viewer. Explicit user options always win.
 */
export const VIEWER_SCENES: Record<ViewerScene, Partial<SimpleViewerOptions>> = {
  // The default set — mirrors the defaults, pinned by a test, so `scene:
  // 'studio_dome'` and no scene at all are the same viewer.
  studio_dome: {
    helpers: { grid: { type: 'shadow_floor' }, studioEnvironment: true },
    environment: { studioLook: 'crisp' },
  },
  // The same set lit softly — an overcast softbox studio instead of the hero
  // rig: the studio room is baked without the contrast push (even wraparound
  // light, no crisp panel highlights) AND the three-point rig is rebalanced —
  // the key steps back with a wider penumbra, the rim edge nearly goes, and
  // the fill/ambient open the shadow side. Matte, low-drama product read.
  studio_soft: {
    helpers: { grid: { type: 'shadow_floor' }, studioEnvironment: true },
    environment: { studioLook: 'soft' },
    lighting: {
      ambientLight: { intensity: 0.55 },
      hemisphereLight: { intensity: 0.6 },
      directionalLight: { intensity: 1.4, shadow: { radius: 26 } },
      fillLight: { intensity: 1.2 },
      rimLight: { intensity: 0.7 },
    },
  },
};

/** The scene every viewer stands in when none is set. */
export const DEFAULT_SCENE: ViewerScene = 'studio_dome';

/** The partial options for a scene, or an empty object when none is set. */
export function resolveScene(scene?: ViewerScene): Partial<SimpleViewerOptions> {
  if (!scene) {
    return {};
  }
  // Untyped JS consumers can pass any string; an unknown name must fall back
  // to the default set instead of leaking `undefined` into the merge chain.
  return VIEWER_SCENES[scene] ?? {};
}
