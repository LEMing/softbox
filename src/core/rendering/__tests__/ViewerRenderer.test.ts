import * as THREE from 'three';
import { ViewerRenderer } from '../ViewerRenderer';
import { ThreeEnvironmentService } from '../../../infrastructure/three/ThreeEnvironmentService';
import { ErrorCode } from '../../../errors';

const fakeInstances: FakeWebGLRenderer[] = [];
let constructorShouldThrow = false;

class FakeWebGLRenderer {
  constructorArgs: unknown;
  shadowMap = { enabled: false, autoUpdate: false, type: THREE.PCFShadowMap as THREE.ShadowMapType };
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

const initialized = (options: Parameters<ViewerRenderer['initialize']>[0] = {}) => {
  const adapter = new ViewerRenderer();
  const result = adapter.initialize(options);
  expect(result.ok).toBe(true);
  return { adapter, fake: lastFake() };
};

const makeSceneAndCamera = () => ({
  scene: new THREE.Scene(),
  camera: new THREE.PerspectiveCamera(),
});

describe('ViewerRenderer', () => {
  beforeEach(() => {
    fakeInstances.length = 0;
    constructorShouldThrow = false;
  });

  describe('initialize', () => {
    it('applies the shadow-map options onto the renderer', () => {
      const { fake } = initialized({ shadowMap: { enabled: true, type: THREE.VSMShadowMap } });
      expect(fake.shadowMap.enabled).toBe(true);
      expect(fake.shadowMap.autoUpdate).toBe(true);
      expect(fake.shadowMap.type).toBe(THREE.VSMShadowMap);
    });

    it('applies the basic shadow map even though its constant is zero', () => {
      const { fake } = initialized({ shadowMap: { enabled: true, type: THREE.BasicShadowMap } });
      expect(fake.shadowMap.type).toBe(THREE.BasicShadowMap);
    });

    it('keeps the default shadow-map type when none is requested', () => {
      const { fake } = initialized({ shadowMap: { enabled: false } });
      expect(fake.shadowMap.enabled).toBe(false);
      expect(fake.shadowMap.type).toBe(THREE.PCFShadowMap);
    });

    it('applies the tone-mapping operator and exposure', () => {
      const { fake } = initialized({
        toneMapping: { type: THREE.AgXToneMapping, exposure: 1.3 },
      });
      expect(fake.toneMapping).toBe(THREE.AgXToneMapping);
      expect(fake.toneMappingExposure).toBe(1.3);
    });

    it('applies the requested pixel ratio unchanged when no post effect is on', () => {
      const { fake } = initialized({ pixelRatio: 3 });
      expect(fake.setPixelRatio).toHaveBeenCalledWith(3);
    });

    it('caps the pixel ratio at 2 when a post-processing effect is enabled', () => {
      const { fake } = initialized({ pixelRatio: 3, postProcessing: { bloom: true } });
      expect(fake.setPixelRatio).toHaveBeenCalledWith(2);
    });

    it('sizes the drawing buffer to the canvas parent when it has a layout', () => {
      const parent = document.createElement('div');
      Object.defineProperty(parent, 'clientWidth', { value: 640 });
      Object.defineProperty(parent, 'clientHeight', { value: 480 });
      const canvas = document.createElement('canvas');
      parent.appendChild(canvas);

      expect(new ViewerRenderer(canvas).initialize({}).ok).toBe(true);

      expect(lastFake().setSize).toHaveBeenCalledWith(640, 480);
    });

    it('leaves the drawing buffer alone when the canvas has no layout yet', () => {
      expect(new ViewerRenderer(document.createElement('canvas')).initialize({}).ok).toBe(true);

      expect(lastFake().setSize).not.toHaveBeenCalled();
    });

    it('forces the sRGB output color space', () => {
      const { fake } = initialized();
      expect(fake.outputColorSpace).toBe(THREE.SRGBColorSpace);
    });

    it('returns an error result when the WebGL context cannot be created', () => {
      constructorShouldThrow = true;
      const adapter = new ViewerRenderer();
      const result = adapter.initialize({});
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
      }
    });
  });

  describe('render', () => {
    it('errors before initialize', () => {
      const adapter = new ViewerRenderer();
      const { scene, camera } = makeSceneAndCamera();
      const result = adapter.render(scene, camera);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_NOT_INITIALIZED);
      }
    });

    it('renders the scene through the camera', () => {
      const { adapter, fake } = initialized();
      const { scene, camera } = makeSceneAndCamera();
      const result = adapter.render(scene, camera);
      expect(result.ok).toBe(true);
      expect(fake.render).toHaveBeenCalledWith(scene, camera);
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
      expect(new ViewerRenderer().getPixelRatio()).toBe(1);
    });

    it('applies a live tone-mapping exposure change', () => {
      const { adapter, fake } = initialized();
      adapter.setToneMappingExposure(1.45);
      expect(fake.toneMappingExposure).toBe(1.45);
    });
  });

  describe('accessors and lifecycle', () => {
    it('exposes the canvas once initialized', () => {
      const { adapter, fake } = initialized();
      expect(adapter.getDomElement()).toBe(fake.domElement);
    });

    it('throws on canvas access before initialize', () => {
      const adapter = new ViewerRenderer();
      expect(() => adapter.getDomElement()).toThrow();
    });

    it('reports a zero max texture size before initialize and the real one after', () => {
      expect(new ViewerRenderer().getMaxTextureSize()).toBe(0);

      const { adapter } = initialized();
      expect(adapter.getMaxTextureSize()).toBe(8192);
    });

    it('disposes the renderer exactly once and reports the disposed state', () => {
      const { adapter, fake } = initialized();
      expect(adapter.isDisposed()).toBe(false);
      adapter.dispose();
      expect(fake.dispose).toHaveBeenCalledTimes(1);
      expect(adapter.isDisposed()).toBe(true);
      adapter.dispose();
      expect(fake.dispose).toHaveBeenCalledTimes(1);
    });

    it('exposes the WebGL renderer until it is disposed', () => {
      expect(new ViewerRenderer().getWebGLRenderer()).toBeNull();
      const { adapter, fake } = initialized();
      expect(adapter.getWebGLRenderer()).toBe(fake as unknown as THREE.WebGLRenderer);
      adapter.dispose();
      expect(adapter.getWebGLRenderer()).toBeNull();
    });
  });

  describe('uploaded background image', () => {
    const imageOfSize = (width: number, height: number): HTMLImageElement => {
      const image = document.createElement('img');
      image.width = width;
      image.height = height;
      return image;
    };

    const withBackgroundImage = async (image: HTMLImageElement) => {
      const { adapter, fake } = initialized();
      const { scene, camera } = makeSceneAndCamera();
      const result = await new ThreeEnvironmentService().setBackgroundImage(scene, image);
      expect(result.ok).toBe(true);
      const texture = scene.background as THREE.Texture;
      return { adapter, fake, scene, camera, texture };
    };

    const resizeDrawingBuffer = (fake: FakeWebGLRenderer, width: number, height: number) => {
      fake.domElement.width = width;
      fake.domElement.height = height;
    };

    it('crops a wide image to the middle of a square canvas instead of squeezing it', async () => {
      const { adapter, fake, scene, camera, texture } = await withBackgroundImage(imageOfSize(400, 100));
      resizeDrawingBuffer(fake, 300, 300);

      adapter.render(scene, camera);

      expect(texture.repeat.x).toBeCloseTo(0.25);
      expect(texture.repeat.y).toBeCloseTo(1);
      expect(texture.offset.x).toBeCloseTo(0.375);
      expect(texture.offset.y).toBeCloseTo(0);
    });

    it('crops a tall image to the middle of a square canvas instead of stretching it', async () => {
      const { adapter, fake, scene, camera, texture } = await withBackgroundImage(imageOfSize(100, 400));
      resizeDrawingBuffer(fake, 300, 300);

      adapter.render(scene, camera);

      expect(texture.repeat.x).toBeCloseTo(1);
      expect(texture.repeat.y).toBeCloseTo(0.25);
      expect(texture.offset.x).toBeCloseTo(0);
      expect(texture.offset.y).toBeCloseTo(0.375);
    });

    it('keeps the image proportions when the canvas is resized', async () => {
      const { adapter, fake, scene, camera, texture } = await withBackgroundImage(imageOfSize(400, 200));
      resizeDrawingBuffer(fake, 300, 300);
      adapter.render(scene, camera);

      resizeDrawingBuffer(fake, 800, 200);
      adapter.render(scene, camera);

      expect(texture.repeat.x).toBeCloseTo(1);
      expect(texture.repeat.y).toBeCloseTo(0.5);
      expect(texture.offset.x).toBeCloseTo(0);
      expect(texture.offset.y).toBeCloseTo(0.25);
    });

    it('fits the image before a post-processed frame too', async () => {
      const { adapter, fake, scene, camera, texture } = await withBackgroundImage(imageOfSize(400, 100));
      resizeDrawingBuffer(fake, 300, 300);
      const composerRender = jest.fn(() => true);
      (adapter as unknown as { postPipeline: unknown }).postPipeline = { render: composerRender };

      const result = adapter.renderPostProcessed(scene, camera);

      expect(result.ok).toBe(true);
      expect(composerRender).toHaveBeenCalled();
      expect(fake.render).not.toHaveBeenCalled();
      expect(texture.repeat.x).toBeCloseTo(0.25);
      expect(texture.offset.x).toBeCloseTo(0.375);
    });
  });
});
