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

import * as THREE from 'three';
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
});
