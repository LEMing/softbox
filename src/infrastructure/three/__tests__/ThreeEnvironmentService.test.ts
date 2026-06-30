jest.mock('three', () => {
  const actual = jest.requireActual('three');
  const pmremTexture = () => {
    const texture = new actual.Texture();
    texture.mapping = actual.CubeUVReflectionMapping;
    return texture;
  };
  class MockPMREMGenerator {
    compileEquirectangularShader = jest.fn();
    fromEquirectangular = jest.fn(() => ({ texture: pmremTexture() }));
    fromScene = jest.fn(() => ({ texture: pmremTexture() }));
    dispose = jest.fn();
  }
  return { ...actual, PMREMGenerator: MockPMREMGenerator };
});

import * as THREE from 'three';
import { ThreeEnvironmentService } from '../ThreeEnvironmentService';
import { ThreeSceneAdapter } from '../ThreeScene';
import { IRenderer } from '../../../core/interfaces/IRenderer';
import { ITexture } from '../../../core/interfaces/IScene';

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

  it('creates a studio environment only after initialization', async () => {
    expect(new ThreeEnvironmentService().createStudioEnvironment().ok).toBe(false);
    const service = await initialized();
    expect(service.createStudioEnvironment().ok).toBe(true);
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
