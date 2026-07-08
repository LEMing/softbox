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
    fov: 30,
    near: 0.1,
    far: 100000,
    autoFitToObject: true,
  },

  // Environment — no `url` by default: the procedural studio environment
  // (helpers.studioEnvironment) lights the scene with zero network requests.
  // Set `environment.url` to an HDR/EXR/image to use a custom environment map.
  environment: {
    backgroundIntensity: 1,
    // Kept moderate: environmentIntensity drives the IBL REFLECTION strength
    // as well as the fill, so pushing it high to brighten also makes the paint
    // read glossy/plasticky. Brightness instead comes from the diffuse
    // ambient/hemisphere fill below, keeping a bright-but-matte studio look.
    environmentIntensity: 0.5,
  },

  // Lighting: a near-neutral directional key gives gentle form and the contact
  // shadow, while a generous ambient/hemisphere fill keeps the shadowed side
  // and crevices bright and open — a soft high-key studio look. Warmth is left
  // to the model's own materials rather than a tinted key, so genuinely
  // white/neutral models are not pushed yellow.
  lighting: {
    ambientLight: {
      color: '#4a4a4a',
      intensity: 0.5,
    },
    hemisphereLight: {
      skyColor: '#fff6ec',
      // Warm-neutral bounce (not a cold blue, which cooled the shadowed side).
      groundColor: '#3c3630',
      intensity: 0.45,
    },
    directionalLight: {
      // Barely-warm, near-white key: enough to avoid a clinical cool cast but
      // not enough to tint the render orange — the model's albedo carries the
      // warmth. Restrained intensity so the specular hotspot stays soft.
      color: '#fff8f2',
      intensity: 1.9,
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
    // Khronos PBR Neutral (THREE.NeutralToneMapping = 7): keeps saturated
    // material colours through the highlight rolloff instead of clipping them
    // to white the way ACES does — the right operator for a product viewer.
    toneMapping: 7,
    toneMappingExposure: 1.15,
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
    // Stop the orbit at the horizon so the camera never dips below the floor
    // to look up at the model's underside from under the ground.
    maxPolarAngle: Math.PI / 2,
  },

  // Helpers
  helpers: {
    grid: {
      // A clean studio floor (invisible shadow catcher only): the model reads
      // as a product shot on the background with a soft contact shadow, not on
      // a patterned field. The real-scale hex-paver "ruler" floor is still one
      // option away — set type: 'hexagonal_glass'. Options: 'shadow_floor',
      // 'square_wire', 'hexagonal_wire', 'hexagonal_glass', 'stone_tiles'.
      type: 'shadow_floor',
      size: 20,              // Grid size (triggers default grid creation)
      divisions: 20,         // Grid divisions
      colorGrid: '#a8a8a2',  // Concrete grey (hex/tile floors only)
      opacity: 0.5,          // Grid opacity (hex/tile floors only)
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
