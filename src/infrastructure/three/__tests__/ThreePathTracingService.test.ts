import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';
import { ThreePathTracingService } from '../ThreePathTracingService';
import {
  CONTACT_SHADOW_BAKED_NAME,
  CONTACT_SHADOW_HELPER_FLAG,
  CONTACT_SHADOW_LIVE_NAME,
} from '../ContactShadowBaker';
import { PathTracingScene } from '../types/PathTracerTypes';
import { IRenderer } from '../../../core/interfaces/IRenderer';
import { IScene } from '../../../core/interfaces/IScene';
import { ICamera } from '../../../core/interfaces/ICamera';
import { Result } from '../../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../../errors';

jest.mock('three-gpu-pathtracer', () => {
  class MockWebGLPathTracer {
    static instances: MockWebGLPathTracer[] = [];
    static shouldThrow = false;

    bounces = 0;
    transmissiveBounces = 0;
    renderScale = 0;
    dynamicLowRes = false;
    lowResScale = 0;
    environmentIntensity = 0;
    tiles = { set: jest.fn() };
    setScene = jest.fn();
    updateCamera = jest.fn();
    updateLights = jest.fn();
    renderSample = jest.fn();
    reset = jest.fn();
    dispose = jest.fn();

    constructor() {
      if (MockWebGLPathTracer.shouldThrow) {
        throw new Error('Mock path tracer construction failed');
      }
      MockWebGLPathTracer.instances.push(this);
    }
  }

  return { WebGLPathTracer: MockWebGLPathTracer };
});

interface MockPathTracerInstance {
  bounces: number;
  transmissiveBounces: number;
  renderScale: number;
  dynamicLowRes: boolean;
  lowResScale: number;
  environmentIntensity: number;
  tiles: { set: jest.Mock };
  copyQuad?: { render: jest.Mock };
  setScene: jest.Mock;
  updateCamera: jest.Mock;
  updateLights: jest.Mock;
  renderSample: jest.Mock;
  reset: jest.Mock;
  dispose: jest.Mock;
}

const PathTracerStatics = WebGLPathTracer as unknown as {
  instances: MockPathTracerInstance[];
  shouldThrow: boolean;
};

const lastPathTracer = (): MockPathTracerInstance =>
  PathTracerStatics.instances[PathTracerStatics.instances.length - 1];

interface ServiceInternals {
  pathTracer: MockPathTracerInstance | null;
  convertedEnvTexture: THREE.DataTexture | null;
  sceneInitialized: boolean;
  sampleCount: number;
  disposed: boolean;
  enabled: boolean;
  createAttempts: number;
  environmentWaitFrames: number;
  maxEnvironmentWaitFrames: number;
  settings: {
    samples: number;
    bounces: number;
    transmissiveBounces?: number;
    renderScale: number;
    lowResScale: number;
    dynamicLowRes: boolean;
    enablePathTracing: boolean;
  };
  createPathTracer(): Result<void>;
  convertToDataTexture(texture: THREE.Texture): THREE.DataTexture | null;
}

const peek = (service: ThreePathTracingService): ServiceInternals =>
  service as unknown as ServiceInternals;

interface StubThreeRenderer {
  toneMapping: THREE.ToneMapping;
  toneMappingExposure: number;
  autoClear: boolean;
  domElement: HTMLCanvasElement;
  setRenderTarget: jest.Mock;
  getRenderTarget: jest.Mock;
  clear: jest.Mock;
}

function createStubThreeRenderer(domElement?: HTMLCanvasElement): StubThreeRenderer {
  return {
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    autoClear: true,
    domElement: domElement ?? document.createElement('canvas'),
    setRenderTarget: jest.fn(),
    getRenderTarget: jest.fn(() => null),
    clear: jest.fn(),
  };
}

interface RendererMockHandle {
  renderer: IRenderer;
  render: jest.Mock<Result<void>, [IScene, ICamera]>;
  getInternalRenderer: jest.Mock<unknown, []>;
  internal: StubThreeRenderer;
}

function createRendererMock(internal: StubThreeRenderer): RendererMockHandle {
  const render = jest.fn<Result<void>, [IScene, ICamera]>(() => Result.ok(undefined));
  const getInternalRenderer = jest.fn<unknown, []>(() => internal);
  const renderer = { render, getInternalRenderer } as unknown as IRenderer;
  return { renderer, render, getInternalRenderer, internal };
}

function createSceneMock(threeScene: THREE.Scene | null): IScene {
  return {
    getInternalRenderer: jest.fn<THREE.Scene | null, []>(() => threeScene),
  } as unknown as IScene;
}

function createCameraMock(threeCamera: THREE.Camera | null): ICamera {
  return {
    getInternalRenderer: jest.fn<THREE.Camera | null, []>(() => threeCamera),
  } as unknown as ICamera;
}

function equirectTexture(): THREE.Texture {
  const texture = new THREE.Texture();
  texture.mapping = THREE.EquirectangularReflectionMapping;
  return texture;
}

interface TestContext {
  service: ThreePathTracingService;
  internal: StubThreeRenderer;
  rendererHandle: RendererMockHandle;
  threeScene: THREE.Scene;
  threeCamera: THREE.Camera;
  scene: IScene;
  camera: ICamera;
}

function setup(domElement?: HTMLCanvasElement): TestContext {
  const internal = createStubThreeRenderer(domElement);
  const rendererHandle = createRendererMock(internal);
  const service = new ThreePathTracingService();
  const threeScene = new THREE.Scene();
  const threeCamera = new THREE.PerspectiveCamera();
  const scene = createSceneMock(threeScene);
  const camera = createCameraMock(threeCamera);
  return { service, internal, rendererHandle, threeScene, threeCamera, scene, camera };
}

async function initialize(ctx: TestContext, enabled: boolean): Promise<void> {
  const result = await ctx.service.initialize({ renderer: ctx.rendererHandle.renderer, enabled });
  expect(result.ok).toBe(true);
}

const webgl2Context = {} as unknown as WebGL2RenderingContext;
const twoDContext = {
  drawImage: jest.fn(),
  getImageData: jest.fn(() => ({
    data: new Uint8ClampedArray(16),
    width: 2,
    height: 2,
    colorSpace: 'srgb',
  })),
} as unknown as CanvasRenderingContext2D;

describe('ThreePathTracingService', () => {
  beforeEach(() => {
    let nowCounter = 1_000_000;
    jest.spyOn(performance, 'now').mockImplementation(() => {
      nowCounter += 1000;
      return nowCounter;
    });

    const getContextImpl = (contextId: string): RenderingContext | null => {
      if (contextId === 'webgl2') return webgl2Context;
      if (contextId === '2d') return twoDContext;
      return null;
    };
    jest
      .spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockImplementation(getContextImpl as typeof HTMLCanvasElement.prototype.getContext);

    jest
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/png;base64,TEST');

    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    PathTracerStatics.instances.length = 0;
    PathTracerStatics.shouldThrow = false;
  });

  describe('constructor', () => {
    it('starts disabled with zero samples and default settings', () => {
      const service = new ThreePathTracingService();
      expect(service.isEnabled()).toBe(false);
      expect(service.getSampleCount()).toBe(0);
      expect(service.isPathTracerDisposed()).toBe(false);
      expect(peek(service).settings.samples).toBe(300);
      expect(peek(service).settings.bounces).toBe(4);
    });
  });

  describe('isSupported', () => {
    it('returns true when WebGL2 context is available', () => {
      const service = new ThreePathTracingService();
      expect(service.isSupported()).toBe(true);
    });

    it('returns false when WebGL2 context is unavailable', () => {
      (HTMLCanvasElement.prototype.getContext as jest.Mock).mockImplementation(() => null);
      const service = new ThreePathTracingService();
      expect(service.isSupported()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('succeeds when supported and stores renderer and enabled flag', async () => {
      const ctx = setup();
      const result = await ctx.service.initialize({
        renderer: ctx.rendererHandle.renderer,
        enabled: true,
      });
      expect(result.ok).toBe(true);
      expect(ctx.service.isEnabled()).toBe(true);
    });

    it('returns an error when path tracing is not supported', async () => {
      (HTMLCanvasElement.prototype.getContext as jest.Mock).mockImplementation(() => null);
      const ctx = setup();
      const result = await ctx.service.initialize({
        renderer: ctx.rendererHandle.renderer,
        enabled: true,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.PATH_TRACING_INIT_FAILED);
      }
    });

    it('returns an error when support detection throws', async () => {
      (HTMLCanvasElement.prototype.getContext as jest.Mock).mockImplementation(() => {
        throw new Error('context failure');
      });
      const ctx = setup();
      const result = await ctx.service.initialize({
        renderer: ctx.rendererHandle.renderer,
        enabled: false,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.PATH_TRACING_INIT_FAILED);
      }
    });
  });

  describe('createPathTracer disposed guard', () => {
    it('refuses to create a path tracer after disposal', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.dispose();

      const result = peek(ctx.service).createPathTracer();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_STATE);
      }
    });
  });

  describe('setEnabled', () => {
    it('enables path tracing when changing from disabled', () => {
      const service = new ThreePathTracingService();
      service.setEnabled(true);
      expect(service.isEnabled()).toBe(true);
    });

    it('is a no-op when the value does not change', () => {
      const service = new ThreePathTracingService();
      service.setEnabled(false);
      expect(service.isEnabled()).toBe(false);
    });

    it('resets renderer flags when disabling with a renderer present', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.internal.autoClear = false;

      ctx.service.setEnabled(false);

      expect(ctx.service.isEnabled()).toBe(false);
      expect(ctx.internal.autoClear).toBe(true);
      expect(peek(ctx.service).sceneInitialized).toBe(false);
    });

    it('disables safely when no renderer is attached', () => {
      const service = new ThreePathTracingService();
      service.setEnabled(true);
      service.setEnabled(false);
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe('updateSettings', () => {
    it('merges settings into the current configuration', () => {
      const service = new ThreePathTracingService();
      service.updateSettings({ bounces: 9, samples: 12 });
      expect(peek(service).settings.bounces).toBe(9);
      expect(peek(service).settings.samples).toBe(12);
    });

    it('toggles enabled state via enablePathTracing', () => {
      const service = new ThreePathTracingService();
      service.updateSettings({ enablePathTracing: true });
      expect(service.isEnabled()).toBe(true);
      service.updateSettings({ enablePathTracing: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('forwards settings to an existing path tracer', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      ctx.service.updateSettings({
        bounces: 7,
        transmissiveBounces: 3,
        renderScale: 0.9,
        lowResScale: 0.3,
        dynamicLowRes: false,
      });

      const tracer = lastPathTracer();
      expect(tracer.bounces).toBe(7);
      expect(tracer.transmissiveBounces).toBe(3);
      expect(tracer.renderScale).toBe(0.9);
      expect(tracer.lowResScale).toBe(0.3);
      expect(tracer.dynamicLowRes).toBe(false);
    });
  });

  describe('render guards', () => {
    it('returns ok immediately when disposed', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.dispose();
      const result = await ctx.service.render(ctx.scene, ctx.camera);
      expect(result.ok).toBe(true);
    });

    it('returns ok when no renderer is attached', async () => {
      const service = new ThreePathTracingService();
      const result = await service.render(createSceneMock(new THREE.Scene()), createCameraMock(new THREE.PerspectiveCamera()));
      expect(result.ok).toBe(true);
    });
  });

  describe('render when disabled', () => {
    it('delegates to the standard renderer', async () => {
      const ctx = setup();
      await initialize(ctx, false);
      const result = await ctx.service.render(ctx.scene, ctx.camera);
      expect(result.ok).toBe(true);
      expect(ctx.rendererHandle.render).toHaveBeenCalledWith(ctx.scene, ctx.camera);
    });

    it('propagates an error from the standard renderer', async () => {
      const ctx = setup();
      await initialize(ctx, false);
      ctx.rendererHandle.render.mockReturnValueOnce(
        Result.err(new ThreeViewerError('boom', ErrorCode.RENDER_FAILED))
      );
      const result = await ctx.service.render(ctx.scene, ctx.camera);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDER_FAILED);
      }
    });
  });

  describe('render path tracer creation', () => {
    it('falls back to the standard renderer while the renderer is not ready', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.rendererHandle.getInternalRenderer.mockReturnValue(null);

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.rendererHandle.render).toHaveBeenCalled();
      expect(peek(ctx.service).pathTracer).toBeNull();
      expect(peek(ctx.service).createAttempts).toBe(1);
    });

    it('disables path tracing when path tracer creation fails fatally', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      PathTracerStatics.shouldThrow = true;
      const pausedListener = jest.fn();
      ctx.service.events.on('pathtracing:paused', pausedListener);

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.service.isEnabled()).toBe(false);
      expect(ctx.rendererHandle.render).toHaveBeenCalled();
      // A self-disable must notify like a normal completion, or the render
      // loop's 'path-tracing' continuous demand leaks forever and a pending
      // captureStill() never settles.
      expect(pausedListener).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'gave-up' })
      );
    });

    it('returns the renderer error when fatal creation fallback also fails', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      PathTracerStatics.shouldThrow = true;
      ctx.rendererHandle.render.mockReturnValue(
        Result.err(new ThreeViewerError('fallback boom', ErrorCode.RENDER_FAILED))
      );

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDER_FAILED);
      }
    });
  });

  describe('render scene extraction', () => {
    it('errors when the Three.js scene cannot be extracted', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const sceneWithoutInternal = createSceneMock(null);

      const result = await ctx.service.render(sceneWithoutInternal, ctx.camera);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
      }
    });
  });

  describe('render scene initialization', () => {
    it('waits and falls back when no environment is available', async () => {
      const ctx = setup();
      await initialize(ctx, true);

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.rendererHandle.render).toHaveBeenCalled();
      expect(peek(ctx.service).environmentWaitFrames).toBe(1);
      expect(peek(ctx.service).sceneInitialized).toBe(false);
    });

    it('disables path tracing after exceeding the environment wait limit', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      peek(ctx.service).maxEnvironmentWaitFrames = 1;
      const pausedListener = jest.fn();
      ctx.service.events.on('pathtracing:paused', pausedListener);

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.service.isEnabled()).toBe(false);
      expect(peek(ctx.service).environmentWaitFrames).toBe(0);
      expect(pausedListener).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'gave-up' })
      );
    });

    it('initializes the scene from an existing equirectangular environment', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).sceneInitialized).toBe(true);
      expect(lastPathTracer().setScene).toHaveBeenCalled();
      expect(lastPathTracer().renderSample).toHaveBeenCalled();
      expect(ctx.service.getSampleCount()).toBe(1);
    });

    it('hides the contact-shadow helpers during scene ingest and restores them after', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();

      const baked = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial());
      baked.name = CONTACT_SHADOW_BAKED_NAME;
      baked.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
      const liveCatcher = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.ShadowMaterial());
      liveCatcher.name = CONTACT_SHADOW_LIVE_NAME;
      liveCatcher.userData[CONTACT_SHADOW_HELPER_FLAG] = true;
      liveCatcher.visible = false; // installBakedMesh leaves the live catcher hidden
      // A consumer's model node may collide with the helper NAME — only the
      // viewer-owned tag may select helpers.
      const impostor = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
      impostor.name = CONTACT_SHADOW_BAKED_NAME;
      ctx.threeScene.add(baked, liveCatcher, impostor);

      const bakedVisibilityWrites: boolean[] = [];
      let bakedVisible = true;
      Object.defineProperty(baked, 'visible', {
        configurable: true,
        get: () => bakedVisible,
        set: (value: boolean) => {
          bakedVisibilityWrites.push(value);
          bakedVisible = value;
        },
      });
      const liveVisibilityWrites: boolean[] = [];
      let liveVisible = false;
      Object.defineProperty(liveCatcher, 'visible', {
        configurable: true,
        get: () => liveVisible,
        set: (value: boolean) => {
          liveVisibilityWrites.push(value);
          liveVisible = value;
        },
      });

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(lastPathTracer().setScene).toHaveBeenCalled();
      // Hidden for the ingest, restored right after — the raster fallback
      // keeps its baked shadow.
      expect(bakedVisibilityWrites).toEqual([false, true]);
      // The already-hidden live catcher must NOT be force-shown afterwards.
      expect(liveVisibilityWrites).toEqual([]);
      expect(liveCatcher.visible).toBe(false);
      // The same-named consumer node is untouched — it stays in the ingest.
      expect(impostor.visible).toBe(true);
    });

    it('initializes from a cube-captured original (procedural studio room)', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const cubeTexture = new THREE.CubeTexture();
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = cubeTexture;

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).sceneInitialized).toBe(true);
      expect(lastPathTracer().setScene).toHaveBeenCalled();
      // The cube stood in only for the ingest — the raster pipeline keeps
      // whatever environment the scene actually had.
      expect(ctx.threeScene.environment).toBeNull();
    });

    it('initializes from the original equirectangular data texture', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const dataTexture = new THREE.DataTexture(new Float32Array(4), 1, 1);
      dataTexture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = dataTexture;

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).sceneInitialized).toBe(true);
      expect(lastPathTracer().setScene).toHaveBeenCalled();
    });

    it('converts an HTMLImageElement environment texture to a data texture', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const img = document.createElement('img');
      Object.defineProperty(img, 'width', { value: 2 });
      Object.defineProperty(img, 'height', { value: 2 });
      const texture = new THREE.Texture(img);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = texture;

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).convertedEnvTexture).not.toBeNull();
      expect(lastPathTracer().setScene).toHaveBeenCalled();
    });

    it('reuses an already converted environment texture', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const img = document.createElement('img');
      Object.defineProperty(img, 'width', { value: 2 });
      Object.defineProperty(img, 'height', { value: 2 });
      const texture = new THREE.Texture(img);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = texture;

      const cached = new THREE.DataTexture(new Float32Array(4), 1, 1);
      peek(ctx.service).convertedEnvTexture = cached;

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).convertedEnvTexture).toBe(cached);
    });

    it('awaits an incomplete image during scene initialization', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const img = document.createElement('img');
      Object.defineProperty(img, 'width', { value: 2 });
      Object.defineProperty(img, 'height', { value: 2 });
      Object.defineProperty(img, 'complete', { value: false, configurable: true });
      const texture = new THREE.Texture(img);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = texture;

      const pending = ctx.service.render(ctx.scene, ctx.camera);
      img.onload?.(new Event('load'));
      const result = await pending;

      expect(result.ok).toBe(true);
      expect(texture.version).toBeGreaterThan(0);
      expect(peek(ctx.service).sceneInitialized).toBe(true);
    });

    it('resolves when the awaited image errors during scene initialization', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const img = document.createElement('img');
      Object.defineProperty(img, 'width', { value: 2 });
      Object.defineProperty(img, 'height', { value: 2 });
      Object.defineProperty(img, 'complete', { value: false, configurable: true });
      const texture = new THREE.Texture(img);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = texture;

      const pending = ctx.service.render(ctx.scene, ctx.camera);
      img.onerror?.(new Event('error'));
      const result = await pending;

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).sceneInitialized).toBe(true);
    });

    it('falls back when the image texture cannot be converted', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      (HTMLCanvasElement.prototype.getContext as jest.Mock).mockImplementation(
        (contextId: string) => (contextId === '2d' ? null : webgl2Context)
      );
      const img = document.createElement('img');
      Object.defineProperty(img, 'width', { value: 2 });
      Object.defineProperty(img, 'height', { value: 2 });
      const texture = new THREE.Texture(img);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = texture;

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).sceneInitialized).toBe(false);
      expect(ctx.rendererHandle.render).toHaveBeenCalled();
    });

    it('disables path tracing for a non-equirectangular environment without an original', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = new THREE.Texture();
      const pausedListener = jest.fn();
      ctx.service.events.on('pathtracing:paused', pausedListener);

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.service.isEnabled()).toBe(false);
      expect(peek(ctx.service).sceneInitialized).toBe(false);
      // This self-disable must notify the same way as the other give-up
      // paths, or the render loop's 'path-tracing' continuous demand leaks
      // forever and a pending captureStill() never settles.
      expect(pausedListener).toHaveBeenCalledWith(
        expect.objectContaining({ reason: 'gave-up' })
      );
    });

    it('falls back when setScene throws during initialization', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const dataTexture = new THREE.DataTexture(new Float32Array(4), 1, 1);
      dataTexture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = dataTexture;

      await ctx.service.render(ctx.scene, ctx.camera);
      peek(ctx.service).sceneInitialized = false;
      lastPathTracer().setScene.mockImplementationOnce(() => {
        throw new Error('setScene failed');
      });

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(peek(ctx.service).sceneInitialized).toBe(false);
      expect(ctx.rendererHandle.render).toHaveBeenCalled();
    });
  });

  describe('render accumulation', () => {
    it('configures the path tracer on creation', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();

      await ctx.service.render(ctx.scene, ctx.camera);

      const tracer = lastPathTracer();
      expect(tracer.tiles.set).toHaveBeenCalledWith(1, 1);
      // Env intensity and tone mapping are NO LONGER overridden here — the
      // tracer inherits scene.environmentIntensity and the renderer's operator
      // so the converged frame matches the raster preview. (The removed
      // `environmentIntensity = 2.0` was dead code: three-gpu-pathtracer reads
      // scene.environmentIntensity, not this property, so the mock's value
      // stays at its constructor default.)
      expect(tracer.environmentIntensity).toBe(0);
    });

    it('does not override the renderer tone mapping (inherits it)', async () => {
      const ctx = setup();
      ctx.internal.toneMapping = THREE.ACESFilmicToneMapping;
      ctx.internal.toneMappingExposure = 0.25;
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();

      await ctx.service.render(ctx.scene, ctx.camera);

      expect(ctx.internal.toneMappingExposure).toBe(0.25);
    });

    it('propagates a standard renderer failure during accumulation', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      ctx.rendererHandle.render.mockReturnValueOnce(
        Result.err(new ThreeViewerError('accumulation boom', ErrorCode.RENDER_FAILED))
      );

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDER_FAILED);
      }
    });

    it('continues when light updates fail on the first sample', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      ctx.service.reset();
      lastPathTracer().updateLights.mockImplementationOnce(() => {
        throw new Error('light failure');
      });

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.service.getSampleCount()).toBe(1);
    });

    it('errors when the internal renderer disappears during accumulation', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      ctx.rendererHandle.getInternalRenderer.mockReturnValueOnce(null);

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDER_FAILED);
      }
    });
  });

  describe('render completion', () => {
    it('emits paused and keeps the tracer warm so a camera move can resume', async () => {
      jest.useFakeTimers();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);
      document.body.appendChild(parent);

      const ctx = setup(canvas);
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();

      const pausedListener = jest.fn();
      ctx.service.events.on('pathtracing:paused', pausedListener);

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(pausedListener).toHaveBeenCalledWith({ samples: 1, reason: 'completed' });
      expect(ctx.service.isEnabled()).toBe(false);
      expect(ctx.service.canResume()).toBe(true);

      // The service presents the final frame on the canvas without creating any
      // DOM overlay or hiding the canvas — that is the presentation layer's job.
      expect(canvas.style.visibility).toBe('');

      // The tracer and its ingested scene survive completion: disposing them
      // here is what froze the canvas on the first post-convergence camera
      // move (nothing left to accumulate with, nothing re-rendering).
      const tracer = lastPathTracer();
      jest.advanceTimersByTime(1000);
      expect(tracer.dispose).not.toHaveBeenCalled();
      expect(peek(ctx.service).pathTracer).not.toBeNull();
      expect(peek(ctx.service).sceneInitialized).toBe(true);

      ctx.service.dispose();
      document.body.removeChild(parent);
    });

    it('resumes accumulation after completion when re-enabled by a camera move', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();

      await ctx.service.render(ctx.scene, ctx.camera);
      expect(ctx.service.isEnabled()).toBe(false);

      // The coordinator's re-arm path: camera-move reset + setEnabled(true).
      ctx.service.reset();
      ctx.service.setEnabled(true);
      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.service.getSampleCount()).toBe(1);
      // No re-ingest happened — the warm scene was reused.
      expect(lastPathTracer().setScene).toHaveBeenCalledTimes(1);
    });

    it('uses the copy quad to present the final frame when available', async () => {
      jest.useFakeTimers();
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 2 });
      ctx.threeScene.environment = equirectTexture();

      await ctx.service.render(ctx.scene, ctx.camera);
      const copyRender = jest.fn();
      const tracer = peek(ctx.service).pathTracer;
      if (tracer) {
        tracer.copyQuad = { render: copyRender };
      }

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(copyRender).toHaveBeenCalledWith(ctx.internal);
      expect(ctx.service.getSampleCount()).toBe(2);

      ctx.service.dispose();
    });

    it('completes path tracing even when frame capture fails', async () => {
      jest.useFakeTimers();
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();
      (HTMLCanvasElement.prototype.toDataURL as jest.Mock).mockImplementation(() => {
        throw new Error('capture failed');
      });

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.service.isEnabled()).toBe(false);

      ctx.service.dispose();
    });

    it('keeps the completed frame on screen on subsequent renders', async () => {
      jest.useFakeTimers();
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);
      ctx.internal.setRenderTarget.mockClear();

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.internal.setRenderTarget).toHaveBeenCalledWith(null);

      jest.advanceTimersByTime(100);
      const afterDispose = await ctx.service.render(ctx.scene, ctx.camera);
      expect(afterDispose.ok).toBe(true);

      ctx.service.dispose();
    });
  });

  describe('reset', () => {
    it('a camera-move reset re-syncs the camera without re-ingesting the scene', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);
      expect(ctx.service.getSampleCount()).toBe(1);

      ctx.service.reset();

      expect(ctx.service.getSampleCount()).toBe(0);
      // The tracer is untouched during motion; the camera re-sync is deferred
      // to the moment accumulation restarts. A full setScene() re-ingest per
      // camera move is what tore frames apart during turntable rotation.
      expect(lastPathTracer().updateCamera).not.toHaveBeenCalled();
      expect(peek(ctx.service).sceneInitialized).toBe(true);

      // The mocked clock advances 1s per call, so the settle window has
      // passed by the next render: accumulation resumes with ONE camera
      // re-sync and no re-ingest.
      await ctx.service.render(ctx.scene, ctx.camera);
      expect(lastPathTracer().updateCamera).toHaveBeenCalledTimes(1);
      expect(lastPathTracer().setScene).toHaveBeenCalledTimes(1);
      expect(ctx.service.getSampleCount()).toBe(1);
    });

    it('renders raster-only while the camera is still inside the settle window', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      // Freeze the clock: the reset timestamp and the render check now read
      // the same instant, so the camera counts as still moving.
      (performance.now as jest.Mock).mockReturnValue(777_000);
      ctx.service.reset();
      lastPathTracer().renderSample.mockClear();
      ctx.rendererHandle.render.mockClear();

      const result = await ctx.service.render(ctx.scene, ctx.camera);

      expect(result.ok).toBe(true);
      expect(ctx.rendererHandle.render).toHaveBeenCalled();
      expect(lastPathTracer().renderSample).not.toHaveBeenCalled();
      expect(ctx.service.getSampleCount()).toBe(0);
    });

    it('a forced reset marks the ingested scene stale (model swap, pose change)', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      ctx.service.reset(true);

      expect(ctx.service.getSampleCount()).toBe(0);
      expect(lastPathTracer().reset).toHaveBeenCalled();
      expect(peek(ctx.service).sceneInitialized).toBe(false);

      await ctx.service.render(ctx.scene, ctx.camera);
      expect(lastPathTracer().setScene).toHaveBeenCalledTimes(2);
    });

    it('consecutive camera-move resets all apply (no throttle window)', () => {
      (performance.now as jest.Mock).mockReturnValue(500_000);
      const service = new ThreePathTracingService();
      service.reset();
      peek(service).sampleCount = 5;
      service.reset();
      expect(service.getSampleCount()).toBe(0);
    });

    it('resets the count before a tracer exists', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      peek(ctx.service).sampleCount = 5;
      ctx.service.reset();
      expect(ctx.service.getSampleCount()).toBe(0);
    });
  });

  describe('canResume', () => {
    it('is true after a completed accumulation and false after dispose', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      expect(ctx.service.canResume()).toBe(true);
      ctx.service.dispose();
      expect(ctx.service.canResume()).toBe(false);
    });

    it('is false after a give-up pause — nothing warm to resume', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = new THREE.Texture();

      await ctx.service.render(ctx.scene, ctx.camera);

      expect(ctx.service.isEnabled()).toBe(false);
      expect(ctx.service.canResume()).toBe(false);
    });

    it('is false after an explicit setEnabled(false) — the consumer said off', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);
      expect(ctx.service.canResume()).toBe(true);

      ctx.service.setEnabled(true);
      ctx.service.setEnabled(false);

      expect(ctx.service.canResume()).toBe(false);
    });
  });

  describe('completion does not touch the DOM', () => {
    it('creates no <img> overlay and leaves the canvas visible on completion', async () => {
      jest.useFakeTimers();
      const parent = document.createElement('div');
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);
      document.body.appendChild(parent);

      const ctx = setup(canvas);
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      // DOM overlay management is the presentation layer's concern: the service
      // presents the final frame on the canvas and emits an event, nothing more.
      expect(parent.querySelector('img')).toBeNull();
      expect(canvas.style.visibility).toBe('');

      ctx.service.dispose();
      document.body.removeChild(parent);
    });
  });

  describe('convertToDataTexture', () => {
    it('returns null for textures that are not HTMLImageElements', () => {
      const service = new ThreePathTracingService();
      const dataTexture = new THREE.DataTexture(new Float32Array(4), 1, 1);
      expect(peek(service).convertToDataTexture(dataTexture)).toBeNull();
    });
  });

  describe('dispose', () => {
    it('disposes the path tracer and converted texture and clears state', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      const img = document.createElement('img');
      Object.defineProperty(img, 'width', { value: 2 });
      Object.defineProperty(img, 'height', { value: 2 });
      const texture = new THREE.Texture(img);
      texture.mapping = THREE.EquirectangularReflectionMapping;
      (ctx.threeScene as PathTracingScene).__originalEnvironmentTexture = texture;
      await ctx.service.render(ctx.scene, ctx.camera);

      const tracer = lastPathTracer();
      const converted = peek(ctx.service).convertedEnvTexture;
      const convertedSpy = converted ? jest.spyOn(converted, 'dispose') : jest.fn();

      ctx.service.dispose();

      expect(tracer.dispose).toHaveBeenCalled();
      expect(convertedSpy).toHaveBeenCalled();
      expect(ctx.service.isPathTracerDisposed()).toBe(true);
      expect(ctx.service.getSampleCount()).toBe(0);
    });

    it('continues disposal when the path tracer throws', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);
      lastPathTracer().dispose.mockImplementationOnce(() => {
        throw new Error('dispose failure');
      });

      expect(() => ctx.service.dispose()).not.toThrow();
      expect(peek(ctx.service).pathTracer).toBeNull();
    });

    it('disposes the tracer exactly once after a completed accumulation', async () => {
      jest.useFakeTimers();
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.updateSettings({ samples: 1 });
      ctx.threeScene.environment = equirectTexture();
      await ctx.service.render(ctx.scene, ctx.camera);

      const tracer = lastPathTracer();
      ctx.service.dispose();

      expect(tracer.dispose).toHaveBeenCalledTimes(1);
      jest.advanceTimersByTime(200);
      expect(tracer.dispose).toHaveBeenCalledTimes(1);
    });

    it('is safe to call twice', async () => {
      const ctx = setup();
      await initialize(ctx, true);
      ctx.service.dispose();
      expect(() => ctx.service.dispose()).not.toThrow();
      expect(ctx.service.isPathTracerDisposed()).toBe(true);
    });
  });
});
