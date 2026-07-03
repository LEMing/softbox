import { ViewerCore, ViewerDependencies } from '../ViewerCore';
import {
  IRenderer,
  IScene,
  ICamera,
  IControls,
  IModelLoader,
  IObject3D,
  IVector3,
  ITexture,
  IAnchorProjectionService,
  IAnchorProjector,
  Result,
} from '../interfaces';
import { IPathTracingService } from '../services/IPathTracingService';
import { IEnvironmentService } from '../services/IEnvironmentService';
import { ISceneSetupService } from '../services/ISceneSetupService';
import { IFloorAlignmentService } from '../services/IFloorAlignmentService';
import { SimpleViewerOptions } from '../../types/SimpleViewerOptions';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { RenderLoopManager } from '../utils/RenderLoopManager';
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
    getDomElement: jest.fn(() => canvas),
    getContext: jest.fn(() => null),
    dispose: jest.fn(),
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
    target: makeVector3(),
    update: jest.fn(() => false),
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
    events: new TypedEventEmitter<{ 'pathtracing:paused': { samples: number } }>(),
    initialize: jest.fn(async () => Result.ok(undefined)),
    setEnabled: jest.fn(),
    updateSettings: jest.fn(),
    render: jest.fn(async () => Result.ok(undefined)),
    getSampleCount: jest.fn(() => 0),
    isEnabled: jest.fn(() => false),
    isPathTracerDisposed: jest.fn(() => false),
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
        'enableContinuousRendering'
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
        'Failed to load environment map:',
        expect.any(ThreeViewerError)
      );
      expect(bundle.environmentService!.applyToScene).not.toHaveBeenCalled();
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
        'disableContinuousRendering'
      );
      const setAlwaysRenderSpy = jest.spyOn(
        RenderLoopManager.prototype,
        'setAlwaysRender'
      );
      const stopSpy = jest.spyOn(RenderLoopManager.prototype, 'stop');
      const viewer = new ViewerCore(bundle.deps);
      await viewer.initialize();

      bundle.pathTracingService!.events.emit('pathtracing:paused', { samples: 50 });

      expect(disableContinuousSpy).toHaveBeenCalled();
      expect(setAlwaysRenderSpy).toHaveBeenCalledWith(false);

      jest.advanceTimersByTime(150);
      expect(stopSpy).toHaveBeenCalled();
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
  });

  describe('resize', () => {
    it('does nothing when the canvas dimensions are unchanged', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({ canvas });
      const viewer = new ViewerCore(bundle.deps);

      viewer.resize(640, 480);

      expect(bundle.renderer.setSize).not.toHaveBeenCalled();
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

    it('re-enables path tracing after resize when it was active', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({
        canvas,
        withPathTracing: true,
        pathTracingOverrides: {
          isEnabled: jest.fn(() => true),
        },
      });
      const viewer = new ViewerCore(bundle.deps);

      viewer.resize(1024, 768);

      expect(bundle.pathTracingService!.setEnabled).toHaveBeenCalledWith(true);
    });

    it('resets path tracing accumulation on resize after a completed render', () => {
      const canvas = makeCanvas(640, 480);
      const bundle = makeDeps({ canvas, withPathTracing: true });
      const viewer = new ViewerCore(bundle.deps);
      // Simulate a completed path-traced render whose final frame is on the canvas.
      const coordinator = (viewer as unknown as {
        pathTracing: { completeHandled: boolean };
      }).pathTracing;
      coordinator.completeHandled = true;

      viewer.resize(1024, 768);

      expect(bundle.pathTracingService!.reset).toHaveBeenCalled();
      expect(coordinator.completeHandled).toBe(false);
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
        rendererOverrides: { renderer: null },
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
      const internal = bundle.renderer.getInternalRenderer() as { autoClear: boolean };
      expect(internal.autoClear).toBe(false);

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

  it('does not override the background when an environment map is set', () => {
    const bundle = makeDeps({
      withSceneSetup: true,
      options: { environment: { url: 'https://example.com/env.hdr' } },
    });
    const viewer = new ViewerCore(bundle.deps);

    viewer.updateOptions({ backgroundColor: '#abcdef' });

    expect(bundle.sceneSetupService!.createGradientBackground).not.toHaveBeenCalled();
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
