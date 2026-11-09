jest.mock('three', () => {
  const actual = jest.requireActual('three');
  const pmremTexture = () => {
    const texture = new actual.Texture();
    texture.mapping = actual.CubeReflectionMapping;
    texture.isPMREMTexture = true;
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
import { ThreeEnvironmentService, GROUNDED_SKYBOX_NAME } from '../ThreeEnvironmentService';
import { CONTACT_SHADOW_HELPER_FLAG } from '../ContactShadowBaker';
import { fitCoverBackgroundToViewport } from '../../../core/rendering/backgroundImageFit';

describe('ThreeEnvironmentService', () => {
  const stubRenderer = (): THREE.WebGLRenderer => ({}) as THREE.WebGLRenderer;

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
      renderer: cubeCapableRenderer,
    });
    expect(init.ok).toBe(true);
    return service;
  };

  const initialized = async (): Promise<ThreeEnvironmentService> => {
    const service = new ThreeEnvironmentService();
    const result = await service.initialize({ renderer: stubRenderer() });
    expect(result.ok).toBe(true);
    return service;
  };

  it('fails to initialize before the WebGL renderer exists', async () => {
    const service = new ThreeEnvironmentService();
    const result = await service.initialize({ renderer: null });
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

    const scene = new THREE.Scene();
    const result = service.applyToScene(scene, loaded.value, { backgroundBlurriness: 0.2 });

    expect(result.ok).toBe(true);
    expect(scene.environment).not.toBeNull();
    expect(scene.background).not.toBeNull();
  });

  it('lights the scene without a background when setBackground is false', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;

    const scene = new THREE.Scene();
    const result = service.applyToScene(scene, loaded.value, { setBackground: false });

    expect(result.ok).toBe(true);
    expect(scene.environment).not.toBeNull();
    expect(scene.background).toBeNull();
  });

  it('creates a studio environment only after initialization', async () => {
    expect(new ThreeEnvironmentService().createStudioEnvironment().ok).toBe(false);
    const service = await initialized();
    expect(service.createStudioEnvironment().ok).toBe(true);
  });

  it('registers a cube capture of the studio room as the path-tracing original', async () => {
    const service = await cubeCapableService();

    const studio = service.createStudioEnvironment();
    if (!studio.ok) throw studio.error;

    const scene = new THREE.Scene();
    const applied = service.applyToScene(scene, studio.value, { setBackground: false });
    expect(applied.ok).toBe(true);

    const original = (scene as THREE.Scene & {
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

    const scene = new THREE.Scene();
    const applied = service.applyToScene(scene, second.value);
    expect(applied.ok).toBe(true);

    const secondOriginal = service.getOriginalEnvironmentTexture('second.hdr')!;
    const firstOriginal = service.getOriginalEnvironmentTexture('first.hdr')!;
    const threeScene = scene as THREE.Scene & {
      __originalEnvironmentTexture?: THREE.Texture;
    };
    expect(threeScene.background).toBe(secondOriginal);
    expect(threeScene.background).not.toBe(firstOriginal);
    expect(threeScene.__originalEnvironmentTexture).toBe(secondOriginal);
  });

  it('hands the path tracer the studio cube capture even after an HDRI was loaded', async () => {
    const service = await cubeCapableService();

    const hdri = await service.loadEnvironmentMap('room.hdr');
    expect(hdri.ok).toBe(true);
    const studio = service.createStudioEnvironment();
    if (!studio.ok) throw studio.error;

    const scene = new THREE.Scene();
    const applied = service.applyToScene(scene, studio.value, { setBackground: false });
    expect(applied.ok).toBe(true);

    const original = (scene as THREE.Scene & {
      __originalEnvironmentTexture?: THREE.Texture;
    }).__originalEnvironmentTexture;
    expect((original as THREE.CubeTexture).isCubeTexture).toBe(true);
  });

  it('caches the studio bake: a second createStudioEnvironment reuses the same texture', async () => {
    const service = await cubeCapableService();

    const firstStudio = service.createStudioEnvironment();
    const secondStudio = service.createStudioEnvironment();
    if (!firstStudio.ok || !secondStudio.ok) throw new Error('studio builds failed');

    expect(secondStudio.value).toBe(firstStudio.value);
    const generator = (service as unknown as {
      pmremGenerator: { fromScene: jest.Mock };
    }).pmremGenerator;
    expect(generator.fromScene).toHaveBeenCalledTimes(1);
  });

  it('ground projection: builds a tracer-hidden skybox for an equirect env, clears it on re-apply', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;
    const scene = new THREE.Scene();

    const applied = service.applyToScene(scene, loaded.value, {
      groundProjection: { height: 2, radius: 120 },
    });
    expect(applied.ok).toBe(true);
    const skybox = scene.getObjectByName(GROUNDED_SKYBOX_NAME) as THREE.Mesh;
    expect(skybox).toBeDefined();
    expect(skybox.userData[CONTACT_SHADOW_HELPER_FLAG]).toBe(true);
    expect(skybox.userData.softboxBackgroundNode).toBe(true);
    expect(skybox.userData.__groundedSkyboxParams).toEqual({ height: 2, radius: 120 });
    expect(skybox.position.y).toBeCloseTo(1.99);

    const reapplied = service.applyToScene(scene, loaded.value, {});
    expect(reapplied.ok).toBe(true);
    expect(scene.getObjectByName(GROUNDED_SKYBOX_NAME)).toBeUndefined();
  });

  it('ground projection: skipped when no equirect source exists (studio cube path)', async () => {
    const service = await initialized();
    const studio = service.createStudioEnvironment();
    if (!studio.ok) throw studio.error;
    const scene = new THREE.Scene();

    const applied = service.applyToScene(scene, studio.value, {
      setBackground: false,
      groundProjection: { height: 2, radius: 120 },
    });
    expect(applied.ok).toBe(true);
    expect(scene.getObjectByName(GROUNDED_SKYBOX_NAME)).toBeUndefined();
  });

  it('ground projection: emulates backgroundIntensity by dimming the skybox mesh', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;
    const scene = new THREE.Scene();

    service.applyToScene(scene, loaded.value, {
      groundProjection: { height: 2, radius: 120 },
      backgroundIntensity: 0.5,
    });
    const skybox = scene.getObjectByName(GROUNDED_SKYBOX_NAME) as THREE.Mesh;
    const material = skybox.material as THREE.MeshBasicMaterial;
    expect(material.color.r).toBeCloseTo(0.5);
    expect(material.userData.softboxExternallyOwnedTextures).toBe(true);
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

    expect(soft.value).not.toBe(crisp.value);
    expect(crispAgain.value).toBe(crisp.value);
    expect(softAgain.value).toBe(soft.value);
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
    const service = await initialized();
    const studio = service.createStudioEnvironment();
    if (!studio.ok) throw studio.error;

    const scene = new THREE.Scene();
    const applied = service.applyToScene(scene, studio.value, { setBackground: false });
    expect(applied.ok).toBe(true);
    expect(scene.environment).not.toBeNull();

    const again = service.createStudioEnvironment();
    if (!again.ok) throw again.error;
    expect(again.value).toBe(studio.value);
    const generator = (service as unknown as {
      pmremGenerator: { fromScene: jest.Mock };
    }).pmremGenerator;
    expect(generator.fromScene).toHaveBeenCalledTimes(1);
  });

  it('dispose frees every cached texture (pmrem AND original) and clears the cache', async () => {
    const service = await initialized();
    const loaded = await service.loadEnvironmentMap('env.hdr');
    if (!loaded.ok) throw loaded.error;
    const original = service.getOriginalEnvironmentTexture('env.hdr');
    if (!original) throw new Error('expected an original texture');

    const pmremDispose = jest.spyOn(loaded.value, 'dispose');
    const originalDispose = jest.spyOn(original, 'dispose');

    service.dispose();

    expect(pmremDispose).toHaveBeenCalled();
    expect(originalDispose).toHaveBeenCalled();
    expect(service.getOriginalEnvironmentTexture('env.hdr')).toBeNull();
  });
});

describe('ThreeEnvironmentService render-target lifecycle', () => {
  const stubRenderer = (): THREE.WebGLRenderer => ({}) as THREE.WebGLRenderer;

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
      const result = await service.initialize({ renderer: {} as THREE.WebGLRenderer });
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
      const scene = new THREE.Scene();

      const result = await service.setBackgroundImage(scene, '/photo.jpg');

      expect(result.ok).toBe(true);
      expect(scene.background).toBe(texture);
      expect(texture.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(scene.environment).toBeNull();
    });

    it('marks the uploaded image to be cropped to the viewport rather than stretched', async () => {
      const service = await initialized();
      const texture = new THREE.Texture({ width: 400, height: 100 } as unknown as HTMLImageElement);
      mockLoad(texture);
      const scene = new THREE.Scene();

      await service.setBackgroundImage(scene, '/wide.jpg');
      fitCoverBackgroundToViewport(scene, 1);

      expect(texture.repeat.x).toBeCloseTo(0.25);
      expect(texture.offset.x).toBeCloseTo(0.375);
    });

    it('disposes the previous VIEWER-painted background on replace', async () => {
      const service = await initialized();
      const scene = new THREE.Scene();
      mockLoad(new THREE.Texture());
      await service.setBackgroundImage(scene, '/first.jpg');
      const previous = scene.background as THREE.Texture;
      const disposeSpy = jest.spyOn(previous, 'dispose');
      mockLoad(new THREE.Texture());

      await service.setBackgroundImage(scene, '/second.jpg');

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('leaves a consumer-set background texture alone on replace', async () => {
      const service = await initialized();
      const scene = new THREE.Scene();
      const consumerTexture = new THREE.Texture();
      scene.background = consumerTexture;
      const disposeSpy = jest.spyOn(consumerTexture, 'dispose');
      mockLoad(new THREE.Texture());

      await service.setBackgroundImage(scene, '/photo.jpg');

      expect(disposeSpy).not.toHaveBeenCalled();
    });

    it('accepts an HTMLImageElement directly without loading', async () => {
      const service = await initialized();
      const scene = new THREE.Scene();
      const image = document.createElement('img');

      const result = await service.setBackgroundImage(scene, image);

      expect(result.ok).toBe(true);
      expect((scene.background as THREE.Texture).image).toBe(image);
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

      await service.setBackgroundImage(new THREE.Scene(), file);

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

      const result = await service.setBackgroundImage(new THREE.Scene(), '/missing.jpg');

      expect(result.ok).toBe(false);
    });
  });
});
