import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ControlType } from './types/options/ControlsOptions';
import { DEFAULT_STUDIO_LOOK } from './types/options/EnvironmentOptions';

const defaultOptions: SimpleViewerOptions = {
  staticScene: false,
  backgroundColor: '#f0f0f7',
  replaceWithScreenshotOnComplete: false,
  units: 'meters',

  floorAlignment: true,

  pathTracing: {
    enabled: false,
    maxSamples: 1024,
    bounces: 16,
    transmissiveBounces: 4,
    renderScale: 0.8,
    lowResScale: 0.25,
    dynamicLowRes: true,
  },

  camera: {
    position: [60, 60, 60],
    target: [0, 0, 0],
    fov: 30,
    near: 0.1,
    far: 100000,
    autoFitToObject: true,
  },

  environment: {
    backgroundIntensity: 1,
    environmentIntensity: 0.5,
    studioLook: DEFAULT_STUDIO_LOOK,
  },

  lighting: {
    ambientLight: {
      color: '#4a4a4a',
      intensity: 0.32,
    },
    hemisphereLight: {
      skyColor: '#fff6ec',
      groundColor: '#3c3630',
      intensity: 0.3,
    },
    directionalLight: {
      color: '#fff8f2',
      intensity: 2.4,
      position: [40, 90, 40],
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
        radius: 14,
      },
    },
    fillLight: {
      color: '#eef2ff',
      intensity: 0.6,
      position: [-55, 28, 34],
    },
    rimLight: {
      color: '#f2f6ff',
      intensity: 2.6,
      position: [18, 52, -72],
    },
  },

  renderer: {
    antialias: true,
    alpha: false,
    shadowMapEnabled: true,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    shadowMapType: 1,
    toneMapping: 7,
    toneMappingExposure: 1.15,
  },

  controls: {
    type: ControlType.OrbitControls,
    enabled: true,
    enableDamping: true,
    dampingFactor: 0.25,
    enableZoom: true,
    enableRotate: true,
    enablePan: true,
    maxPolarAngle: Math.PI / 2,
  },

  helpers: {
    grid: {
      type: 'shadow_floor',
      size: 20,
      divisions: 20,
      colorGrid: '#a8a8a2',
      opacity: 0.5,
      styleOptions: {
        tileSize: 0.1173,
        metalness: 0,
        roughness: 0.9,
        transmission: 0,
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
