jest.mock('three', () => {
  const actual = jest.requireActual('three');
  const pmremTexture = () => {
    const texture = new actual.Texture();
    texture.mapping = actual.CubeUVReflectionMapping;
    return texture;
  };
  class MockPMREMGenerator {
    compileEquirectangularShader = jest.fn();
    fromEquirectangular = jest.fn(() => ({ texture: pmremTexture(), dispose: jest.fn() }));
    fromScene = jest.fn(() => ({ texture: pmremTexture(), dispose: jest.fn() }));
    dispose = jest.fn();
  }
  return { ...actual, PMREMGenerator: MockPMREMGenerator };
});

jest.mock('../studioEnvironmentContrast', () => ({
  applyStudioContrast: jest.fn(
    jest.requireActual('../studioEnvironmentContrast').applyStudioContrast
  ),
}));

import * as THREE from 'three';
import { applyStudioContrast } from '../studioEnvironmentContrast';
import { ThreeEnvironmentService } from '../ThreeEnvironmentService';
import { ThreeSceneAdapter } from '../ThreeScene';
import { IRenderer } from '../../../core/interfaces/IRenderer';
import { IScene, ITexture } from '../../../core/interfaces/IScene';
import { ErrorCode } from '../../../errors';

const rawTexture = (texture: ITexture): THREE.Texture =>
  (texture as unknown as { getThreeTexture(): THREE.Texture }).getThreeTexture();

describe('ThreeEnvironmentService', () => {
  const rendererWith = (overrides: Partial<{ renderer: unknown }> = {}): IRenderer =>
    ({ renderer: {} as THREE.WebGLRenderer, ...overrides }) as unknown as IRenderer;

  // CubeCamera.update needs a functional renderer surface.
  const cubeCapableService = async (): Promise<ThreeEnvironmentService> => {
    const cubeCapableRenderer = {
      coordinateSystem: THREE.WebGLCoordinateSystem,
      toneMapping: THREE.NoToneMapping,
      xr: { enabled: false },
      getRenderTarget: () => null,
      getActiveCubeFace: () => 0,
      getActiveMipmapLevel: () => 0,
      setRenderTarget: jest.fn(),
      render: jest.fn(),
    } as unknown as THREE.WebGLRenderer;
    const service = new ThreeEnvironmentService();
    const init = await service.initialize({
      renderer: { renderer: cubeCapableRenderer } as unknown as IRenderer,
    });
    expect(init.ok).toBe(true);
    return service;
  };

  const initialized = async (): Promise<ThreeEnvironmentService> => {
    const service = new ThreeEnvironmentService();
    const result = await service.initialize({ renderer: rendererWith() });
    expect(result.ok).toBe(true);
    return service;
  };

  it('fails to initialize when no Three.js renderer can be reached', async () => {
    const service = new ThreeEnvironmentService();
    const result = await service.initialize({ renderer: {} as IRenderer });
    expect(result.ok).toBe(false);
  });

  it('initializes a PMREM generator from the renderer', async () => {
    const service = await initialized();
    expect(service.createStudioEnvironment().ok).toBe(true);
  });

  it('loads an env map, PMREM-processes it, and caches the equirectangular original', async () => {
    const service = await initialized();
    const result = await service.loadEnvironmentMap('env.hdr');
    expect(result.ok).toBe(true);
    // The original (mapping = Equirectangular) is kept for the path tracer.
    expect(service.getOriginalEnvironmentTexture('env.hdr')).not.toBeNull();
  });

  it('rejects unsupported environment map formats', async () => {
    const service = await initialized();
    const result = await service.loadEnvironmentMap('env.tga');
    expect(result.ok).toBe(false);
  });

  it('applies the environment and background to the scene', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;

    const scene = new ThreeSceneAdapter();
    const result = service.applyToScene(scene, loaded.value, { backgroundBlurriness: 0.2 });

    expect(result.ok).toBe(true);
    expect(scene.getThreeScene().environment).not.toBeNull();
    expect(scene.getThreeScene().background).not.toBeNull();
  });

  it('applies to a raw THREE.Scene through the shared unwrap helpers', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;

    const scene = new THREE.Scene();
    const result = service.applyToScene(
      scene as unknown as IScene,
      loaded.value,
      { setBackground: false }
    );

    expect(result.ok).toBe(true);
    expect(scene.environment).not.toBeNull();
  });

  it('rejects a scene that is neither an adapter nor a THREE.Scene', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;

    const result = service.applyToScene({} as unknown as IScene, loaded.value);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
    }
  });

  it('lights the scene without a background when setBackground is false', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;

    const scene = new ThreeSceneAdapter();
    const result = service.applyToScene(scene, loaded.value, { setBackground: false });

    expect(result.ok).toBe(true);
    expect(scene.getThreeScene().environment).not.toBeNull();
    expect(scene.getThreeScene().background).toBeNull();
  });

  it('creates a studio environment only after initialization', async () => {
    expect(new ThreeEnvironmentService().createStudioEnvironment().ok).toBe(false);
    const service = await initialized();
    expect(service.createStudioEnvironment().ok).toBe(true);
  });

  it('registers a cube capture of the studio room as the path-tracing original', async () => {
    // CubeCamera.update needs a functional renderer surface.
    const service = await cubeCapableService();

    const studio = service.createStudioEnvironment();
    if (!studio.ok) throw studio.error;

    const scene = new ThreeSceneAdapter();
    const applied = service.applyToScene(scene, studio.value, { setBackground: false });
    expect(applied.ok).toBe(true);

    const original = (scene.getThreeScene() as THREE.Scene & {
      __originalEnvironmentTexture?: THREE.Texture;
    }).__originalEnvironmentTexture;
    expect(original).toBeDefined();
    expect((original as THREE.CubeTexture).isCubeTexture).toBe(true);
  });

  it('binds the backdrop and PT original to the APPLIED environment, not the first-loaded one', async () => {
    const service = await initialized();
    const first = await service.loadEnvironmentMap('first.hdr');
    const second = await service.loadEnvironmentMap('second.hdr');
    if (!first.ok || !second.ok) throw new Error('loads failed');

    const scene = new ThreeSceneAdapter();
    const applied = service.applyToScene(scene, second.value);
    expect(applied.ok).toBe(true);

    const secondOriginal = rawTexture(service.getOriginalEnvironmentTexture('second.hdr')!);
    const firstOriginal = rawTexture(service.getOriginalEnvironmentTexture('first.hdr')!);
    const threeScene = scene.getThreeScene() as THREE.Scene & {
      __originalEnvironmentTexture?: THREE.Texture;
    };
    expect(threeScene.background).toBe(secondOriginal);
    expect(threeScene.background).not.toBe(firstOriginal);
    expect(threeScene.__originalEnvironmentTexture).toBe(secondOriginal);
  });

  it('hands the path tracer the studio cube capture even after an HDRI was loaded', async () => {
    const service = await cubeCapableService();

    // An HDRI in the cache used to shadow the studio branch entirely.
    const hdri = await service.loadEnvironmentMap('room.hdr');
    expect(hdri.ok).toBe(true);
    const studio = service.createStudioEnvironment();
    if (!studio.ok) throw studio.error;

    const scene = new ThreeSceneAdapter();
    const applied = service.applyToScene(scene, studio.value, { setBackground: false });
    expect(applied.ok).toBe(true);

    const original = (scene.getThreeScene() as THREE.Scene & {
      __originalEnvironmentTexture?: THREE.Texture;
    }).__originalEnvironmentTexture;
    expect((original as THREE.CubeTexture).isCubeTexture).toBe(true);
  });

  it('caches the studio bake: a second createStudioEnvironment reuses the same texture', async () => {
    const service = await cubeCapableService();

    const firstStudio = service.createStudioEnvironment();
    const secondStudio = service.createStudioEnvironment();
    if (!firstStudio.ok || !secondStudio.ok) throw new Error('studio builds failed');

    expect(rawTexture(secondStudio.value)).toBe(rawTexture(firstStudio.value));
    const generator = (service as unknown as {
      pmremGenerator: { fromScene: jest.Mock };
    }).pmremGenerator;
    expect(generator.fromScene).toHaveBeenCalledTimes(1);
  });

  it('bakes each studio grade once and caches them independently', async () => {
    const service = await cubeCapableService();

    const crisp = service.createStudioEnvironment();
    const soft = service.createStudioEnvironment('soft');
    const crispAgain = service.createStudioEnvironment('crisp');
    const softAgain = service.createStudioEnvironment('soft');
    if (!crisp.ok || !soft.ok || !crispAgain.ok || !softAgain.ok) {
      throw new Error('studio builds failed');
    }

    expect(rawTexture(soft.value)).not.toBe(rawTexture(crisp.value));
    expect(rawTexture(crispAgain.value)).toBe(rawTexture(crisp.value));
    expect(rawTexture(softAgain.value)).toBe(rawTexture(soft.value));
    const generator = (service as unknown as {
      pmremGenerator: { fromScene: jest.Mock };
    }).pmremGenerator;
    expect(generator.fromScene).toHaveBeenCalledTimes(2);
  });

  it('soft grade bakes the room as-built — no contrast push', async () => {
    const service = await cubeCapableService();
    (applyStudioContrast as jest.Mock).mockClear();

    const soft = service.createStudioEnvironment('soft');
    if (!soft.ok) throw soft.error;
    expect(applyStudioContrast).not.toHaveBeenCalled();

    const crisp = service.createStudioEnvironment();
    if (!crisp.ok) throw crisp.error;
    expect(applyStudioContrast).toHaveBeenCalledTimes(1);
  });

  it('leaves the studio environment usable when the cube capture fails', async () => {
    // The minimal stub renderer cannot run CubeCamera.update — the capture
    // must fail soft: studio PMREM still applies, just no PT original.
    const service = await initialized();
    const studio = service.createStudioEnvironment();
    if (!studio.ok) throw studio.error;

    const scene = new ThreeSceneAdapter();
    const applied = service.applyToScene(scene, studio.value, { setBackground: false });
    expect(applied.ok).toBe(true);
    expect(scene.getThreeScene().environment).not.toBeNull();
  });

  it('dispose frees every cached texture (pmrem AND original) and clears the cache', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;
    const original = service.getOriginalEnvironmentTexture('env.hdr');
    if (!original) throw new Error('expected an original texture');

    const pmremDispose = jest.spyOn(rawTexture(loaded.value), 'dispose');
    const originalDispose = jest.spyOn(rawTexture(original), 'dispose');

    service.dispose();

    // The dual-store invariant: both the PMREM and the original are freed,
    // and the cache no longer hands out the disposed texture afterwards.
    expect(pmremDispose).toHaveBeenCalled();
    expect(originalDispose).toHaveBeenCalled();
    expect(service.getOriginalEnvironmentTexture('env.hdr')).toBeNull();
  });
});

describe('ThreeEnvironmentService render-target lifecycle', () => {
  const stubRenderer = (): IRenderer =>
    ({ renderer: {} as THREE.WebGLRenderer }) as unknown as IRenderer;

  it('disposes the PMREM render targets, not just their textures', async () => {
    const service = new ThreeEnvironmentService();
    await service.initialize({ renderer: stubRenderer() });
    const studio = service.createStudioEnvironment();
    expect(studio.ok).toBe(true);

    const generator = (service as unknown as {
      pmremGenerator: { fromScene: jest.Mock };
    }).pmremGenerator;
    const renderTarget = generator.fromScene.mock.results[0].value;

    service.dispose();

    expect(renderTarget.dispose).toHaveBeenCalled();
  });

  it('refuses to cache a texture loaded after dispose', async () => {
    const service = new ThreeEnvironmentService();
    await service.initialize({ renderer: stubRenderer() });

    const pending = service.loadEnvironmentMap('https://example.com/env.hdr');
    service.dispose();
    const result = await pending;

    expect(result.ok).toBe(false);
  });

  describe('setBackgroundImage', () => {
    let loadSpy: jest.SpyInstance | undefined;

    const initialized = async (): Promise<ThreeEnvironmentService> => {
      const service = new ThreeEnvironmentService();
      const renderer = { renderer: {} as THREE.WebGLRenderer } as unknown as IRenderer;
      const result = await service.initialize({ renderer });
      expect(result.ok).toBe(true);
      return service;
    };

    afterEach(() => {
      loadSpy?.mockRestore();
      loadSpy = undefined;
    });

    const mockLoad = (onLoadTexture: THREE.Texture) => {
      loadSpy = jest.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((
        _url: string,
        onLoad: (t: THREE.Texture) => void
      ) => {
        onLoad(onLoadTexture);
        return onLoadTexture;
      }) as never);
    };

    it('loads a URL as an sRGB background and leaves the environment untouched', async () => {
      const service = await initialized();
      const texture = new THREE.Texture();
      mockLoad(texture);
      const sceneAdapter = new ThreeSceneAdapter(new THREE.Scene());
      const threeScene = sceneAdapter.getThreeScene();

      const result = await service.setBackgroundImage(sceneAdapter, '/photo.jpg');

      expect(result.ok).toBe(true);
      expect(threeScene.background).toBe(texture);
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(threeScene.environment).toBeNull();
    });

    it('disposes the previous VIEWER-painted background on replace', async () => {
      const service = await initialized();
      const sceneAdapter = new ThreeSceneAdapter(new THREE.Scene());
      const threeScene = sceneAdapter.getThreeScene();
      mockLoad(new THREE.Texture());
      await service.setBackgroundImage(sceneAdapter, '/first.jpg');
      const previous = threeScene.background as THREE.Texture;
      const disposeSpy = jest.spyOn(previous, 'dispose');
      mockLoad(new THREE.Texture());

      await service.setBackgroundImage(sceneAdapter, '/second.jpg');

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('leaves a consumer-set background texture alone on replace', async () => {
      const service = await initialized();
      const sceneAdapter = new ThreeSceneAdapter(new THREE.Scene());
      const threeScene = sceneAdapter.getThreeScene();
      // Set directly by the consumer, not painted by a viewer API — not ours
      // to free (it may be shared with the consumer's own scene work).
      const consumerTexture = new THREE.Texture();
      threeScene.background = consumerTexture;
      const disposeSpy = jest.spyOn(consumerTexture, 'dispose');
      mockLoad(new THREE.Texture());

      await service.setBackgroundImage(sceneAdapter, '/photo.jpg');

      expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('accepts an HTMLImageElement directly without loading', async () => {
      const service = await initialized();
      const sceneAdapter = new ThreeSceneAdapter(new THREE.Scene());
      const image = document.createElement('img');

      const result = await service.setBackgroundImage(sceneAdapter, image);

      expect(result.ok).toBe(true);
      expect((sceneAdapter.getThreeScene().background as THREE.Texture).image).toBe(image);
    });

    it('creates and revokes an object URL for a File source', async () => {
      const service = await initialized();
      const urlApi = URL as unknown as {
        createObjectURL?: (blob: Blob) => string;
        revokeObjectURL?: (url: string) => void;
      };
      const originalCreate = urlApi.createObjectURL;
      const originalRevoke = urlApi.revokeObjectURL;
      const createObjectURL = jest.fn(() => 'blob:bg');
      const revokeObjectURL = jest.fn();
      urlApi.createObjectURL = createObjectURL;
      urlApi.revokeObjectURL = revokeObjectURL;
      mockLoad(new THREE.Texture());
      const file = new File(['x'], 'bg.png', { type: 'image/png' });

      await service.setBackgroundImage(new ThreeSceneAdapter(new THREE.Scene()), file);

      expect(createObjectURL).toHaveBeenCalledWith(file);
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:bg');
      urlApi.createObjectURL = originalCreate;
      urlApi.revokeObjectURL = originalRevoke;
    });

    it('returns an error when the loader fails', async () => {
      const service = await initialized();
      loadSpy = jest.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(((
        _url: string,
        _onLoad: unknown,
        _onProgress: unknown,
        onError: (e: unknown) => void
      ) => {
        onError(new Error('404'));
        return new THREE.Texture();
      }) as never);

      const result = await service.setBackgroundImage(new ThreeSceneAdapter(new THREE.Scene()), '/missing.jpg');

      expect(result.ok).toBe(false);
    });

    it('rejects a scene that is not a ThreeSceneAdapter', async () => {
      const service = await initialized();

      const result = await service.setBackgroundImage({} as unknown as IScene, '/x.jpg');

      expect(result.ok).toBe(false);
    });
  });
});
