import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ControlType } from './types/options/ControlsOptions';

/**
 * Default options using the new format structure
 */
const defaultOptions: SimpleViewerOptions = {
  // Scene settings
  staticScene: false,
  backgroundColor: '#f0f0f7',
  replaceWithScreenshotOnComplete: true,
  animationLoop: null,

  // Path tracing
  pathTracing: {
    enabled: false,
    maxSamples: 16,
    bounces: 16,
    transmissiveBounces: 4,
    renderScale: 0.8,
    lowResScale: 0.25,
    dynamicLowRes: true,
  },

  // Camera
  camera: {
    position: [60, 60, 60],
    target: [0, 0, 0],
    fov: 45,
    near: 0.1,
    far: 100000,
    autoFitToObject: true,
  },

  // Environment — no `url` by default: the procedural studio environment
  // (helpers.studioEnvironment) lights the scene with zero network requests.
  // Set `environment.url` to an HDR/EXR/image to use a custom environment map.
  environment: {
    backgroundIntensity: 1,
    environmentIntensity: 1,
  },

  // Lighting (new format with corrected spelling)
  lighting: {
    ambientLight: {
      color: '#404040',
      intensity: Math.PI,
    },
    hemisphereLight: {
      skyColor: '#ffffbb',
      groundColor: '#080820',
      intensity: 1,
    },
    directionalLight: {
      color: '#ffffff',
      intensity: Math.PI,
      position: [72, 72, 72],
      castShadow: true,
      shadow: {
        mapSize: { width: 4096, height: 4096 },
        camera: {
          near: 0.5,
          far: 200,
          left: -50,
          right: 50,
          top: 50,
          bottom: -50
        },
        bias: -0.0001,
        radius: 1,
      },
    },
  },

  // Renderer
  renderer: {
    antialias: true,
    alpha: false,
    shadowMapEnabled: true,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    shadowMapType: 1, // PCFShadowMap (PCFSoftShadowMap is deprecated in three r183+)
    toneMapping: 6, // ACESFilmicToneMapping
    toneMappingExposure: 1.5,
  },

  // Controls
  controls: {
    type: ControlType.OrbitControls,
    enabled: true,
    enableDamping: true,
    dampingFactor: 0.25,
    enableZoom: true,
    enableRotate: true,
    enablePan: true,
  },

  // Helpers
  helpers: {
    grid: {
      type: 'hexagonal_wire', // Options: 'square_wire', 'hexagonal_wire', 'hexagonal_glass', 'stone_tiles'
      size: 20,              // Grid size (triggers default grid creation)
      divisions: 20,         // Grid divisions
      colorGrid: 0x444444,   // Grid color
      opacity: 0.5,          // Grid opacity
      styleOptions: {
        // Additional style-specific options can be added here
      }
    },
    axes: false,
    stats: false,
    gizmo: false,
    studioEnvironment: true,
    darkStudioMode: false,
  },
};

export default defaultOptions;
