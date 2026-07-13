import { ViewerCore, ViewerDependencies } from '../ViewerCore';
import {
  IRenderer,
  IScene,
  ICamera,
  IControls,
  IModelLoader,
  IModel,
  IObject3D,
  IVector3,
  ITexture,
  IAnchorProjectionService,
  IAnchorProjector,
  Result,
} from '../interfaces';
import { IPathTracingService, PathTracingPausedEvent } from '../services/IPathTracingService';
import { IEnvironmentService } from '../services/IEnvironmentService';
import { ISceneSetupService } from '../services/ISceneSetupService';
import { IFloorAlignmentService } from '../services/IFloorAlignmentService';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { RenderLoopManager } from '../utils/RenderLoopManager';
import { PathTracingCoordinator } from '../PathTracingCoordinator';
import { ScreenshotManager } from '../managers/ScreenshotManager';
import { ModelManager } from '../managers/ModelManager';
import { ResourceManager } from '../managers/ResourceManager';

type Overrides = Record<string, unknown>;

const tick = async (count = 3): Promise<void> => {
  for (let i = 0; i < count; i += 1) {
    await Promise.resolve();
  }
};

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
}

const deferred = <T>(): Deferred<T> => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const makeVector3 = (): IVector3 => ({
  x: 0,
  y: 0,
  z: 0,
  set: jest.fn(),
  copy: jest.fn(),
  add: jest.fn(),
  multiply: jest.fn(),
  normalize: jest.fn(),
  length: jest.fn(() => 0),
});

const makeTexture = (): ITexture => ({
  id: 'texture',
  image: null,
  needsUpdate: false,
  dispose: jest.fn(),
});

const makeObject3D = (): IObject3D => ({
  id: 'object',
  name: 'object',
  visible: true,
  castShadow: false,
  receiveShadow: false,
  position: makeVector3(),
  rotation: makeVector3(),
  scale: makeVector3(),
  add: jest.fn(() => Result.ok(undefined)),
  remove: jest.fn(() => Result.ok(undefined)),
  traverse: jest.fn(),
  clone: jest.fn(() => makeObject3D()),
  dispose: jest.fn(),
});

const makeCanvas = (width = 800, height = 600): HTMLCanvasElement => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
};

const makeRenderer = (
  canvas: HTMLCanvasElement,
  overrides: Overrides = {}
): jest.Mocked<IRenderer> => {
  const internalRenderer = { autoClear: true };
  // Typed as the port so interface growth breaks compilation here, not at runtime.
  const base: IRenderer & { getInternalRenderer: jest.Mock } = {
    id: 'renderer',
    initialize: jest.fn(() => Result.ok(undefined)),
    render: jest.fn(() => Result.ok(undefined)),
    setSize: jest.fn(),
    setPixelRatio: jest.fn(),
    getPixelRatio: jest.fn(() => 1),
    setToneMappingExposure: jest.fn(),
    setPostProcessing: jest.fn(),
    getDomElement: jest.fn(() => canvas),
    getContext: jest.fn(() => null),
    dispose: jest.fn(),
    isDisposed: jest.fn(() => false),
    capabilities: {
      maxTextureSize: 4096,
      maxCubemapSize: 4096,
      maxAttributes: 16,
      maxVertexUniforms: 1024,
      maxFragmentUniforms: 1024,
      maxSamples: 4,
      isWebGL2: true,
    },
    getInternalRenderer: jest.fn(() => internalRenderer),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<IRenderer>;
};

const makeScene = (overrides: Overrides = {}): jest.Mocked<IScene> => {
  const base = {
    id: 'scene',
    name: 'scene',
    add: jest.fn(() => Result.ok(undefined)),
    remove: jest.fn(() => Result.ok(undefined)),
    clear: jest.fn(),
    disposeContents: jest.fn(),
    traverse: jest.fn(),
    background: null,
    fog: null,
    environment: null,
    setEnvironmentIntensity: jest.fn(),
    getInternalRenderer: jest.fn(() => null),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<IScene>;
};

const makeCamera = (overrides: Overrides = {}): jest.Mocked<ICamera> => {
  const base = {
    id: 'camera',
    name: 'camera',
    type: 'perspective',
    visible: true,
    near: 0.1,
    far: 1000,
    aspect: 1,
    position: makeVector3(),
    rotation: makeVector3(),
    scale: makeVector3(),
    lookAt: jest.fn(),
    updateProjectionMatrix: jest.fn(),
    getWorldDirection: jest.fn(),
    add: jest.fn(() => Result.ok(undefined)),
    remove: jest.fn(() => Result.ok(undefined)),
    traverse: jest.fn(),
    clone: jest.fn(),
    dispose: jest.fn(),
    getInternalRenderer: jest.fn(() => null),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<ICamera>;
};

const makeControls = (overrides: Overrides = {}): jest.Mocked<IControls> => {
  const base = {
    enabled: true,
    enableDamping: false,
    dampingFactor: 0.05,
    enableZoom: true,
    enableRotate: true,
    enablePan: true,
    zoomSpeed: 1,
    minDistance: 0,
    maxDistance: Infinity,
    rotateSpeed: 1,
    minPolarAngle: 0,
    maxPolarAngle: Math.PI,
    minAzimuthAngle: -Infinity,
    maxAzimuthAngle: Infinity,
    panSpeed: 1,
    screenSpacePanning: true,
    autoRotate: false,
    autoRotateSpeed: 2,
    target: makeVector3(),
    update: jest.fn(() => false),
    onChange: jest.fn(() => () => undefined),
    reset: jest.fn(),
    dispose: jest.fn(),
    connect: jest.fn(),
    disconnect: jest.fn(),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<IControls>;
};

const makeModelLoader = (overrides: Overrides = {}): jest.Mocked<IModelLoader> => {
  const base = {
    load: jest.fn(async () => Result.ok({ scene: makeObject3D(), animations: [] })),
    supports: jest.fn(() => true),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<IModelLoader>;
};

const makeSceneSetupService = (
  overrides: Overrides = {}
): jest.Mocked<ISceneSetupService> => {
  const base = {
    addHelpers: jest.fn(() => Result.ok(undefined)),
    addLighting: jest.fn(() => Result.ok(undefined)),
    createGradientBackground: jest.fn(() => Result.ok(undefined)),
    fitCameraToObject: jest.fn(() => Result.ok(undefined)),
    addDynamicGrid: jest.fn(() => Result.ok(undefined)),
    snapObjectToFloor: jest.fn(() => Result.ok(undefined)),
    fitShadowCameraToObject: jest.fn(() => Result.ok(undefined)),
    bakeContactShadow: jest.fn(() => Result.ok(undefined)),
    resetContactShadow: jest.fn(() => Result.ok(undefined)),
    setContactShadowMode: jest.fn(() => Result.ok(undefined)),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<ISceneSetupService>;
};

const makeEnvironmentService = (
  overrides: Overrides = {}
): jest.Mocked<IEnvironmentService> => {
  const base = {
    initialize: jest.fn(async () => Result.ok(undefined)),
    loadEnvironmentMap: jest.fn(async () => Result.ok(makeTexture())),
    applyToScene: jest.fn(() => Result.ok(undefined)),
    createStudioEnvironment: jest.fn(() => Result.ok(makeTexture())),
    setBackgroundImage: jest.fn(async () => Result.ok(undefined)),
    removeGroundProjection: jest.fn(),
    dispose: jest.fn(),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<IEnvironmentService>;
};

const makeFloorAlignmentService = (
  overrides: Overrides = {}
): jest.Mocked<IFloorAlignmentService> => {
  const base = {
    alignToFloor: jest.fn(() => Result.ok(undefined)),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<IFloorAlignmentService>;
};

const makePathTracingService = (
  overrides: Overrides = {}
): jest.Mocked<IPathTracingService> => {
  const base: IPathTracingService = {
    events: new TypedEventEmitter<{ 'pathtracing:paused': PathTracingPausedEvent }>(),
    initialize: jest.fn(async () => Result.ok(undefined)),
    setEnabled: jest.fn(),
    updateSettings: jest.fn(),
    render: jest.fn(async () => Result.ok(undefined)),
    getSampleCount: jest.fn(() => 0),
    isEnabled: jest.fn(() => false),
    isPathTracerDisposed: jest.fn(() => false),
    canResume: jest.fn(() => false),
    reset: jest.fn(),
    dispose: jest.fn(),
    isSupported: jest.fn(() => true),
  };
  return { ...base, ...overrides } as unknown as jest.Mocked<IPathTracingService>;
};

interface DepsBundle {
  deps: ViewerDependencies;
  canvas: HTMLCanvasElement;
  renderer: jest.Mocked<IRenderer>;
  scene: jest.Mocked<IScene>;
  camera: jest.Mocked<ICamera>;
  controls: jest.Mocked<IControls>;
  modelLoader: jest.Mocked<IModelLoader>;
  sceneSetupService?: jest.Mocked<ISceneSetupService>;
  environmentService?: jest.Mocked<IEnvironmentService>;
  pathTracingService?: jest.Mocked<IPathTracingService>;
  floorAlignmentService?: jest.Mocked<IFloorAlignmentService>;
}

interface MakeDepsConfig {
  options?: SimpleViewerOptions;
  rendererOverrides?: Overrides;
  sceneOverrides?: Overrides;
  controlsOverrides?: Overrides;
  withSceneSetup?: boolean;
  withEnvironment?: boolean;
  withPathTracing?: boolean;
  withFloorAlignment?: boolean;
  sceneSetupOverrides?: Overrides;
  environmentOverrides?: Overrides;
  pathTracingOverrides?: Overrides;
  canvas?: HTMLCanvasElement;
}

const makeDeps = (config: MakeDepsConfig = {}): DepsBundle => {
  const canvas = config.canvas ?? makeCanvas();
  const renderer = makeRenderer(canvas, config.rendererOverrides);
  const scene = makeScene(config.sceneOverrides);
  const camera = makeCamera();
  const controls = makeControls(config.controlsOverrides);
  const modelLoader = makeModelLoader();

  const sceneSetupService = config.withSceneSetup
    ? makeSceneSetupService(config.sceneSetupOverrides)
    : undefined;
  const environmentService = config.withEnvironment
    ? makeEnvironmentService(config.environmentOverrides)
    : undefined;
  const pathTracingService = config.withPathTracing
    ? makePathTracingService(config.pathTracingOverrides)
    : undefined;
  const floorAlignmentService = config.withFloorAlignment
    ? makeFloorAlignmentService()
    : undefined;

  const deps: ViewerDependencies = {
    renderer,
    scene,
    camera,
    controls,
    modelLoader,
    options: config.options ?? {},
    sceneSetupService,
    environmentService,
    pathTracingService,
    floorAlignmentService,
    // Immediate by default so the deferred load-time bake behaves like the old
    // synchronous one in tests; deferral-specific tests inject a manual queue.
    deferToNextFrame: (callback) => callback(),
  };

  return {
    deps,
    canvas,
    renderer,
    scene,
    camera,
    controls,
    modelLoader,
    sceneSetupService,
    environmentService,
    pathTracingService,
    floorAlignmentService,
  };
};

describe('ViewerCore', () => {
  let renderCallback: ((deltaTime: number) => void) | null;
  let startSpy: jest.SpyInstance;

  beforeEach(() => {
    renderCallback = null;
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    startSpy = jest
      .spyOn(RenderLoopManager.prototype, 'start')
      .mockImplementation(function (
        this: RenderLoopManager,
        cb: (deltaTime: number) => void
      ) {
        renderCallback = cb;
      });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('builds a viewer using only the required dependencies', () => {
      const { deps } = makeDeps();
      const viewer = new ViewerCore(deps);
      expect(viewer).toBeInstanceOf(ViewerCore);
    });

    it('defaults idle detection to true when staticScene is not explicitly false', () => {
      const { deps } = makeDeps({ options: { staticScene: true } });
      expect(() => new ViewerCore(deps)).not.toThrow();
    });

    it('honors explicit rendering options', () => {
      const { deps } = makeDeps({
        options: {
          rendering: {
            enableIdleDetection: false,
            idleDelay: 500,
            targetFPS: 30,
            enableFrameRateLimiting: false,
          },
        },
      });
      expect(() => new ViewerCore(deps)).not.toThrow();
    });

    it('accepts every valid units value', () => {
      for (const units of ['meters', 'centimeters', 'millimeters', 'feet', 'inches'] as const) {
        const { deps } = makeDeps({ options: { units } });
        expect(() => new ViewerCore(deps)).not.toThrow();
      }
    });

    it('throws INVALID_PARAMETER on an unknown units string instead of silently rendering at meter scale', () => {
      const { deps } = makeDeps({
        options: { units: 'furlongs' as unknown as SimpleViewerOptions['units'] },
      });
      expect(() => new ViewerCore(deps)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_PARAMETER })
      );
      expect(() => new ViewerCore(deps)).toThrow(/furlongs.*meters, centimeters, millimeters, feet, inches/s);
    });

    it('rejects prototype-chain names as units values', () => {
      const { deps } = makeDeps({
        options: { units: 'toString' as unknown as SimpleViewerOptions['units'] },
      });
      expect(() => new ViewerCore(deps)).toThrow(
        expect.objectContaining({ code: ErrorCode.INVALID_PARAMETER })
      );
    });
  });

  describe('initialize', () => {
    it('returns the renderer error when renderer initialization fails', async () => {
      const initError = new ThreeViewerError('boom', ErrorCode.RENDERER_INIT_FAILED);
      const bundle = makeDeps();
      bundle.renderer.initialize.mockReturnValue(Result.err(initError));
      const viewer = new ViewerCore(bundle.deps);

      const result = await viewer.initialize();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(initError);
      }
      expect(startSpy).not.toHaveBeenCalled();
    });

    it('catches thrown errors and emits an error event', async () => {
      const bundle = makeDeps();
      bundle.renderer.initialize.mockImplementation(() => {
        throw new Error('explode');
      });
      const viewer = new ViewerCore(bundle.deps);
      const errorHandler = jest.fn();
      viewer.getEvents().on('error', errorHandler);

      const result = await viewer.initialize();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INITIALIZATION_FAILED);
      }
      expect(errorHandler).toHaveBeenCalledWith({
        error: expect.any(ThreeViewerError),
      });
      expect(viewer.getState().status).toBe('error');
    });

    it('sets up helpers, lighting, environment map and path tracing on success', async () => {
      const options: SimpleViewerOptions = {
        staticScene: false,
        backgroundColor: '#ffffff',
        helpers: { grid: true, axes: true },
        lighting: {
          ambientLight: { color: '#ffffff', intensity: 0.5 },
          hemisphereLight: { skyColor: '#aaa', groundColor: '#333', intensity: 0.4 },
          directionalLight: {
            color: '#fff',
            intensity: 1,
            position: [1, 2, 3],
            castShadow: true,
          },
        },
        environment: {
          url: 'env.hdr',
          backgroundBlurriness: 0.2,
          backgroundIntensity: 1,
          environmentIntensity: 1,
        },
        pathTracing: { enabled: true, maxSamples: 200, bounces: 4 },
      };
      const bundle = makeDeps({
        options,
        withSceneSetup: true,
        withEnvironment: true,
        withPathTracing: true,
      });
      const setAlwaysRenderSpy = jest.spyOn(
        RenderLoopManager.prototype,
        'setAlwaysRender'
      );
      const viewer = new ViewerCore(bundle.deps);

      const result = await viewer.initialize();

      expect(result.ok).toBe(true);
      expect(bundle.sceneSetupService!.addHelpers).toHaveBeenCalled();
      expect(bundle.sceneSetupService!.addLighting).toHaveBeenCalled();
      expect(bundle.environmentService!.initialize).toHaveBeenCalled();
      expect(bundle.environmentService!.loadEnvironmentMap).toHaveBeenCalledWith('env.hdr');
      expect(bundle.environmentService!.applyToScene).toHaveBeenCalled();
      expect(bundle.pathTracingService!.initialize).toHaveBeenCalled();
      expect(bundle.pathTracingService!.updateSettings).toHaveBeenCalled();
      expect(setAlwaysRenderSpy).toHaveBeenCalledWith(true);
      expect(viewer.getState().isInitialized).toBe(true);
    });

    it('creates a studio environment with dark studio background and continuous rendering', async () => {
      const options: SimpleViewerOptions = {
        staticScene: true,
        backgroundColor: '#222222',
        helpers: { studioEnvironment: true, darkStudioMode: true },
        lighting: { ambientLight: { color: '#fff', intensity: 1 } },
        pathTracing: { enabled: true, maxSamples: 100 },
      };
      const bundle = makeDeps({
        options,
        withSceneSetup: true,
        withEnvironment: true,
        withPathTracing: true,
      });
      const enableContinuousSpy = jest.spyOn(
        RenderLoopManager.prototype,
        'requireContinuous'
      );
      const viewer = new ViewerCore(bundle.deps);

      const result = await viewer.initialize();

      expect(result.ok).toBe(true);
      expect(bundle.environmentService!.createStudioEnvironment).toHaveBeenCalled();
      // The backgroundColor gradient is skipped because the studio environment
      // owns the background; only the dark-studio gradient is applied (once).
      expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenCalledTimes(1);
      expect(enableContinuousSpy).toHaveBeenCalled();
    });

    it('warns but continues when scene setup, environment init and path tracing init fail', async () => {
      const failure = (message: string) =>
        Result.err(new ThreeViewerError(message, ErrorCode.OPERATION_FAILED));
      const options: SimpleViewerOptions = {
        backgroundColor: '#000000',
        helpers: { grid: true, axes: true },
        lighting: { ambientLight: { color: '#fff', intensity: 1 } },
        pathTracing: { enabled: true },
      };
      const bundle = makeDeps({
        options,
        withSceneSetup: true,
        withEnvironment: true,
        withPathTracing: true,
        sceneSetupOverrides: {
          addHelpers: jest.fn(() => failure('helpers')),
          addLighting: jest.fn(() => failure('lighting')),
          createGradientBackground: jest.fn(() => failure('background')),
        },
        environmentOverrides: {
          initialize: jest.fn(async () => failure('env-init')),
        },
        pathTracingOverrides: {
          initialize: jest.fn(async () => failure('pt-init')),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      const result = await viewer.initialize();

      expect(result.ok).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to add helpers:',
        expect.any(ThreeViewerError)
      );
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to add lighting:',
        expect.any(ThreeViewerError)
      );
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to set background:',
        expect.any(ThreeViewerError)
      );
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to initialize environment service:',
        expect.any(ThreeViewerError)
      );
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to initialize path tracing:',
        expect.any(ThreeViewerError)
      );
      // path tracing init failed -> settings never updated
      expect(bundle.pathTracingService!.updateSettings).not.toHaveBeenCalled();
    });

    it('warns when the environment map fails to load', async () => {
      const options: SimpleViewerOptions = {
        environment: { url: 'broken.hdr' },
      };
      const bundle = makeDeps({
        options,
        withEnvironment: true,
        environmentOverrides: {
          loadEnvironmentMap: jest.fn(async () =>
            Result.err(new ThreeViewerError('load', ErrorCode.TEXTURE_LOAD_FAILED))
          ),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      const result = await viewer.initialize();

      expect(result.ok).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to load environment map, falling back to the studio look:',
        expect.any(ThreeViewerError)
      );
      // The load failure engages the studio fallback (lighting only) —
      // an unlit scene is worse than the wrong set.
      expect(bundle.environmentService!.applyToScene).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ setBackground: false })
      );
    });

    it('warns when the studio environment fails to create', async () => {
      const options: SimpleViewerOptions = {
        helpers: { studioEnvironment: true },
      };
      const bundle = makeDeps({
        options,
        withEnvironment: true,
        environmentOverrides: {
          createStudioEnvironment: jest.fn(() =>
            Result.err(new ThreeViewerError('studio', ErrorCode.OPERATION_FAILED))
          ),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      const result = await viewer.initialize();

      expect(result.ok).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to create studio environment:',
        expect.any(ThreeViewerError)
      );
    });

    it('warns when applying the dark studio background fails', async () => {
      const options: SimpleViewerOptions = {
        helpers: { studioEnvironment: true, darkStudioMode: true },
      };
      const bundle = makeDeps({
        options,
        withSceneSetup: true,
        withEnvironment: true,
        sceneSetupOverrides: {
          createGradientBackground: jest.fn(() =>
            Result.err(new ThreeViewerError('dark', ErrorCode.OPERATION_FAILED))
          ),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      const result = await viewer.initialize();

      expect(result.ok).toBe(true);
      expect(console.warn).toHaveBeenCalledWith(
        'Failed to set dark studio background:',
        expect.any(ThreeViewerError)
      );
    });

    it('registers a pathtracing:paused handler that stops the loop after a delay', async () => {
      jest.useFakeTimers();
      const options: SimpleViewerOptions = {
        staticScene: false,
        pathTracing: { enabled: true, maxSamples: 50 },
      };
      const bundle = makeDeps({
        options,
        withPathTracing: true,
      });
      const disableContinuousSpy = jest.spyOn(
        RenderLoopManager.prototype,
        'releaseContinuous'
      );
      const setAlwaysRenderSpy = jest.spyOn(
        RenderLoopManager.prototype,
        'setAlwaysRender'
      );
      const stopSpy = jest.spyOn(RenderLoopManager.prototype, 'stop');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      bundle.pathTracingService!.events.emit('pathtracing:paused', { samples: 50, reason: 'completed' });

      expect(disableContinuousSpy).toHaveBeenCalled();
      expect(setAlwaysRenderSpy).toHaveBeenCalledWith(false);

      jest.advanceTimersByTime(150);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('a gave-up pause hands the staticScene:false contract back (alwaysRender on)', async () => {
      const bundle = makeDeps({
        options: { staticScene: false, pathTracing: { enabled: true } },
        withPathTracing: true,
      });
      const setAlwaysRenderSpy = jest.spyOn(RenderLoopManager.prototype, 'setAlwaysRender');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      setAlwaysRenderSpy.mockClear();

      bundle.pathTracingService!.events.emit('pathtracing:paused', { samples: 0, reason: 'gave-up' });

      // Nothing was preserved on the canvas — external scene mutations must
      // keep repainting, unlike the completed case that freezes the frame.
      expect(setAlwaysRenderSpy).toHaveBeenCalledWith(true);
      expect(setAlwaysRenderSpy).not.toHaveBeenCalledWith(false);
    });

    it('the gave-up restoration survives the wind-down window (no scheduled stop)', async () => {
      jest.useFakeTimers();
      const bundle = makeDeps({
        options: { staticScene: false, pathTracing: { enabled: true } },
        withPathTracing: true,
      });
      const stopSpy = jest.spyOn(RenderLoopManager.prototype, 'stop');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      bundle.pathTracingService!.events.emit('pathtracing:paused', { samples: 0, reason: 'gave-up' });
      jest.advanceTimersByTime(200);

      // stop() clears EVERY loop flag including alwaysRender — scheduling it
      // after a gave-up pause would re-break the contract 100ms after this
      // handler repaired it.
      expect(stopSpy).not.toHaveBeenCalled();
    });

    it('disabling path tracing at runtime restores alwaysRender for staticScene:false', async () => {
      const bundle = makeDeps({
        options: { staticScene: false, pathTracing: { enabled: true } },
        withPathTracing: true,
      });
      const setAlwaysRenderSpy = jest.spyOn(RenderLoopManager.prototype, 'setAlwaysRender');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      // Converged: completion turned continuous rendering off.
      bundle.pathTracingService!.events.emit('pathtracing:paused', { samples: 50, reason: 'completed' });
      setAlwaysRenderSpy.mockClear();

      viewer.updateOptions({ pathTracing: { enabled: false } });

      expect(setAlwaysRenderSpy).toHaveBeenCalledWith(true);
    });
  });

  describe('initialize disposal race', () => {
    it('aborts when disposed during environment service init', async () => {
      const envInit = deferred<Result<void>>();
      const bundle = makeDeps({
        options: { environment: { url: 'env.hdr' } },
        withEnvironment: true,
        environmentOverrides: { initialize: jest.fn(() => envInit.promise) },
      });
      const viewer = new ViewerCore(bundle.deps);

      const initPromise = viewer.initialize();
      // Interleave teardown while environmentService.initialize() is still pending.
      viewer.dispose();
      envInit.resolve(Result.ok(undefined));
      const result = await initPromise;

      expect(result.ok).toBe(true);
      // Bailed right after the first await: no further work against the disposed viewer.
      expect(bundle.environmentService!.loadEnvironmentMap).not.toHaveBeenCalled();
      expect(bundle.environmentService!.applyToScene).not.toHaveBeenCalled();
      expect(viewer.getState().isInitialized).toBe(false);
    });

    it('aborts when disposed during environment map load', async () => {
      const envLoad = deferred<Result<ITexture>>();
      const bundle = makeDeps({
        options: { environment: { url: 'env.hdr' } },
        withEnvironment: true,
        environmentOverrides: { loadEnvironmentMap: jest.fn(() => envLoad.promise) },
      });
      const viewer = new ViewerCore(bundle.deps);

      const initPromise = viewer.initialize();
      // Let env init resolve so execution parks on loadEnvironmentMap, then tear down.
      await tick();
      viewer.dispose();
      envLoad.resolve(Result.ok(makeTexture()));
      const result = await initPromise;

      expect(result.ok).toBe(true);
      expect(bundle.environmentService!.loadEnvironmentMap).toHaveBeenCalled();
      expect(bundle.environmentService!.applyToScene).not.toHaveBeenCalled();
      expect(viewer.getState().isInitialized).toBe(false);
    });

    it('aborts when disposed during path tracing init', async () => {
      const ptInit = deferred<Result<void>>();
      const bundle = makeDeps({
        options: { pathTracing: { enabled: true, maxSamples: 50 } },
        withPathTracing: true,
        pathTracingOverrides: { initialize: jest.fn(() => ptInit.promise) },
      });
      const viewer = new ViewerCore(bundle.deps);

      const initPromise = viewer.initialize();
      viewer.dispose();
      ptInit.resolve(Result.ok(undefined));
      const result = await initPromise;

      expect(result.ok).toBe(true);
      // Guarded right after the await: settings never pushed to the disposed service.
      expect(bundle.pathTracingService!.updateSettings).not.toHaveBeenCalled();
      expect(viewer.getState().isInitialized).toBe(false);
    });
  });

  describe('loadModel', () => {
    it('rejects loading before the viewer is initialized', async () => {
      const { deps } = makeDeps();
      const viewer = new ViewerCore(deps);

      const result = await viewer.loadModel(makeObject3D());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
      }
    });

    it('loads a model object and resets path tracing when enabled', async () => {
      const bundle = makeDeps({
        options: { pathTracing: { enabled: true } },
        withPathTracing: true,
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      const result = await viewer.loadModel(makeObject3D());

      expect(result.ok).toBe(true);
      expect(bundle.scene.add).toHaveBeenCalled();
      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      expect(viewer.getState().status).toBe('loaded');
    });

    it('surfaces model manager errors and records an error state', async () => {
      const addError = new ThreeViewerError('add failed', ErrorCode.SCENE_OPERATION_FAILED);
      const bundle = makeDeps({
        sceneOverrides: { add: jest.fn(() => Result.err(addError)) },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      const result = await viewer.loadModel(makeObject3D());

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(addError);
      }
      expect(viewer.getState().status).toBe('error');
    });

    it('wraps unexpected exceptions thrown by the model manager', async () => {
      const { deps } = makeDeps();
      const viewer = new ViewerCore(deps);
      await viewer.initialize();

      const loadSpy = jest
        .spyOn(ModelManager.prototype, 'loadModel')
        .mockRejectedValue(new Error('catastrophic'));

      const result = await viewer.loadModel(makeObject3D());

      expect(loadSpy).toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.MODEL_LOAD_FAILED);
      }
      expect(viewer.getState().status).toBe('error');
    });

    it('preserves a ThreeViewerError thrown by the model manager', async () => {
      const { deps } = makeDeps();
      const viewer = new ViewerCore(deps);
      await viewer.initialize();

      const original = new ThreeViewerError('typed', ErrorCode.UNSUPPORTED_FORMAT);
      jest.spyOn(ModelManager.prototype, 'loadModel').mockRejectedValue(original);

      const result = await viewer.loadModel('model.glb');

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe(original);
      }
    });

    it('disposes an orphaned model instead of installing it when dispose() runs mid-load', async () => {
      const bundle = makeDeps();
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      const modelLoad = deferred<Result<IModel>>();
      bundle.modelLoader.load.mockReturnValue(modelLoad.promise);

      const load = viewer.loadModel('model.glb');
      await tick();
      viewer.dispose();

      const loadedModel = makeObject3D();
      modelLoad.resolve(Result.ok({ scene: loadedModel }));
      const result = await load;

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
      // The model manager already added it to the scene and set it as
      // current before this call returned — it must be torn down here,
      // since dispose() already ran and will never call this again.
      expect(loadedModel.dispose).toHaveBeenCalled();
    });
  });

  describe('resize', () => {
    it('does nothing when the canvas dimensions AND camera aspect are unchanged', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({ canvas });
      // Both already correct → the early-return must fire: no setSize, no aspect
      // reproject, no repaint (a rebuild is what makes the aspect stale, tested above).
      (bundle.camera as unknown as { aspect: number }).aspect = 640 / 480;
      const viewer = new ViewerCore(bundle.deps);
      (bundle.camera.updateProjectionMatrix as jest.Mock).mockClear();
      bundle.renderer.render.mockClear();

      viewer.resize(640, 480);

      expect(bundle.renderer.setSize).not.toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
      expect(bundle.camera.updateProjectionMatrix).not.toHaveBeenCalled();
    });

    it('is a no-op after dispose (prevents render against a disposed renderer)', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({ canvas });
      const viewer = new ViewerCore(bundle.deps);

      viewer.dispose();
      bundle.renderer.setSize.mockClear();
      bundle.renderer.render.mockClear();

      viewer.resize(800, 600);

      expect(bundle.renderer.setSize).not.toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('updates the perspective camera aspect and renderer size', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({ canvas });
      const viewer = new ViewerCore(bundle.deps);

      viewer.resize(800, 600);

      const aspect = (bundle.camera as unknown as { aspect: number }).aspect;
      expect(aspect).toBeCloseTo(800 / 600);
      expect(bundle.camera.updateProjectionMatrix).toHaveBeenCalled();
      expect(bundle.renderer.setSize).toHaveBeenCalledWith(800, 600);
      expect(bundle.renderer.render).toHaveBeenCalled();
    });

    it('matches fractional CSS × DPR products the way three floors them (no dead guard at DPR 1.5)', () => {
      // three's setSize assigns canvas.width = Math.floor(width × ratio) —
      // 641 × 1.5 = 961.5 → 961. A Math.round guard (962) would NEVER match
      // this geometry, silently reverting to run-the-full-path-every-call.
      const canvas = makeCanvas(961, 720);
      const bundle = makeDeps({ canvas });
      bundle.renderer.getPixelRatio.mockReturnValue(1.5);
      (bundle.camera as unknown as { aspect: number }).aspect = 641 / 480;
      const viewer = new ViewerCore(bundle.deps);
      bundle.renderer.render.mockClear();

      viewer.resize(641, 480);

      expect(bundle.renderer.setSize).not.toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('treats a DPR-scaled drawing buffer as an unchanged size (no-op on retina)', () => {
      // The buffer holds CSS × pixelRatio device pixels; comparing it against
      // raw CSS dimensions left this guard dead on every DPR ≠ 1 display.
      const canvas = makeCanvas(1280, 960);
      const bundle = makeDeps({ canvas });
      bundle.renderer.getPixelRatio.mockReturnValue(2);
      (bundle.camera as unknown as { aspect: number }).aspect = 640 / 480;
      const viewer = new ViewerCore(bundle.deps);
      (bundle.camera.updateProjectionMatrix as jest.Mock).mockClear();
      bundle.renderer.render.mockClear();

      viewer.resize(640, 480);

      expect(bundle.renderer.setSize).not.toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
      expect(bundle.camera.updateProjectionMatrix).not.toHaveBeenCalled();
    });

    it('re-applies the camera aspect on a rebuild that reuses an already-sized canvas', () => {
      // A rebuild hands the fresh viewer a canvas already sized by the previous
      // one, but a fresh camera at a stale aspect. Size alone matches, so a
      // size-only guard would skip the aspect fix and the frame stretches.
      const canvas = makeCanvas(1920, 1000);
      const bundle = makeDeps({ canvas });
      (bundle.camera as unknown as { aspect: number }).aspect = 1;
      const viewer = new ViewerCore(bundle.deps);

      viewer.resize(1920, 1000);

      const aspect = (bundle.camera as unknown as { aspect: number }).aspect;
      expect(aspect).toBeCloseTo(1920 / 1000);
      expect(bundle.camera.updateProjectionMatrix).toHaveBeenCalled();
      // Canvas already the right size — no redundant setSize, but repaint so the
      // corrected aspect shows immediately.
      expect(bundle.renderer.setSize).not.toHaveBeenCalled();
      expect(bundle.renderer.render).toHaveBeenCalled();
    });

    it('resets the accumulation on a mid-accumulation resize (stale camera / counters / snapshot)', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({
        canvas,
        withPathTracing: true,
        options: { pathTracing: { enabled: true } },
        pathTracingOverrides: {
          isEnabled: jest.fn(() => true),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      viewer.resize(1024, 768);

      // Resize behaves like a camera move: the accumulation restarts so the
      // tracer re-syncs its camera and its counters, and the dissolve snapshot
      // is recaptured at the new size. The service was already enabled, so no
      // re-enable is needed.
      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      expect(bundle.pathTracingService!.setEnabled).not.toHaveBeenCalledWith(true);
    });

    it('re-arms a converged, self-paused tracer on resize instead of leaving it dormant', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({
        canvas,
        withPathTracing: true,
        options: { pathTracing: { enabled: true } },
        pathTracingOverrides: {
          // Converged: the service self-paused and holds a warm tracer.
          isEnabled: jest.fn(() => false),
          canResume: jest.fn(() => true),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      const coordinator = (viewer as unknown as {
        pathTracing: { completeHandled: boolean };
      }).pathTracing;
      coordinator.completeHandled = true;

      viewer.resize(1024, 768);

      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      expect(coordinator.completeHandled).toBe(false);
      expect(bundle.pathTracingService!.setEnabled).toHaveBeenCalledWith(true);
    });

    it('leaves a gave-up tracer paused on resize (nothing warm to resume)', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({
        canvas,
        withPathTracing: true,
        options: { pathTracing: { enabled: true } },
        pathTracingOverrides: {
          isEnabled: jest.fn(() => false),
          canResume: jest.fn(() => false),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      viewer.resize(1024, 768);

      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      expect(bundle.pathTracingService!.setEnabled).not.toHaveBeenCalledWith(true);
    });

    it('revives a wound-down render loop on resize so the re-armed tracer actually accumulates', async () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({
        canvas,
        withPathTracing: true,
        withSceneSetup: true,
        options: { pathTracing: { enabled: true } },
        pathTracingOverrides: {
          isEnabled: jest.fn(() => false),
          canResume: jest.fn(() => true),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      // Convergence hard-stops the rAF chain ~100ms after the demand drops;
      // demand flags alone cannot restart a dead loop.
      jest.spyOn(RenderLoopManager.prototype, 'isRunning').mockReturnValue(false);
      const startsBefore = startSpy.mock.calls.length;

      viewer.resize(1024, 768);

      expect(startSpy.mock.calls.length).toBeGreaterThan(startsBefore);
    });

    it('coordinator runtime APIs are safe no-ops without a path-tracing service', async () => {
      const bundle = makeDeps({ options: { pathTracing: { enabled: true } } });
      const viewer = new ViewerCore(bundle.deps);
      const coordinator = (viewer as unknown as {
        pathTracing: {
          enableRuntime(): Promise<boolean>;
          disableRuntime(): void;
          suspendWhileAnimating(): void;
        };
      }).pathTracing;

      await expect(coordinator.enableRuntime()).resolves.toBe(false);
      expect(() => coordinator.disableRuntime()).not.toThrow();
      expect(() => coordinator.suspendWhileAnimating()).not.toThrow();
    });

    it('enableRuntime reports false when the tracer fails to initialize', async () => {
      const bundle = makeDeps({
        withPathTracing: true,
        options: { pathTracing: { enabled: true } },
        pathTracingOverrides: {
          initialize: jest.fn(async () =>
            Result.err(new ThreeViewerError('no WebGL2', ErrorCode.PATH_TRACING_INIT_FAILED))
          ),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      const coordinator = (viewer as unknown as {
        pathTracing: { enableRuntime(): Promise<boolean> };
      }).pathTracing;

      await expect(coordinator.enableRuntime()).resolves.toBe(false);
      expect(bundle.pathTracingService!.setEnabled).not.toHaveBeenCalledWith(true);
    });

    it("a failed tracer initialization reaches the consumer's error event", async () => {
      const bundle = makeDeps({
        withPathTracing: true,
        options: { pathTracing: { enabled: true } },
        pathTracingOverrides: {
          initialize: jest.fn(async () =>
            Result.err(new ThreeViewerError('no WebGL2', ErrorCode.PATH_TRACING_INIT_FAILED))
          ),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      const onError = jest.fn();
      viewer.getEvents().on('error', onError);
      const coordinator = (viewer as unknown as {
        pathTracing: { enableRuntime(): Promise<boolean> };
      }).pathTracing;

      await coordinator.enableRuntime();

      expect(onError).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: ErrorCode.PATH_TRACING_INIT_FAILED }),
      });
    });

    it('a rejected runtime enable emits error instead of an unhandled rejection', async () => {
      const bundle = makeDeps({
        withPathTracing: true,
        options: { pathTracing: { enabled: false } },
        pathTracingOverrides: {
          // A throw past the Result contract — the backstop catch must absorb it.
          setEnabled: jest.fn(() => {
            throw new Error('exploded past the Result contract');
          }),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      const onError = jest.fn();
      viewer.getEvents().on('error', onError);

      viewer.updateOptions({ pathTracing: { enabled: true } });
      await new Promise((resolve) => setTimeout(resolve, 0));

      expect(onError).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: ErrorCode.PATH_TRACING_INIT_FAILED }),
      });
    });

    it("a post-processing chunk failure reaches the consumer's error event", async () => {
      let registeredHandler: ((error: unknown) => void) | undefined;
      const bundle = makeDeps({
        rendererOverrides: {
          setPostProcessingErrorHandler: jest.fn((handler: (error: unknown) => void) => {
            registeredHandler = handler;
          }),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      const onError = jest.fn();
      viewer.getEvents().on('error', onError);
      await viewer.initialize();

      registeredHandler?.(new Error('chunk fetch failed'));

      expect(onError).toHaveBeenCalledWith({
        error: expect.objectContaining({ code: ErrorCode.POST_PROCESSING_FAILED }),
      });
    });

    it('renders the immediate resize frame through the composer when effects are on', () => {
      const canvas = makeCanvas(640, 480);
      const renderPostProcessed = jest.fn(() => Result.ok(undefined));
      const bundle = makeDeps({ canvas, rendererOverrides: { renderPostProcessed } });
      const viewer = new ViewerCore(bundle.deps);

      viewer.resize(1024, 768);

      expect(renderPostProcessed).toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('silently ignores render failures during resize', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({
        canvas,
        rendererOverrides: {
          render: jest.fn(() => {
            throw new Error('not ready');
          }),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      expect(() => viewer.resize(800, 600)).not.toThrow();
      expect(bundle.renderer.setSize).toHaveBeenCalledWith(800, 600);
    });
  });

  describe('accessors', () => {
    it('exposes state, events and the dom element', () => {
      const bundle = makeDeps();
      const viewer = new ViewerCore(bundle.deps);

      expect(viewer.getState().status).toBe('idle');
      expect(viewer.getEvents()).toBeInstanceOf(TypedEventEmitter);
      expect(viewer.getDomElement()).toBe(bundle.canvas);
    });

    it('notifies and unsubscribes state change listeners', async () => {
      const bundle = makeDeps();
      const viewer = new ViewerCore(bundle.deps);
      const listener = jest.fn();

      const unsubscribe = viewer.onStateChange(listener);
      await viewer.initialize();
      expect(listener).toHaveBeenCalled();

      listener.mockClear();
      unsubscribe();
      await viewer.loadModel(makeObject3D());
      expect(listener).not.toHaveBeenCalled();
    });

    it('updateOptions applies the turntable live and holds continuous rendering', async () => {
      const bundle = makeDeps();
      const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
      const releaseSpy = jest.spyOn(RenderLoopManager.prototype, 'releaseContinuous');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      viewer.updateOptions({ controls: { autoRotate: true, autoRotateSpeed: 4 } });
      expect(bundle.controls.autoRotate).toBe(true);
      expect(bundle.controls.autoRotateSpeed).toBe(4);
      expect(requireSpy).toHaveBeenCalledWith('turntable');

      viewer.updateOptions({ controls: { autoRotate: false } });
      expect(bundle.controls.autoRotate).toBe(false);
      expect(releaseSpy).toHaveBeenCalledWith('turntable');
    });

    it('initialize holds continuous rendering when options enable the turntable', async () => {
      const bundle = makeDeps({ options: { staticScene: true, controls: { autoRotate: true } } });
      const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      expect(requireSpy).toHaveBeenCalledWith('turntable');
    });

    it('loadModel attaches animations and autoplays when configured', async () => {
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => ['Walk']),
        play: jest.fn(() => Result.ok(undefined)),
        pause: jest.fn(),
        isPlaying: jest.fn(() => true),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps({ options: { animations: { autoplay: 'Walk', speed: 2 } } });
      const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      await viewer.loadModel(makeObject3D());

      expect(animationService.attach).toHaveBeenCalled();
      expect(animationService.setSpeed).toHaveBeenCalledWith(2);
      expect(animationService.play).toHaveBeenCalledWith('Walk');
      expect(requireSpy).toHaveBeenCalledWith('animations');
      expect(viewer.getAnimationNames()).toEqual(['Walk']);
    });

    it('pauseAnimations releases the continuous demand; playAnimations re-holds it', async () => {
      let playing = false;
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => []),
        play: jest.fn(() => {
          playing = true;
          return Result.ok(undefined);
        }),
        pause: jest.fn(() => {
          playing = false;
        }),
        isPlaying: jest.fn(() => playing),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps();
      const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
      const releaseSpy = jest.spyOn(RenderLoopManager.prototype, 'releaseContinuous');
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      viewer.playAnimations();
      expect(requireSpy).toHaveBeenCalledWith('animations');

      viewer.pauseAnimations();
      expect(animationService.pause).toHaveBeenCalled();
      expect(releaseSpy).toHaveBeenCalledWith('animations');
    });

    it('playAnimations falls back to the live contact shadow; pausing re-bakes it for the stopped pose', async () => {
      let playing = false;
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => ['Walk']),
        play: jest.fn(() => {
          playing = true;
          return Result.ok(undefined);
        }),
        pause: jest.fn(() => {
          playing = false;
        }),
        isPlaying: jest.fn(() => playing),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps({ withSceneSetup: true });
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();
      await viewer.loadModel(makeObject3D());
      bundle.sceneSetupService!.bakeContactShadow.mockClear();

      viewer.playAnimations();
      expect(bundle.sceneSetupService!.setContactShadowMode).toHaveBeenCalledWith(
        bundle.scene,
        'live'
      );

      viewer.pauseAnimations();
      expect(bundle.sceneSetupService!.bakeContactShadow).toHaveBeenCalledTimes(1);
    });

    it('updateOptions toggles autoplay live but ignores an unchanged re-send', async () => {
      let playing = false;
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => []),
        play: jest.fn(() => {
          playing = true;
          return Result.ok(undefined);
        }),
        pause: jest.fn(() => {
          playing = false;
        }),
        isPlaying: jest.fn(() => playing),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps();
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();
      await viewer.loadModel(makeObject3D());

      viewer.updateOptions({ animations: { autoplay: true } });
      expect(animationService.play).toHaveBeenCalledTimes(1);

      // The runtime-options effect re-sends the full set on every look change.
      viewer.updateOptions({ animations: { autoplay: true } });
      expect(animationService.play).toHaveBeenCalledTimes(1);

      viewer.updateOptions({ animations: { autoplay: false, speed: 0.5 } });
      expect(animationService.pause).toHaveBeenCalledTimes(1);
      expect(animationService.setSpeed).toHaveBeenCalledWith(0.5);
    });

    const makeRejectingAnimationService = () => ({
      attach: jest.fn(),
      getClipNames: jest.fn(() => ['Walk']),
      play: jest.fn(() =>
        Result.err(
          new ThreeViewerError(
            "Unknown animation clip 'Nope'. Available clips: Walk",
            ErrorCode.INVALID_PARAMETER
          )
        )
      ),
      pause: jest.fn(),
      // Deliberately true: if ViewerCore ever skipped the early return on an
      // erred play, the isPlaying() branch WOULD grab the continuous demand
      // and the requireContinuous assertion below would catch it.
      isPlaying: jest.fn(() => true),
      setSpeed: jest.fn(),
      update: jest.fn(),
      detach: jest.fn(),
    });

    it('playAnimations propagates an unknown-clip error without holding the render loop', async () => {
      const animationService = makeRejectingAnimationService();
      const bundle = makeDeps();
      const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      const result = viewer.playAnimations('Nope');

      expect(result.ok).toBe(false);
      expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
      expect(requireSpy).not.toHaveBeenCalledWith('animations');
    });

    it('playAnimations with a clip name errs when no animation service exists; a bare call stays a no-op', () => {
      const bundle = makeDeps();
      const viewer = new ViewerCore(bundle.deps);

      const named = viewer.playAnimations('Walk');
      expect(named.ok).toBe(false);
      expect(!named.ok && named.error.code).toBe(ErrorCode.INVALID_STATE);

      expect(viewer.playAnimations().ok).toBe(true);
    });

    it('surfaces an autoplay clip typo on the console without failing the load', async () => {
      const animationService = makeRejectingAnimationService();
      const bundle = makeDeps({ options: { animations: { autoplay: 'Nope' } } });
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      const result = await viewer.loadModel(makeObject3D());

      expect(result.ok).toBe(true);
      expect(console.error).toHaveBeenCalledWith(
        'animations.autoplay failed:',
        expect.stringMatching(/Unknown animation clip 'Nope'/)
      );
    });

    it('updateOptions logs an autoplay clip typo instead of throwing', async () => {
      const animationService = makeRejectingAnimationService();
      const bundle = makeDeps();
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();
      await viewer.loadModel(makeObject3D());

      expect(() => viewer.updateOptions({ animations: { autoplay: 'Nope' } })).not.toThrow();
      expect(console.error).toHaveBeenCalledWith(
        'animations.autoplay failed:',
        expect.stringMatching(/Unknown animation clip 'Nope'/)
      );
    });

    it('updateOptions autoplay before any model stays quiet and applies on load', async () => {
      let playing = false;
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => ['Walk']),
        play: jest.fn(() => {
          playing = true;
          return Result.ok(undefined);
        }),
        pause: jest.fn(),
        isPlaying: jest.fn(() => playing),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps();
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      // Nothing loaded yet: there is nothing to play and no clip list to
      // validate 'Walk' against — a valid future name must not log an error.
      viewer.updateOptions({ animations: { autoplay: 'Walk' } });
      expect(animationService.play).not.toHaveBeenCalled();
      expect(console.error).not.toHaveBeenCalled();

      // The merged option kicks in when the model lands.
      await viewer.loadModel(makeObject3D());
      expect(animationService.play).toHaveBeenCalledWith('Walk');
    });

    it('createAnchorProjector returns null without an anchor projection service', () => {
      const bundle = makeDeps();
      const viewer = new ViewerCore(bundle.deps);

      expect(viewer.createAnchorProjector()).toBeNull();
    });

    it('createAnchorProjector wires the viewer camera, canvas and model into the service', () => {
      const bundle = makeDeps();
      const projector: IAnchorProjector = {
        project: jest.fn(() => null),
        invalidate: jest.fn(),
      };
      const service: IAnchorProjectionService = {
        createProjector: jest.fn(() => projector),
      };
      const viewer = new ViewerCore({ ...bundle.deps, anchorProjectionService: service });

      expect(viewer.createAnchorProjector()).toBe(projector);
      const sources = (service.createProjector as jest.Mock).mock.calls[0][0];
      expect(sources.camera).toBe(bundle.camera);
      expect(sources.getCanvas()).toBe(bundle.canvas);
      expect(sources.getModel()).toBeNull();
    });
  });

  describe('render loop callback', () => {
    it('renders with the standard renderer and emits render:complete', async () => {
      const bundle = makeDeps({ options: { staticScene: true } });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      const completeHandler = jest.fn();
      viewer.getEvents().on('render:complete', completeHandler);

      renderCallback!(16);
      await tick();

      expect(bundle.renderer.render).toHaveBeenCalledWith(bundle.scene, bundle.camera);
      expect(completeHandler).toHaveBeenCalled();
    });

    it('stops the loop when invoked after disposal', async () => {
      const bundle = makeDeps({ options: { staticScene: true } });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      viewer.dispose();
      const stopSpy = jest.spyOn(RenderLoopManager.prototype, 'stop');

      renderCallback!(16);

      expect(stopSpy).toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('skips rendering while the viewer is in an error state', async () => {
      const addError = new ThreeViewerError('add', ErrorCode.SCENE_OPERATION_FAILED);
      const bundle = makeDeps({
        options: { staticScene: true },
        sceneOverrides: { add: jest.fn(() => Result.err(addError)) },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      await viewer.loadModel(makeObject3D());
      expect(viewer.getState().status).toBe('error');
      bundle.renderer.render.mockClear();

      renderCallback!(16);
      await tick();

      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('stops the loop when the internal renderer was torn down', async () => {
      const canvas = makeCanvas();
      const bundle = makeDeps({
        canvas,
        options: { staticScene: true },
        rendererOverrides: { isDisposed: jest.fn(() => true) },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      const stopSpy = jest.spyOn(RenderLoopManager.prototype, 'stop');

      renderCallback!(16);

      expect(stopSpy).toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('reacts to control changes by resetting path tracing and requesting a render', async () => {
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true } },
        controlsOverrides: { update: jest.fn(() => true) },
        withPathTracing: true,
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      bundle.pathTracingService!.reset.mockClear();
      const controlsHandler = jest.fn();
      viewer.getEvents().on('controls:change', controlsHandler);

      renderCallback!(16);
      await tick();

      expect(controlsHandler).toHaveBeenCalled();
      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
    });

    it('skips the controls update while disabled so an external camera driver can own the camera', async () => {
      const update = jest.fn(() => true);
      const bundle = makeDeps({
        options: { staticScene: true },
        controlsOverrides: { enabled: false, update },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      const controlsHandler = jest.fn();
      viewer.getEvents().on('controls:change', controlsHandler);
      update.mockClear();

      renderCallback!(16);
      await tick();

      expect(update).not.toHaveBeenCalled();
      expect(controlsHandler).not.toHaveBeenCalled();
    });

    it('renders through the path tracing service when enabled', async () => {
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true, maxSamples: 500 } },
        withPathTracing: true,
        pathTracingOverrides: {
          isEnabled: jest.fn(() => true),
          getSampleCount: jest.fn(() => 0),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      renderCallback!(16);
      await tick();

      expect(bundle.pathTracingService!.render).toHaveBeenCalledWith(
        bundle.scene,
        bundle.camera
      );
      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('emits an error event when rendering fails', async () => {
      const renderError = new ThreeViewerError('render', ErrorCode.RENDER_FAILED);
      const bundle = makeDeps({
        options: { staticScene: true },
        rendererOverrides: { render: jest.fn(() => Result.err(renderError)) },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      const errorHandler = jest.fn();
      viewer.getEvents().on('error', errorHandler);

      renderCallback!(16);
      await tick();

      expect(errorHandler).toHaveBeenCalledWith({ error: renderError });
    });

    it('handles path tracing completion by emitting an event and preserving the image', async () => {
      jest.useFakeTimers();
      const bundle = makeDeps({
        options: { staticScene: false, pathTracing: { enabled: true, maxSamples: 1 } },
        withPathTracing: true,
        pathTracingOverrides: {
          isEnabled: jest.fn(() => true),
          getSampleCount: jest.fn(() => 5),
        },
      });
      const setAlwaysRenderSpy = jest.spyOn(
        RenderLoopManager.prototype,
        'setAlwaysRender'
      );
      const stopSpy = jest.spyOn(RenderLoopManager.prototype, 'stop');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      const completeHandler = jest.fn();
      viewer.getEvents().on('pathtracing:complete', completeHandler);

      renderCallback!(16);
      await tick();

      expect(completeHandler).toHaveBeenCalled();
      expect(setAlwaysRenderSpy).toHaveBeenCalledWith(false);
      // autoClear must survive completion untouched: disabling it here used
      // to outlive the pause and stack every post-convergence raster frame
      // over the last one, tearing the model apart on the next drag.
      const internal = bundle.renderer.getInternalRenderer() as { autoClear: boolean };
      expect(internal.autoClear).not.toBe(false);

      jest.advanceTimersByTime(150);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('does not render while a screenshot overlay is active', async () => {
      const isActiveSpy = jest
        .spyOn(ScreenshotManager.prototype, 'isActive')
        .mockReturnValue(true);
      const bundle = makeDeps({ options: { staticScene: true } });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      bundle.renderer.render.mockClear();

      renderCallback!(16);
      await tick();

      expect(isActiveSpy).toHaveBeenCalled();
      expect(bundle.renderer.render).not.toHaveBeenCalled();
    });

    it('re-arms a completed accumulation on a camera move (the frame must not freeze)', async () => {
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true } },
        controlsOverrides: { update: jest.fn(() => true) },
        withPathTracing: true,
        pathTracingOverrides: {
          // Completed state: self-paused with a warm tracer.
          isEnabled: jest.fn(() => false),
          canResume: jest.fn(() => true),
        },
      });
      const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      requireSpy.mockClear();

      renderCallback!(16);
      await tick();

      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      expect(bundle.pathTracingService!.setEnabled).toHaveBeenCalledWith(true);
      expect(requireSpy).toHaveBeenCalledWith('path-tracing');
    });

    it('does not re-arm a given-up accumulation on camera moves', async () => {
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true } },
        controlsOverrides: { update: jest.fn(() => true) },
        withPathTracing: true,
        pathTracingOverrides: {
          isEnabled: jest.fn(() => false),
          canResume: jest.fn(() => false),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      renderCallback!(16);
      await tick();

      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      expect(bundle.pathTracingService!.setEnabled).not.toHaveBeenCalledWith(true);
    });

    it('suspends accumulation while animations play and skips camera-move resets', async () => {
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => []),
        play: jest.fn(() => Result.ok(undefined)),
        pause: jest.fn(),
        isPlaying: jest.fn(() => true),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true } },
        controlsOverrides: { update: jest.fn(() => true) },
        withPathTracing: true,
        pathTracingOverrides: { isEnabled: jest.fn(() => true) },
      });
      const releaseSpy = jest.spyOn(RenderLoopManager.prototype, 'releaseContinuous');
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      renderCallback!(16);
      await tick();

      // Animated geometry can never converge — the accumulation is suspended
      // (raster shows the motion) instead of resetting against a stale BVH.
      expect(bundle.pathTracingService!.reset).not.toHaveBeenCalled();
      expect(bundle.pathTracingService!.setEnabled).toHaveBeenCalledWith(false);
      expect(releaseSpy).toHaveBeenCalledWith('path-tracing');
      expect(animationService.update).toHaveBeenCalled();
    });

    it('pausing animations force-resets path tracing so the new pose re-ingests', async () => {
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => []),
        play: jest.fn(() => Result.ok(undefined)),
        pause: jest.fn(),
        isPlaying: jest.fn(() => false),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true } },
        withPathTracing: true,
        pathTracingOverrides: { isEnabled: jest.fn(() => true) },
      });
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      viewer.pauseAnimations();

      expect(bundle.pathTracingService!.reset).toHaveBeenCalledWith(true);
    });

    it('wakes a wound-down loop when the controls report a change', async () => {
      let changeListener: (() => void) | null = null;
      const bundle = makeDeps({
        options: { staticScene: true },
        controlsOverrides: {
          onChange: jest.fn((listener: () => void) => {
            changeListener = listener;
            return () => {
              changeListener = null;
            };
          }),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      expect(changeListener).not.toBeNull();

      // The loop wound down (converged path tracing, idle static scene):
      // only the controls' own change event observes the next interaction.
      jest.spyOn(RenderLoopManager.prototype, 'isRunning').mockReturnValue(false);
      startSpy.mockClear();
      const requestSpy = jest.spyOn(RenderLoopManager.prototype, 'requestRender');

      changeListener!();

      expect(startSpy).toHaveBeenCalled();
      expect(requestSpy).toHaveBeenCalled();

      viewer.dispose();
      expect(changeListener).toBeNull();
    });

    it('resumes live raster frames when animations start over a converged frame', async () => {
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => []),
        play: jest.fn(() => Result.ok(undefined)),
        pause: jest.fn(),
        isPlaying: jest.fn(() => true),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true, maxSamples: 1 } },
        withPathTracing: true,
        pathTracingOverrides: {
          // Converged-and-paused state: warm tracer preserving the canvas.
          isEnabled: jest.fn(() => false),
          canResume: jest.fn(() => true),
          getSampleCount: jest.fn(() => 5),
        },
      });
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      renderCallback!(16);
      await tick();

      // The preserved sample count must drop, or the completed-state
      // short-circuit keeps returning without rendering and the canvas
      // stays frozen on the converged frame for the whole playback.
      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      // ...but playback must NOT re-arm accumulation mid-animation.
      expect(bundle.pathTracingService!.setEnabled).not.toHaveBeenCalledWith(true);
    });

    it('settles a pending path-traced capture when animations start mid-wait', async () => {
      let playing = false;
      const animationService = {
        attach: jest.fn(),
        getClipNames: jest.fn(() => []),
        play: jest.fn(() => Result.ok(undefined)),
        pause: jest.fn(),
        isPlaying: jest.fn(() => playing),
        setSpeed: jest.fn(),
        update: jest.fn(),
        detach: jest.fn(),
      };
      const bundle = makeDeps({
        options: { staticScene: true, pathTracing: { enabled: true } },
        withPathTracing: true,
        pathTracingOverrides: { isEnabled: jest.fn(() => true) },
      });
      bundle.canvas.toDataURL = jest.fn(() => 'data:image/png;base64,still');
      const viewer = new ViewerCore({ ...bundle.deps, animationService });
      await viewer.initialize();

      let settled = false;
      const capture = viewer.captureStill().then((result) => {
        settled = true;
        return result;
      });
      await tick();
      expect(settled).toBe(false);

      // Animation playback suspends the accumulation silently; the pending
      // capture must settle with the raster frame instead of hanging for
      // the whole (possibly looping) playback.
      playing = true;
      renderCallback!(16);
      await tick();

      const result = await capture;
      expect(result.ok).toBe(true);
      expect(result.ok && result.value).toBe('data:image/png;base64,still');
    });
  });

  describe('loadModel revives a wound-down loop', () => {
    it('restarts the dead rAF chain so the new model paints without user input', async () => {
      const bundle = makeDeps({ options: { staticScene: true } });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      // The loop wound down after a converged accumulation.
      jest.spyOn(RenderLoopManager.prototype, 'isRunning').mockReturnValue(false);
      startSpy.mockClear();

      const result = await viewer.loadModel(makeObject3D());

      expect(result.ok).toBe(true);
      expect(startSpy).toHaveBeenCalled();
    });
  });

  describe('screenshot replacement', () => {
    it('replaces the scene with a screenshot when path tracing completes', async () => {
      jest.useFakeTimers();
      const captureSpy = jest
        .spyOn(ScreenshotManager.prototype, 'captureAndReplace')
        .mockImplementation((_camera, _controls, _url, onDisposed) => {
          onDisposed?.();
        });
      const bundle = makeDeps({
        options: {
          staticScene: true,
          replaceWithScreenshotOnComplete: true,
          pathTracing: { enabled: true, maxSamples: 1 },
        },
        withPathTracing: true,
        pathTracingOverrides: {
          isEnabled: jest.fn(() => true),
          getSampleCount: jest.fn(() => 5),
        },
      });
      const stopSpy = jest.spyOn(RenderLoopManager.prototype, 'stop');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      renderCallback!(16);
      jest.advanceTimersByTime(100);

      expect(captureSpy).toHaveBeenCalled();
      expect(bundle.scene.disposeContents).toHaveBeenCalled();

      jest.advanceTimersByTime(200);
      expect(stopSpy).toHaveBeenCalled();
    });

    it('restores the scene from a screenshot on user interaction', async () => {
      jest.useFakeTimers();
      const canvas = makeCanvas();
      canvas.toDataURL = jest.fn(() => 'data:image/png;base64,abc') as typeof canvas.toDataURL;
      document.body.appendChild(canvas);

      const bundle = makeDeps({
        canvas,
        options: {
          staticScene: false,
          replaceWithScreenshotOnComplete: true,
          pathTracing: { enabled: true, maxSamples: 1 },
        },
        withPathTracing: true,
        pathTracingOverrides: {
          isEnabled: jest.fn(() => true),
          getSampleCount: jest.fn(() => 5),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      const startCallsBefore = startSpy.mock.calls.length;

      renderCallback!(16);
      await tick();
      // Run the scheduled replaceWithScreenshot timer (100ms).
      jest.advanceTimersByTime(100);

      const screenshotImg = document.body.querySelector('img');
      expect(screenshotImg).not.toBeNull();
      expect(canvas.style.display).toBe('none');

      screenshotImg!.dispatchEvent(new MouseEvent('mousedown'));
      await tick(6);

      expect(canvas.style.display).toBe('');
      expect(document.body.querySelector('img')).toBeNull();
      // restoreFromScreenshot restarts the render loop.
      expect(startSpy.mock.calls.length).toBeGreaterThan(startCallsBefore);

      viewer.dispose();
      document.body.removeChild(canvas);
    });
  });

  describe('dispose', () => {
    it('reports isDisposed() false before dispose and true after', async () => {
      const bundle = makeDeps();
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();
      expect(viewer.isDisposed()).toBe(false);
      viewer.dispose();
      expect(viewer.isDisposed()).toBe(true);
    });

    it('tears down managers, controls and the renderer', async () => {
      const bundle = makeDeps({
        withPathTracing: true,
        withEnvironment: true,
        options: { pathTracing: { enabled: true } },
      });
      const modelDisposeSpy = jest.spyOn(ModelManager.prototype, 'dispose');
      const resourceDisposeSpy = jest.spyOn(ResourceManager.prototype, 'dispose');
      const screenshotDisposeSpy = jest.spyOn(ScreenshotManager.prototype, 'dispose');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      viewer.dispose();

      expect(modelDisposeSpy).toHaveBeenCalled();
      expect(resourceDisposeSpy).toHaveBeenCalled();
      expect(screenshotDisposeSpy).toHaveBeenCalled();
      // Teardown frees scene contents via ResourceManager.dispose() -> disposeContents()
      expect(bundle.scene.disposeContents).toHaveBeenCalled();
      expect(bundle.controls.dispose).toHaveBeenCalled();
      expect(bundle.renderer.dispose).toHaveBeenCalled();
      expect(viewer.getState().status).toBe('disposed');
    });

    it('is safe to call twice', async () => {
      const bundle = makeDeps();
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      viewer.dispose();
      expect(() => viewer.dispose()).not.toThrow();
    });

    it('cancels pending scheduled callbacks so they never run after disposal', async () => {
      jest.useFakeTimers();
      const captureSpy = jest
        .spyOn(ScreenshotManager.prototype, 'captureAndReplace')
        .mockImplementation(() => undefined);
      const bundle = makeDeps({
        options: {
          staticScene: true,
          replaceWithScreenshotOnComplete: true,
          pathTracing: { enabled: true, maxSamples: 1 },
        },
        withPathTracing: true,
        pathTracingOverrides: {
          isEnabled: jest.fn(() => true),
          getSampleCount: jest.fn(() => 5),
        },
      });
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      renderCallback!(16);
      // A replaceWithScreenshot callback is now scheduled for +100ms.
      viewer.dispose();
      jest.advanceTimersByTime(1000);

      expect(captureSpy).not.toHaveBeenCalled();
    });
  });
});

describe('ViewerCore deferred contact-shadow bake', () => {
  const makeFrameQueue = () => {
    const queue: Array<() => void> = [];
    return {
      defer: (callback: () => void) => {
        queue.push(callback);
      },
      flush: () => queue.splice(0).forEach((callback) => callback()),
    };
  };

  it('bakes after the deferred frame, not during the load', async () => {
    const frames = makeFrameQueue();
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore({ ...bundle.deps, deferToNextFrame: frames.defer });
    await viewer.initialize();

    await viewer.loadModel(makeObject3D());

    // The load resolves (overlay clears, first frame paints) with the live
    // catcher in charge — the synchronous bake must not have run yet.
    expect(bundle.sceneSetupService!.bakeContactShadow).not.toHaveBeenCalled();
    frames.flush();
    expect(bundle.sceneSetupService!.bakeContactShadow).toHaveBeenCalledTimes(1);
  });

  it('bakes only the latest model when a new load supersedes the deferred bake', async () => {
    const frames = makeFrameQueue();
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore({ ...bundle.deps, deferToNextFrame: frames.defer });
    await viewer.initialize();

    await viewer.loadModel(makeObject3D());
    await viewer.loadModel(makeObject3D());
    frames.flush();

    // The first model's callback sees itself superseded and skips.
    expect(bundle.sceneSetupService!.bakeContactShadow).toHaveBeenCalledTimes(1);
  });

  it('skips the deferred bake when the viewer was disposed before the frame', async () => {
    const frames = makeFrameQueue();
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore({ ...bundle.deps, deferToNextFrame: frames.defer });
    await viewer.initialize();

    await viewer.loadModel(makeObject3D());
    viewer.dispose();
    frames.flush();

    expect(bundle.sceneSetupService!.bakeContactShadow).not.toHaveBeenCalled();
  });

  it('skips the deferred bake while animations are playing (live shadow is the right mode)', async () => {
    const frames = makeFrameQueue();
    const bundle = makeDeps({ withSceneSetup: true });
    const animationService = {
      attach: jest.fn(),
      play: jest.fn(() => Result.ok(undefined)),
      pause: jest.fn(),
      isPlaying: jest.fn(() => true),
      getClipNames: jest.fn(() => []),
      setSpeed: jest.fn(),
      update: jest.fn(),
      detach: jest.fn(),
    };
    const viewer = new ViewerCore({
      ...bundle.deps,
      deferToNextFrame: frames.defer,
      animationService,
    });
    await viewer.initialize();

    await viewer.loadModel(makeObject3D());
    frames.flush();

    // Playing runs in live-shadow mode; the pause handler re-bakes itself.
    expect(bundle.sceneSetupService!.bakeContactShadow).not.toHaveBeenCalled();
  });
});

describe('ViewerCore.updateOptions (runtime options)', () => {
  it('re-applies the background color via the scene setup service', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      options: { backgroundColor: '#000000' },
    });
    const viewer = new ViewerCore(bundle.deps);
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    viewer.updateOptions({ backgroundColor: '#abcdef' });

    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(
      bundle.scene,
      { topColor: '#abcdef', bottomColor: '#abcdef' }
    );
  });

  it('forces a PT re-ingest when the background color changes at runtime', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      withPathTracing: true,
      options: { backgroundColor: '#000000', pathTracing: { enabled: true } },
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({ backgroundColor: '#abcdef' });

    // Non-forced resets never re-read scene.background — only a forced
    // re-ingest does, so a converged frame must not keep the old backdrop.
    expect(bundle.pathTracingService!.reset).toHaveBeenCalledWith(true);
  });

  it('forces a PT re-ingest when the environment intensity changes at runtime', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      withPathTracing: true,
      options: { pathTracing: { enabled: true } },
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({ environment: { environmentIntensity: 1.7 } });

    expect(bundle.pathTracingService!.reset).toHaveBeenCalledWith(true);
  });

  it('skips the forced re-ingest while an environment map owns the backdrop, re-arms after reset', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      withPathTracing: true,
      options: {
        backgroundColor: '#000000',
        environment: { url: 'https://example.com/env.hdr' },
        pathTracing: { enabled: true },
      },
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({ backgroundColor: '#abcdef' });

    // The repaint no-ops under an env-map backdrop — a forced re-ingest would
    // burn a full sample budget for zero visual change.
    expect(bundle.pathTracingService!.reset).not.toHaveBeenCalledWith(true);

    // resetEnvironment clears the url on the LIVE options object; the guard
    // must see that and force again for the next real change.
    const liveOptions = (viewer as unknown as {
      options: { environment?: { url?: string } };
    }).options;
    liveOptions.environment!.url = undefined;
    viewer.updateOptions({ backgroundColor: '#123456' });

    expect(bundle.pathTracingService!.reset).toHaveBeenCalledWith(true);
  });

  it('does NOT force a re-ingest when unchanged look values ride along an unrelated update', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      withPathTracing: true,
      options: {
        backgroundColor: '#000000',
        environment: { environmentIntensity: 0.5 },
        pathTracing: { enabled: true },
      },
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    // The runtime-options effect re-sends the WHOLE picked set on any runtime
    // change; the defaults keep backgroundColor/environmentIntensity always
    // defined. An unrelated update must not restart a converged accumulation.
    viewer.updateOptions({
      backgroundColor: '#000000',
      environment: { environmentIntensity: 0.5 },
      controls: { autoRotateSpeed: 3 },
    });

    expect(bundle.pathTracingService!.reset).not.toHaveBeenCalledWith(true);
  });

  it('does not override the background when an environment map is set', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      options: { environment: { url: 'https://example.com/env.hdr' } },
    });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({ backgroundColor: '#abcdef' });

    expect(bundle.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
  });

  it('swaps the post-processing effects live when a toggle changes', () => {
    const bundle = makeDeps({ options: {} });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({
      renderer: { bloom: true, vignette: false, filmGrain: false, colorGrade: true },
    });

    expect(bundle.renderer.setPostProcessing).toHaveBeenCalledWith({
      bloom: true,
      vignette: false,
      filmGrain: false,
      colorGrade: true,
    });
  });

  it('force-resets path-tracing accumulation on an effect toggle (a completed frame must repaint)', () => {
    // The ratio-cap swap can resize the drawing buffer and clear a COMPLETED
    // traced frame, whose presentation path never repaints by design — without
    // the forced reset the viewer sticks blank until the controls move.
    const resetSpy = jest.spyOn(PathTracingCoordinator.prototype, 'resetAccumulation');
    const bundle = makeDeps({ options: {} });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({
      renderer: { bloom: true, vignette: false, filmGrain: false, colorGrade: false },
    });

    expect(resetSpy).toHaveBeenCalledWith(true);
  });

  it('replaces an object colorGrade wholesale instead of merging its sub-fields', () => {
    // deepMerge would keep the dropped `saturation`, silently pinning the old
    // amount AND filtering the change as a no-op re-send.
    const bundle = makeDeps({
      options: { renderer: { colorGrade: { contrast: 0.2, saturation: 0.8 } } },
    });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({
      renderer: { bloom: false, vignette: false, filmGrain: false, colorGrade: { contrast: 0.2 } },
    });

    expect(bundle.renderer.setPostProcessing).toHaveBeenCalledWith(
      expect.objectContaining({ colorGrade: { contrast: 0.2 } })
    );
  });

  it('does not rebuild the composer on a re-send of an unchanged effect set', () => {
    const bundle = makeDeps({ options: {} });
    const viewer = new ViewerCore(bundle.deps);
    const effects = { bloom: true, vignette: false, filmGrain: false, colorGrade: false };

    viewer.updateOptions({ renderer: effects });
    viewer.updateOptions({ renderer: effects });
    // The runtime effect re-sends the whole set alongside unrelated changes too.
    viewer.updateOptions({ renderer: { ...effects, toneMappingExposure: 1.3 } });

    expect(bundle.renderer.setPostProcessing).toHaveBeenCalledTimes(1);
  });

  it('turns the effects off live when the set resolves back to all-false', () => {
    const bundle = makeDeps({ options: { renderer: { bloom: true } } });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({
      renderer: { bloom: false, vignette: false, filmGrain: false, colorGrade: false },
    });

    expect(bundle.renderer.setPostProcessing).toHaveBeenCalledWith({
      bloom: false,
      vignette: false,
      filmGrain: false,
      colorGrade: false,
    });
  });

  it('does not repaint on an edge colour alone when no base background is set', () => {
    const bundle = makeDeps({ withSceneSetup: true, options: {} });
    const viewer = new ViewerCore(bundle.deps);
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    viewer.updateOptions({ backgroundColorEdge: '#050507' });

    expect(bundle.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
  });

  it('repaints a radial vignette when a backgroundColorEdge arrives live', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      options: { backgroundColor: '#242430' },
    });
    const viewer = new ViewerCore(bundle.deps);
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    viewer.updateOptions({ backgroundColor: '#242430', backgroundColorEdge: '#050507' });

    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(
      bundle.scene,
      { topColor: '#242430', bottomColor: '#050507', radial: true }
    );
  });

  it('drops the vignette back to a flat fill when switching away from an edge preset', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      options: { backgroundColor: '#242430', backgroundColorEdge: '#050507' },
    });
    const viewer = new ViewerCore(bundle.deps);
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    // The runtime effect re-sends the whole set; a light preset carries an
    // explicit `backgroundColorEdge: undefined` to clear the dark vignette.
    viewer.updateOptions({ backgroundColor: '#f0f0f7', backgroundColorEdge: undefined });

    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(
      bundle.scene,
      { topColor: '#f0f0f7', bottomColor: '#f0f0f7' }
    );
  });

  it('enables path tracing live on a viewer booted with it off — no rebuild needed', async () => {
    const bundle = makeDeps({
      options: { staticScene: true, pathTracing: { enabled: false } },
      withPathTracing: true,
    });
    const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
    const viewer = new ViewerCore(bundle.deps);
    await viewer.initialize();
    // The heavy tracer stays unloaded while off.
    expect(bundle.pathTracingService!.initialize).not.toHaveBeenCalled();
    requireSpy.mockClear();

    viewer.updateOptions({ pathTracing: { enabled: true } });
    await tick();

    expect(bundle.pathTracingService!.initialize).toHaveBeenCalled();
    expect(bundle.pathTracingService!.setEnabled).toHaveBeenCalledWith(true);
    // Re-ingest the current scene from scratch on enable.
    expect(bundle.pathTracingService!.reset).toHaveBeenCalledWith(true);
    expect(requireSpy).toHaveBeenCalledWith('path-tracing');

    viewer.dispose();
  });

  it('disables path tracing live and drops the continuous-render demand', async () => {
    const bundle = makeDeps({
      options: { staticScene: true, pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const releaseSpy = jest.spyOn(RenderLoopManager.prototype, 'releaseContinuous');
    const viewer = new ViewerCore(bundle.deps);
    await viewer.initialize();
    bundle.pathTracingService!.setEnabled.mockClear();

    bundle.pathTracingService!.reset.mockClear();

    viewer.updateOptions({ pathTracing: { enabled: false } });
    await tick();

    expect(bundle.pathTracingService!.setEnabled).toHaveBeenCalledWith(false);
    // A converged tracer already self-paused, so setEnabled(false) is a no-op
    // and its completed frame is still preserved on the canvas — the reset is
    // what zeroes the accumulation so the raster renderer takes the canvas back.
    expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
    expect(releaseSpy).toHaveBeenCalledWith('path-tracing');

    viewer.dispose();
  });

  it('ignores a re-sent unchanged pathTracing.enabled (no thrash)', async () => {
    const bundle = makeDeps({
      options: { staticScene: true, pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);
    await viewer.initialize();
    bundle.pathTracingService!.setEnabled.mockClear();
    bundle.pathTracingService!.reset.mockClear();

    // The runtime-options effect re-sends the whole set; enabled is unchanged.
    viewer.updateOptions({ pathTracing: { enabled: true } });
    await tick();

    expect(bundle.pathTracingService!.setEnabled).not.toHaveBeenCalled();
    expect(bundle.pathTracingService!.reset).not.toHaveBeenCalled();

    viewer.dispose();
  });

  it('aborts a stale enable when disabled while the tracer chunk is still loading', async () => {
    // The tracer loads lazily, so enableRuntime awaits service.initialize().
    // Hold that promise open to interleave a disable during the load.
    let resolveInit: () => void = () => {};
    const initGate = new Promise<void>((res) => {
      resolveInit = res;
    });
    const bundle = makeDeps({
      options: { staticScene: true, pathTracing: { enabled: false } },
      withPathTracing: true,
      pathTracingOverrides: {
        initialize: jest.fn(() => initGate.then(() => Result.ok(undefined))),
      },
    });
    const requireSpy = jest.spyOn(RenderLoopManager.prototype, 'requireContinuous');
    const viewer = new ViewerCore(bundle.deps);
    await viewer.initialize();
    requireSpy.mockClear();
    bundle.pathTracingService!.setEnabled.mockClear();

    viewer.updateOptions({ pathTracing: { enabled: true } }); // enable → suspends on init
    await tick();
    viewer.updateOptions({ pathTracing: { enabled: false } }); // disable while loading
    await tick();

    resolveInit(); // the enable's await now resolves — but intent is OFF
    await tick(6);

    // The stale enable must NOT turn the tracer back on or leak a continuous
    // demand behind a UI that reads OFF.
    expect(bundle.pathTracingService!.setEnabled).not.toHaveBeenCalledWith(true);
    expect(requireSpy).not.toHaveBeenCalledWith('path-tracing');
    // The disable did take effect.
    expect(bundle.pathTracingService!.setEnabled).toHaveBeenCalledWith(false);

    viewer.dispose();
  });

  it('ignores updates that do not include a background color', () => {
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore(bundle.deps);
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    viewer.updateOptions({ staticScene: true });

    expect(bundle.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
  });

  it('applies tone-mapping exposure and environment intensity live', () => {
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({
      renderer: { toneMappingExposure: 1.4 },
      environment: { environmentIntensity: 0.6 },
    });

    expect(bundle.renderer.setToneMappingExposure).toHaveBeenCalledWith(1.4);
    expect(bundle.scene.setEnvironmentIntensity).toHaveBeenCalledWith(0.6);
  });

  it('skips the live setters when those fields are absent', () => {
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({ renderer: {}, environment: {} });

    expect(bundle.renderer.setToneMappingExposure).not.toHaveBeenCalled();
    expect(bundle.scene.setEnvironmentIntensity).not.toHaveBeenCalled();
  });

  it('is a no-op after dispose', () => {
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore(bundle.deps);
    viewer.dispose();
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    viewer.updateOptions({ backgroundColor: '#abcdef' });

    expect(bundle.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
  });
});

describe('ViewerCore runtime environment/background', () => {
  const failure = (message: string) => Result.err(new ThreeViewerError(message, ErrorCode.OPERATION_FAILED));

  const initialized = async (config: MakeDepsConfig = {}) => {
    const bundle = makeDeps({ withEnvironment: true, withSceneSetup: true, ...config });
    const viewer = new ViewerCore(bundle.deps);
    await viewer.initialize();
    return { bundle, viewer };
  };

  it('setEnvironmentMap loads the HDRI and applies it as environment + background', async () => {
    const { bundle, viewer } = await initialized();

    const result = await viewer.setEnvironmentMap('/env/sky_2k.hdr');

    expect(result.ok).toBe(true);
    expect(bundle.environmentService!.loadEnvironmentMap).toHaveBeenCalledWith('/env/sky_2k.hdr');
    expect(bundle.environmentService!.applyToScene).toHaveBeenCalledWith(
      bundle.scene,
      expect.anything(),
      expect.objectContaining({ setBackground: true })
    );
  });

  it('setEnvironmentMap surfaces a load failure', async () => {
    const { viewer } = await initialized({
      environmentOverrides: { loadEnvironmentMap: jest.fn(async () => failure('boom')) },
    });

    const result = await viewer.setEnvironmentMap('/bad.hdr');

    expect(result.ok).toBe(false);
  });

  it('setEnvironmentMap errors without an environment service', async () => {
    const bundle = makeDeps({ withSceneSetup: true });
    const viewer = new ViewerCore(bundle.deps);
    await viewer.initialize();

    const result = await viewer.setEnvironmentMap('/env.hdr');

    expect(result.ok).toBe(false);
  });

  it('resetEnvironment restores the studio env (no background) and the clean color', async () => {
    const { bundle, viewer } = await initialized({ options: { backgroundColor: '#101010' } });
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    const result = viewer.resetEnvironment();

    expect(result.ok).toBe(true);
    expect(bundle.environmentService!.createStudioEnvironment).toHaveBeenCalled();
    expect(bundle.environmentService!.applyToScene).toHaveBeenLastCalledWith(
      bundle.scene,
      expect.anything(),
      expect.objectContaining({ setBackground: false })
    );
    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(bundle.scene, {
      topColor: '#101010',
      bottomColor: '#101010',
    });
  });

  it('setBackgroundImage delegates to the environment service', async () => {
    const { bundle, viewer } = await initialized();

    const result = await viewer.setBackgroundImage('/photo.jpg');

    expect(result.ok).toBe(true);
    expect(bundle.environmentService!.setBackgroundImage).toHaveBeenCalledWith(bundle.scene, '/photo.jpg');
  });

  it('setBackgroundImage surfaces a service failure', async () => {
    const { viewer } = await initialized({
      environmentOverrides: { setBackgroundImage: jest.fn(async () => failure('bad image')) },
    });

    const result = await viewer.setBackgroundImage('/bad.png');

    expect(result.ok).toBe(false);
  });

  it('setBackgroundColor paints a solid gradient even with an env url configured', async () => {
    const { bundle, viewer } = await initialized({ options: { environment: { url: '/env.hdr' } } });

    const result = viewer.setBackgroundColor('#abcdef');

    expect(result.ok).toBe(true);
    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenLastCalledWith(bundle.scene, {
      topColor: '#abcdef',
      bottomColor: '#abcdef',
    });
  });

  it('setBackgroundColor errors without a scene setup service', async () => {
    const bundle = makeDeps({ withEnvironment: true });
    const viewer = new ViewerCore(bundle.deps);
    await viewer.initialize();

    const result = viewer.setBackgroundColor('#ffffff');

    expect(result.ok).toBe(false);
  });

  it('resetEnvironment restores a preset radial vignette instead of flattening it', async () => {
    const { bundle, viewer } = await initialized({
      options: { backgroundColor: '#242430', backgroundColorEdge: '#050507' },
    });
    bundle.sceneSetupService!.createGradientBackground.mockClear();

    viewer.resetEnvironment();

    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenCalledWith(bundle.scene, {
      topColor: '#242430',
      bottomColor: '#050507',
      radial: true,
    });
  });

  it('setBackgroundColor clears a radial vignette to a flat solid fill (and keeps it flat on restore)', async () => {
    const { bundle, viewer } = await initialized({
      options: { backgroundColor: '#242430', backgroundColorEdge: '#050507' },
    });

    viewer.setBackgroundColor('#abcdef');

    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenLastCalledWith(bundle.scene, {
      topColor: '#abcdef',
      bottomColor: '#abcdef',
    });

    // The edge is cleared, so restoring the environment stays flat too.
    bundle.sceneSetupService!.createGradientBackground.mockClear();
    viewer.resetEnvironment();
    expect(bundle.sceneSetupService!.createGradientBackground).toHaveBeenLastCalledWith(bundle.scene, {
      topColor: '#abcdef',
      bottomColor: '#abcdef',
    });
  });
});

describe('ViewerCore.captureStill', () => {
  const makeCaptureBundle = (config: MakeDepsConfig = {}, pixelRatio = 2) => {
    const canvas = makeCanvas(800, 600);
    Object.defineProperty(canvas, 'clientWidth', { value: 400, configurable: true });
    Object.defineProperty(canvas, 'clientHeight', { value: 300, configurable: true });
    canvas.toDataURL = jest.fn(() => 'data:image/png;base64,still');

    // Mirror the real renderer: the drawing buffer is the last logical size
    // scaled by the current pixel ratio, and setPixelRatio re-applies the last
    // logical size (three.js WebGLRenderer semantics).
    let ratio = pixelRatio;
    let logicalWidth = 400;
    let logicalHeight = 300;
    const applyBuffer = () => {
      canvas.width = Math.floor(logicalWidth * ratio);
      canvas.height = Math.floor(logicalHeight * ratio);
    };
    const bundle = makeDeps({
      ...config,
      canvas,
      rendererOverrides: {
        setPixelRatio: jest.fn((next: number) => {
          ratio = next;
          applyBuffer();
        }),
        getPixelRatio: jest.fn(() => ratio),
        setSize: jest.fn((width: number, height: number) => {
          logicalWidth = width;
          logicalHeight = height;
          applyBuffer();
        }),
        ...config.rendererOverrides,
      },
    });
    return { ...bundle, canvas };
  };

  it('renders one frame at the exact requested resolution and restores the live size', async () => {
    const bundle = makeCaptureBundle();
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill({ width: 1600, height: 1200 });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe('data:image/png;base64,still');
    // Captured with pixel ratio 1 so width/height are exact output pixels...
    expect(bundle.renderer.setPixelRatio).toHaveBeenNthCalledWith(1, 1);
    expect(bundle.renderer.setSize).toHaveBeenCalledWith(1600, 1200);
    expect(bundle.renderer.render).toHaveBeenCalled();
    // ...then the live pixel ratio and canvas size come back.
    expect(bundle.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(bundle.renderer.setSize).toHaveBeenLastCalledWith(400, 300);
    expect(bundle.canvas.width).toBe(800);
    expect(bundle.canvas.height).toBe(600);
  });

  it('restores the camera aspect after capturing at a different one', async () => {
    const bundle = makeCaptureBundle();
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill({ width: 1600, height: 400 });

    expect(result.ok).toBe(true);
    const aspect = (bundle.camera as unknown as { aspect: number }).aspect;
    expect(aspect).toBeCloseTo(400 / 300);
    expect(bundle.camera.updateProjectionMatrix).toHaveBeenCalled();
  });

  it('defaults to the drawing-buffer size', async () => {
    const bundle = makeCaptureBundle();
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill();

    expect(result.ok).toBe(true);
    // 400x300 CSS at pixel ratio 2 → an 800x600 still, rendered at ratio 1.
    expect(bundle.renderer.setSize).toHaveBeenCalledWith(800, 600);
  });

  it('keeps the canvas aspect when only one dimension is given', async () => {
    const bundle = makeCaptureBundle();
    const viewer = new ViewerCore(bundle.deps);

    await viewer.captureStill({ width: 1000 });
    expect(bundle.renderer.setSize).toHaveBeenCalledWith(1000, 750);

    await viewer.captureStill({ height: 900 });
    expect(bundle.renderer.setSize).toHaveBeenCalledWith(1200, 900);
  });

  it('falls back to buffer-derived logical size when the canvas has no layout', async () => {
    const bundle = makeCaptureBundle();
    Object.defineProperty(bundle.canvas, 'clientWidth', { value: 0, configurable: true });
    Object.defineProperty(bundle.canvas, 'clientHeight', { value: 0, configurable: true });
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill();

    expect(result.ok).toBe(true);
    // Buffer 800x600 at ratio 2 → logical 400x300 → default still 800x600,
    // and the restore must NOT inflate the buffer to 1600x1200.
    expect(bundle.renderer.setSize).toHaveBeenLastCalledWith(400, 300);
    expect(bundle.canvas.width).toBe(800);
  });

  it('rejects sizes outside the renderer limits', async () => {
    const bundle = makeCaptureBundle();
    const viewer = new ViewerCore(bundle.deps);

    const tooBig = await viewer.captureStill({ width: 99999 });
    expect(tooBig.ok).toBe(false);
    expect(!tooBig.ok && tooBig.error.code).toBe(ErrorCode.INVALID_PARAMETER);

    const zero = await viewer.captureStill({ width: 0 });
    expect(zero.ok).toBe(false);
  });

  it('fails after dispose', async () => {
    const bundle = makeCaptureBundle();
    const viewer = new ViewerCore(bundle.deps);
    viewer.dispose();

    const result = await viewer.captureStill();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
  });

  it('propagates a render failure and still restores the live size', async () => {
    const bundle = makeCaptureBundle({
      rendererOverrides: {
        render: jest.fn(() =>
          Result.err(new ThreeViewerError('boom', ErrorCode.RENDER_FAILED))
        ),
      },
    });
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill({ width: 1024 });

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.RENDER_FAILED);
    expect(bundle.renderer.setPixelRatio).toHaveBeenLastCalledWith(2);
    expect(bundle.renderer.setSize).toHaveBeenLastCalledWith(400, 300);
  });

  it('reports an empty canvas as a render failure', async () => {
    const bundle = makeCaptureBundle();
    (bundle.canvas.toDataURL as jest.Mock).mockReturnValue('data:,');
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill();
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.RENDER_FAILED);
  });

  it('rejects explicit dimensions in path-traced mode', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
    });
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill({ width: 2048 });
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
  });

  it('waits for an active path tracer to complete, then captures the canvas as-is', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    let settled = false;
    const capture = viewer.captureStill().then((result) => {
      settled = true;
      return result;
    });

    await tick();
    expect(settled).toBe(false);

    viewer.getEvents().emit('pathtracing:complete', { samples: 16, totalTime: 1000 });
    const result = await capture;

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe('data:image/png;base64,still');
    // The accumulated frame is captured directly — no resize, no re-render.
    expect(bundle.renderer.setSize).not.toHaveBeenCalled();
  });

  it('settles with INVALID_STATE when the viewer is disposed mid-wait', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    const capture = viewer.captureStill();
    await tick();
    viewer.dispose();

    const result = await capture;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
  });

  it('settles with INVALID_STATE when the turntable spins up mid-wait', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    const capture = viewer.captureStill();
    await tick();

    // Enabling autoRotate resets the accumulation every frame — the pending
    // wait can never converge and must reject like the up-front check does.
    viewer.updateOptions({ controls: { autoRotate: true } });

    const result = await capture;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(!result.ok && result.error.message).toMatch(/turntable/);
  });

  it('survives a re-send of an unchanged autoRotate:true mid-wait', async () => {
    // Turntable configured on but imperatively paused: options still say true
    // while the controls themselves were flipped off, so the up-front
    // turntable check passes and the capture starts waiting.
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true }, controls: { autoRotate: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    const capture = viewer.captureStill();
    await tick();

    // The runtime-options effect re-sends the whole set; an unchanged value
    // must neither restart the paused turntable nor reject the pending wait.
    viewer.updateOptions({ controls: { autoRotate: true } });
    expect(bundle.controls.autoRotate).toBe(false);

    viewer.getEvents().emit('pathtracing:complete', { samples: 16, totalTime: 1000 });
    const result = await capture;

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe('data:image/png;base64,still');
  });

  it('settles with INVALID_STATE when the turntable spins up mid-wait on the raw controls', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    let settled = false;
    const capture = viewer.captureStill().then((result) => {
      settled = true;
      return result;
    });
    await tick();

    // A manual drag emits controls:change too but converges after release —
    // without autoRotate set it must NOT reject the wait.
    viewer.getEvents().emit('controls:change', { controls: bundle.controls });
    await tick();
    expect(settled).toBe(false);

    // autoRotate flipped directly on the raw controls the handle exposes
    // never goes through updateOptions — the rotating camera's per-frame
    // controls:change is the only signal the pending wait can observe.
    bundle.controls.autoRotate = true;
    viewer.getEvents().emit('controls:change', { controls: bundle.controls });

    const result = await capture;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(!result.ok && result.error.message).toMatch(/turntable/);
  });

  it('settles with RENDER_FAILED when the model errors mid-wait', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);

    const capture = viewer.captureStill();
    await tick();
    viewer.getEvents().emit('model:error', {
      error: new ThreeViewerError('load failed', ErrorCode.MODEL_LOAD_FAILED),
      url: 'model.glb',
    });

    const result = await capture;
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.RENDER_FAILED);
  });

  it('settles instead of hanging when the path tracer gives up mid-wait', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => true) },
    });
    const viewer = new ViewerCore(bundle.deps);
    // PathTracingCoordinator only wires its 'pathtracing:paused' -> self-pause
    // forwarding during initialize().
    await viewer.initialize();

    let settled = false;
    const capture = viewer.captureStill().then((result) => {
      settled = true;
      return result;
    });

    await tick();
    expect(settled).toBe(false);

    // The tracer abandoned this accumulation (renderer never ready / env
    // never arrived) without ever reaching the sample target — no
    // 'pathtracing:complete' will ever fire for it.
    bundle.pathTracingService!.events.emit('pathtracing:paused', { samples: 3, reason: 'gave-up' });
    const result = await capture;

    expect(result.ok).toBe(true);
    expect(result.ok && result.value).toBe('data:image/png;base64,still');
  });

  it('rejects with INVALID_STATE when the turntable is spinning during path tracing', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      controlsOverrides: { autoRotate: true },
    });
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
  });

  it('captures the canvas as-is when the path tracer is no longer accumulating', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: true,
      pathTracingOverrides: { isEnabled: jest.fn(() => false) },
    });
    const viewer = new ViewerCore(bundle.deps);

    // isEnabled() is false (post-completion reset / failed init) — no waiting,
    // no hang, just the canvas as it stands.
    const result = await viewer.captureStill();
    expect(result.ok).toBe(true);
    expect(bundle.renderer.setSize).not.toHaveBeenCalled();
  });

  it('falls back to a raster capture when path tracing is enabled but unavailable', async () => {
    const bundle = makeCaptureBundle({
      options: { pathTracing: { enabled: true } },
      withPathTracing: false,
    });
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill({ width: 1024 });
    expect(result.ok).toBe(true);
    expect(bundle.renderer.setSize).toHaveBeenCalledWith(1024, 768);
  });

  it('rejects with INVALID_STATE while a screenshot is replacing the canvas', async () => {
    jest.spyOn(ScreenshotManager.prototype, 'isActive').mockReturnValue(true);
    const bundle = makeCaptureBundle();
    const viewer = new ViewerCore(bundle.deps);

    const result = await viewer.captureStill();

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe(ErrorCode.INVALID_STATE);
    expect(bundle.renderer.setSize).not.toHaveBeenCalled();
  });
});

describe('ViewerCore selection wiring', () => {
  const makeSelectionService = () => ({
    initialize: jest.fn(),
    dispose: jest.fn(),
  });

  it('wires click-picking on initialize and emits object:selected on a hit', async () => {
    const bundle = makeDeps();
    const selectionService = makeSelectionService();
    const viewer = new ViewerCore({ ...bundle.deps, selectionService });

    await viewer.initialize();

    expect(selectionService.initialize).toHaveBeenCalledTimes(1);
    const wiring = selectionService.initialize.mock.calls[0][0];
    expect(wiring.canvas).toBe(bundle.canvas);
    expect(wiring.camera).toBe(bundle.camera);
    expect(wiring.bvh).toBeUndefined();

    const onSelected = jest.fn();
    viewer.getEvents().on('object:selected', onSelected);

    const pick = { object: makeObject3D(), point: { x: 1, y: 2, z: 3 } };
    wiring.onPick(pick);
    expect(onSelected).toHaveBeenCalledWith(pick);

    // A miss (empty space) emits nothing.
    wiring.onPick(null);
    expect(onSelected).toHaveBeenCalledTimes(1);
  });

  it('threads selection.bvh into the selection service wiring', async () => {
    const bundle = makeDeps({ options: { selection: { bvh: false } } });
    const selectionService = makeSelectionService();
    const viewer = new ViewerCore({ ...bundle.deps, selectionService });

    await viewer.initialize();

    expect(selectionService.initialize.mock.calls[0][0].bvh).toBe(false);
  });

  it('detaches the selection listeners on dispose', async () => {
    const bundle = makeDeps();
    const selectionService = makeSelectionService();
    const viewer = new ViewerCore({ ...bundle.deps, selectionService });

    await viewer.initialize();
    viewer.dispose();

    expect(selectionService.dispose).toHaveBeenCalled();

    // A pick delivered after dispose must not emit.
    const onSelected = jest.fn();
    viewer.getEvents().on('object:selected', onSelected);
    selectionService.initialize.mock.calls[0][0].onPick({
      object: makeObject3D(),
      point: { x: 0, y: 0, z: 0 },
    });
    expect(onSelected).not.toHaveBeenCalled();
  });

  it('exposes the loaded model via getModel', async () => {
    const bundle = makeDeps();
    const viewer = new ViewerCore(bundle.deps);
    expect(viewer.getModel()).toBeNull();

    await viewer.initialize();
    const result = await viewer.loadModel(makeObject3D());
    expect(result.ok).toBe(true);
    expect(viewer.getModel()).not.toBeNull();
  });
});
