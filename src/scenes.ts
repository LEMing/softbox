import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ViewerScene } from './types/options';

export const DEFAULT_OUTDOOR_HDRI_URL =
  'https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr';

export const DEFAULT_OUTDOOR_CONCRETE_TEXTURES = {
  texture:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_02/concrete_floor_02_diff_1k.jpg',
  normalMap:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_02/concrete_floor_02_nor_gl_1k.jpg',
  roughnessMap:
    'https://dl.polyhaven.org/file/ph-assets/Textures/jpg/1k/concrete_floor_02/concrete_floor_02_rough_1k.jpg',
} as const;

export const VIEWER_SCENES: Record<ViewerScene, Partial<SimpleViewerOptions>> = {
  studio_dome: {
    helpers: { grid: { type: 'shadow_floor' }, studioEnvironment: true },
    environment: { studioLook: 'crisp' },
  },
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
  outdoor_concrete: {
    helpers: {
      grid: { type: 'concrete_disc', styleOptions: { ...DEFAULT_OUTDOOR_CONCRETE_TEXTURES } },
      studioEnvironment: true,
    },
    environment: { url: DEFAULT_OUTDOOR_HDRI_URL, groundProjection: true },
    lighting: {
      ambientLight: { intensity: 0.22 },
      hemisphereLight: { intensity: 0.38 },
      directionalLight: { intensity: 2.6, color: '#fff2e2', position: [-70, 52, 18] },
      fillLight: { intensity: 0.25 },
      rimLight: { intensity: 0.25 },
    },
  },
};

export const DEFAULT_SCENE: ViewerScene = 'studio_dome';

export function resolveScene(scene?: ViewerScene): Partial<SimpleViewerOptions> {
  if (!scene) {
    return {};
  }
  return VIEWER_SCENES[scene] ?? {};
}
