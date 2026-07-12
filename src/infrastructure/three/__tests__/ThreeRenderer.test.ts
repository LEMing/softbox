import * as THREE from 'three';
import { ThreeRendererAdapter } from '../ThreeRenderer';
import { ThreeSceneAdapter } from '../ThreeScene';
import { ThreePerspectiveCameraAdapter } from '../ThreeCamera';
import { IScene } from '../../../core/interfaces/IScene';
import { ICamera } from '../../../core/interfaces/ICamera';
import { ErrorCode } from '../../../errors';

/**
 * jsdom has no WebGL, so THREE.WebGLRenderer is replaced with a recording
 * fake: the adapter's option mapping, render dispatch, fallbacks and lifecycle
 * are pure orchestration over it.
 */
const fakeInstances: FakeWebGLRenderer[] = [];
let constructorShouldThrow = false;

class FakeWebGLRenderer {
  constructorArgs: unknown;
  shadowMap = { enabled: false, autoUpdate: false, type: 0 };
  toneMapping = 0;
  toneMappingExposure = 1;
  outputColorSpace = '';
  domElement = document.createElement('canvas');
  capabilities = {
    maxTextureSize: 8192,
    maxCubemapSize: 8192,
    maxAttributes: 16,
    maxVertexUniforms: 1024,
    maxFragmentUniforms: 1024,
    maxSamples: 8,
    isWebGL2: true,
  };
  setPixelRatio = jest.fn();
  getPixelRatio = jest.fn(() => 2);
  setSize = jest.fn();
  render = jest.fn();
  getContext = jest.fn(() => ({ fake: 'gl' }));
  dispose = jest.fn();

  constructor(args: unknown) {
    if (constructorShouldThrow) {
      throw new Error('no webgl');
    }
    this.constructorArgs = args;
    fakeInstances.push(this);
  }
}

jest.mock('three', () => ({
  ...jest.requireActual('three'),
  WebGLRenderer: jest.fn().mockImplementation((args: unknown) => new FakeWebGLRenderer(args)),
}));

// The pipeline lazy-imports the three/examples pass chunk; unmocked, those
// ESM files fail to parse under jest and produce deterministic console.warn
// noise (harmless — load() catches it — but noisy). Mock them like
// PostProcessingPipeline.test.ts does.
jest.mock('three/examples/jsm/postprocessing/EffectComposer.js', () => ({
  EffectComposer: class {
    renderTarget1 = { samples: 0 };
    renderTarget2 = { samples: 0 };
    addPass() {}
    render() {}
    setSize() {}
    dispose() {}
  },
}));
jest.mock('three/examples/jsm/postprocessing/RenderPass.js', () => ({ RenderPass: class {} }));
jest.mock('three/examples/jsm/postprocessing/OutputPass.js', () => ({ OutputPass: class {} }));
jest.mock('three/examples/jsm/postprocessing/UnrealBloomPass.js', () => ({ UnrealBloomPass: class {} }));
jest.mock('three/examples/jsm/postprocessing/ShaderPass.js', () => ({
  ShaderPass: class {
    uniforms = { offset: { value: 0 }, darkness: { value: 0 }, contrast: { value: 0 }, saturation: { value: 0 } };
  },
}));
jest.mock('three/examples/jsm/shaders/VignetteShader.js', () => ({ VignetteShader: {} }));
jest.mock('three/examples/jsm/shaders/BrightnessContrastShader.js', () => ({ BrightnessContrastShader: {} }));
jest.mock('three/examples/jsm/shaders/HueSaturationShader.js', () => ({ HueSaturationShader: {} }));


const lastFake = () => fakeInstances[fakeInstances.length - 1];

const initialized = (options: Parameters<ThreeRendererAdapter['initialize']>[0] = {}) => {
  const adapter = new ThreeRendererAdapter();
  const result = adapter.initialize(options);
  expect(result.ok).toBe(true);
  return { adapter, fake: lastFake() };
};

const makeSceneAndCamera = () => ({
  scene: new ThreeSceneAdapter(new THREE.Scene()),
  camera: new ThreePerspectiveCameraAdapter(new THREE.PerspectiveCamera()),
});

describe('ThreeRendererAdapter', () => {
  beforeEach(() => {
    fakeInstances.length = 0;
    constructorShouldThrow = false;
  });

  describe('initialize', () => {
    it('maps the shadow-map options onto the renderer', () => {
      const { fake } = initialized({ shadowMap: { enabled: true, type: 'pcfsoft' } });
      expect(fake.shadowMap.enabled).toBe(true);
      expect(fake.shadowMap.autoUpdate).toBe(true);
      expect(fake.shadowMap.type).toBe(THREE.PCFSoftShadowMap);
    });

    it('maps every tone-mapping operator name to its THREE constant', () => {
      const expected: Array<[string, number]> = [
        ['none', THREE.NoToneMapping],
        ['linear', THREE.LinearToneMapping],
        ['reinhard', THREE.ReinhardToneMapping],
        ['cineon', THREE.CineonToneMapping],
        ['aces', THREE.ACESFilmicToneMapping],
        ['agx', THREE.AgXToneMapping],
        ['neutral', THREE.NeutralToneMapping],
      ];
      for (const [name, constant] of expected) {
        const { fake } = initialized({
          toneMapping: { type: name as 'neutral', exposure: 1.3 },
        });
        expect(fake.toneMapping).toBe(constant);
        expect(fake.toneMappingExposure).toBe(1.3);
      }
    });

    it('applies the requested pixel ratio unchanged when no post effect is on', () => {
      const { fake } = initialized({ pixelRatio: 3 });
      expect(fake.setPixelRatio).toHaveBeenCalledWith(3);
    });

    it('caps the pixel ratio at 2 when a post-processing effect is enabled', () => {
      const { fake } = initialized({ pixelRatio: 3, postProcessing: { bloom: true } });
      expect(fake.setPixelRatio).toHaveBeenCalledWith(2);
    });

    it('forces the sRGB output color space', () => {
      const { fake } = initialized();
      expect(fake.outputColorSpace).toBe(THREE.SRGBColorSpace);
    });

    it('returns an error result when the WebGL context cannot be created', () => {
      constructorShouldThrow = true;
      const adapter = new ThreeRendererAdapter();
      const result = adapter.initialize({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
      }
    });
  });

  describe('render', () => {
    it('errors before initialize', () => {
      const adapter = new ThreeRendererAdapter();
      const { scene, camera } = makeSceneAndCamera();
      const result = adapter.render(scene, camera);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_NOT_INITIALIZED);
      }
    });

    it('rejects non-adapter scene/camera arguments', () => {
      const { adapter } = initialized();
      const { scene, camera } = makeSceneAndCamera();
      expect(adapter.render({} as IScene, camera).ok).toBe(false);
      expect(adapter.render(scene, {} as ICamera).ok).toBe(false);
    });

    it('unwraps the adapters and renders the three scene', () => {
      const { adapter, fake } = initialized();
      const { scene, camera } = makeSceneAndCamera();
      const result = adapter.render(scene, camera);
      expect(result.ok).toBe(true);
      expect(fake.render).toHaveBeenCalledWith(scene.getThreeScene(), camera.getThreeCamera());
    });

    it('wraps a renderer throw into a RENDER_FAILED result', () => {
      const { adapter, fake } = initialized();
      fake.render.mockImplementation(() => {
        throw new Error('context lost');
      });
      const { scene, camera } = makeSceneAndCamera();
      const result = adapter.render(scene, camera);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDER_FAILED);
      }
    });
  });

  describe('renderPostProcessed', () => {
    it('falls back to the plain render when no pipeline exists', () => {
      const { adapter, fake } = initialized();
      const { scene, camera } = makeSceneAndCamera();
      const result = adapter.renderPostProcessed(scene, camera);
      expect(result.ok).toBe(true);
      expect(fake.render).toHaveBeenCalled();
    });

    it('falls back to the plain render while the pipeline chunk is still loading', () => {
      const { adapter, fake } = initialized({ postProcessing: { bloom: true } });
      const { scene, camera } = makeSceneAndCamera();
      // The lazy chunk has not resolved inside this synchronous test, so the
      // pipeline reports not-ready and the plain render runs.
      const result = adapter.renderPostProcessed(scene, camera);
      expect(result.ok).toBe(true);
      expect(fake.render).toHaveBeenCalled();
    });
  });

  describe('size and ratio plumbing', () => {
    it('sets the drawing-buffer size without style updates and restretches the canvas', () => {
      const { adapter, fake } = initialized();
      adapter.setSize(640, 480);
      expect(fake.setSize).toHaveBeenCalledWith(640, 480, false);
      expect(fake.domElement.style.width).toBe('100%');
      expect(fake.domElement.style.height).toBe('100%');
    });

    it('forwards the pixel ratio and reads it back', () => {
      const { adapter, fake } = initialized();
      adapter.setPixelRatio(1.5);
      expect(fake.setPixelRatio).toHaveBeenCalledWith(1.5);
      expect(adapter.getPixelRatio()).toBe(2);
    });

    it('reports pixel ratio 1 before initialize', () => {
      expect(new ThreeRendererAdapter().getPixelRatio()).toBe(1);
    });

    it('applies a live tone-mapping exposure change', () => {
      const { adapter, fake } = initialized();
      adapter.setToneMappingExposure(1.45);
      expect(fake.toneMappingExposure).toBe(1.45);
    });
  });

  describe('accessors and lifecycle', () => {
    it('exposes the canvas and GL context once initialized', () => {
      const { adapter, fake } = initialized();
      expect(adapter.getDomElement()).toBe(fake.domElement);
      expect(adapter.getContext()).toEqual({ fake: 'gl' });
    });

    it('throws on canvas/context access before initialize', () => {
      const adapter = new ThreeRendererAdapter();
      expect(() => adapter.getDomElement()).toThrow();
      expect(() => adapter.getContext()).toThrow();
    });

    it('reports zeroed capabilities before initialize and real ones after', () => {
      const bare = new ThreeRendererAdapter();
      expect(bare.capabilities.maxTextureSize).toBe(0);
      expect(bare.capabilities.isWebGL2).toBe(false);

      const { adapter } = initialized();
      expect(adapter.capabilities.maxTextureSize).toBe(8192);
      expect(adapter.capabilities.maxSamples).toBe(8);
      expect(adapter.capabilities.isWebGL2).toBe(true);
    });

    it('disposes the renderer exactly once and reports the disposed state', () => {
      const { adapter, fake } = initialized();
      expect(adapter.isDisposed()).toBe(false);
      adapter.dispose();
      expect(fake.dispose).toHaveBeenCalledTimes(1);
      expect(adapter.isDisposed()).toBe(true);
      // Idempotent: a second dispose must not touch the torn-down renderer.
      adapter.dispose();
      expect(fake.dispose).toHaveBeenCalledTimes(1);
    });

    it('exposes the internal renderer through both accessors', () => {
      const { adapter, fake } = initialized();
      expect(adapter.getInternalRenderer()).toBe(fake as unknown as THREE.WebGLRenderer);
      expect(adapter.getThreeRenderer()).toBe(fake as unknown as THREE.WebGLRenderer);
      adapter.dispose();
      expect(adapter.getInternalRenderer()).toBeNull();
    });
  });
});
