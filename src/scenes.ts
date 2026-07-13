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
/**
 * The daylight HDRI `outdoor_concrete` lights with when no explicit
 * `environment.url` is given: a bright partly-cloudy sky (CC0, Poly Haven;
 * the projection shows its soft open terrain at the horizon), fetched on
 * demand from their CDN — the one network request the outdoor scene makes.
 * Pass your own `environment.url` to override or self-host, exactly like
 * the DRACO/KTX2 decoder paths. (Urban candidates — potsdamer_platz,
 * quarry_01 — were rejected visually: dusk-dark and olive-tinted grounds.)
 */
export const DEFAULT_OUTDOOR_HDRI_URL =
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/kloofendal_48d_partly_cloudy_puresky_1k.hdr';

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
  // Open air: the HDRI lights the model AND paints the sky (an env-map URL
  // owns the background, so the preset backdrop color is not used), the model
  // stands on a large matte concrete ground disc. The studio rig steps back —
  // daylight comes from the HDRI; a restrained key keeps a readable cast
  // shadow on the ground, and the studio rim/fill would fight the sky.
  outdoor_concrete: {
    helpers: { grid: { type: 'concrete_disc' }, studioEnvironment: false },
    // Ground projection stands the model IN the HDRI world (no hard horizon
    // edge); the disc's rim fade dissolves the near concrete into it.
    environment: { url: DEFAULT_OUTDOOR_HDRI_URL, groundProjection: true },
    lighting: {
      ambientLight: { intensity: 0.25 },
      hemisphereLight: { intensity: 0.45 },
      // The "sun": bright enough to read as daylight over the HDRI's IBL and
      // to cast the crisp ground shadow open air is expected to have.
      directionalLight: { intensity: 2.2 },
      fillLight: { intensity: 0.3 },
      rimLight: { intensity: 0.3 },
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
