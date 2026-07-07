import { SimpleViewerOptions } from './types/SimpleViewerOptions';
import { ControlType } from './types/options/ControlsOptions';

/**
 * Default options using the new format structure
 */
const defaultOptions: SimpleViewerOptions = {
  // Scene settings
  staticScene: false,
  backgroundColor: '#f0f0f7',
  // Off by default since path tracing became interactive: the converged
  // frame stays live on the canvas and re-accumulates on camera moves. The
  // legacy DOM-snapshot overlay blocked interaction behind an <img> and
  // reloaded the whole model on the first click.
  replaceWithScreenshotOnComplete: false,
  // Authored unit of incoming models; non-meter models are rescaled on load
  // to the viewer's 1-unit-=-1-meter convention (real-scale floor, shadows).
  units: 'meters',

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
    // The studio environment (RoomEnvironment) is the primary light source, so
    // keep image-based lighting moderate — at 1.0 it blows out PBR materials.
    environmentIntensity: 0.7,
  },

  // Lighting: the studio environment does most of the work, so the explicit
  // lights are subtle accents (not a second full light rig). A single directional
  // key light gives form and shadows; ambient/hemisphere just lift the shadows.
  lighting: {
    ambientLight: {
      color: '#404040',
      intensity: 0.3,
    },
    hemisphereLight: {
      skyColor: '#ffffbb',
      groundColor: '#080820',
      intensity: 0.3,
    },
    directionalLight: {
      color: '#ffffff',
      intensity: 2,
      // Steeper than a 45-degree key light so the cast shadow falls mostly
      // directly under the model (a tight contact shadow) instead of
      // streaking off to one side.
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
        // PCF's stochastic kernel reads soft rather than grainy at this
        // radius now that the shadow camera frustum adapts to the loaded
        // object's size (fitShadowCameraToObject) instead of a fixed ±50
        // world-space span, so texel density stays high regardless of scale.
        radius: 14,
      },
    },
  },

  // Renderer
  renderer: {
    antialias: true,
    alpha: false,
    shadowMapEnabled: true,
    pixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1,
    // Tried VSMShadowMap for a naturally softer penumbra at large radii —
    // reverted: its variance estimate goes numerically unstable across this
    // library's wide range of object/scene scales, producing visible
    // diagonal banding across the whole floor (reproduced consistently with
    // small sample models; gone immediately on switching back to PCF).
    // PCFShadowMap's small stochastic kernel is grainier at very large
    // radii, but now that the shadow camera frustum adapts to the loaded
    // object's size (see fitShadowCameraToObject), texel density is high
    // enough that a moderate radius already reads soft and clean.
    shadowMapType: 1, // PCFShadowMap
    toneMapping: 6, // ACESFilmicToneMapping
    toneMappingExposure: 1.1,
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
      type: 'hexagonal_glass', // Matte concrete-look hex floor that catches the model's shadow. Options: 'square_wire', 'hexagonal_wire', 'hexagonal_glass', 'stone_tiles'
      size: 20,              // Grid size (triggers default grid creation)
      divisions: 20,         // Grid divisions
      colorGrid: '#a8a8a2',  // Concrete grey
      opacity: 0.5,          // Grid opacity
      styleOptions: {
        // A real, specific physical object — the NYC hexagonal sidewalk
        // paver — 8 inches across flats per the NYC Street Design Manual
        // (DOT Standard Highway Specifications §3.04/6.60), edge length
        // 8/sqrt(3) in ≈ 0.1173m. Fixed on purpose: it's a scale reference,
        // like a ruler, so it must NOT resize to match whatever model is on
        // it — a small object correctly looks small next to a full-size
        // paver, the same way it would on a real sidewalk.
        tileSize: 0.1173,
        metalness: 0,
        roughness: 0.9,
        transmission: 0,     // Opaque — matte concrete rather than glass
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
