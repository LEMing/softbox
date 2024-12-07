import * as THREE from 'three';
import {mockRenderer} from '../../../__mocks__/mockRenderer';
import { EnvironmentMapManager } from '../EnvironmentMapManager';
import { PathTracingManager } from '../PathTracingManager';

// Mock the three module
jest.mock('three', () => {
  const originalThree = jest.requireActual('three') as typeof THREE;

  class MockPMREMGenerator {
    renderer: THREE.WebGLRenderer;
    constructor(renderer: THREE.WebGLRenderer) {
      this.renderer = renderer;
    }
    compileEquirectangularShader() {}
    fromEquirectangular(texture: THREE.Texture) {
      return { texture: new originalThree.Texture() };
    }
    dispose() {}
  }

  class MockTextureLoader {
    load(
      url: string,
      onLoad?: (texture: THREE.Texture) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: ErrorEvent) => void
    ) {
      if (onLoad) {
        const texture = new originalThree.Texture();
        onLoad(texture);
      }
    }
  }

  return {
    ...originalThree,
    PMREMGenerator: MockPMREMGenerator,
    TextureLoader: MockTextureLoader
  };
});

// Mock importRaytracer since the test can't find it
jest.mock('../../importRaytracer', () => ({
  importRaytracer: () => ({
    BlurredEnvMapGenerator: class {
      renderer: THREE.WebGLRenderer;
      constructor(renderer: THREE.WebGLRenderer) {
        this.renderer = renderer;
      }
      generate(texture: THREE.Texture, strength: number) {
        const blurredEnvMap = new THREE.Texture();
        blurredEnvMap.name = `blurred_env_map_${strength}`;
        return blurredEnvMap;
      }
    }
  })
}));

console.error = jest.fn();

describe('EnvironmentMapManager', () => {
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let pathTracingManager: PathTracingManager;
  let manager: EnvironmentMapManager;

  beforeEach(() => {
    renderer = mockRenderer as unknown as THREE.WebGLRenderer;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    pathTracingManager = {
      ptRenderer: {
        updateEnvironment: jest.fn()
      }
    } as unknown as PathTracingManager;
    jest.clearAllMocks();
  });

  test('does nothing if envMapUrl is not provided', () => {
    manager = new EnvironmentMapManager({
      renderer, scene, camera, usePathTracing: false, pathTracingManager: null
    });

    manager.load();
    // Since no envMapUrl is provided, no loading occurs and no errors are printed
    expect(console.error).not.toHaveBeenCalled();
  });

  test('loads environment map and sets environment and background', () => {
    const envMapUrl = 'test_env.jpg';
    manager = new EnvironmentMapManager({
      renderer, scene, camera, envMapUrl, usePathTracing: false, pathTracingManager: null, backgroundBlurriness: 0.4
    });

    const renderSpy = jest.spyOn(renderer, 'render');
    manager.load();

    // After loading:
    expect(scene.environment).toBeInstanceOf(THREE.Texture);
    expect(scene.background).toBeInstanceOf(THREE.Texture);
    expect((scene as any).backgroundBlurriness).toBeCloseTo(0.4);
    expect(renderSpy).toHaveBeenCalledWith(scene, camera);
  });

  test('uses BlurredEnvMapGenerator when path tracing is enabled', () => {
    const envMapUrl = 'test_env.jpg';
    manager = new EnvironmentMapManager({
      renderer,
      scene,
      camera,
      envMapUrl,
      usePathTracing: true,
      pathTracingManager,
      blurStrengthPathTracing: 0.5
    });

    const renderSpy = jest.spyOn(renderer, 'render');
    manager.load();

    expect(scene.environment).toBeInstanceOf(THREE.Texture);
    expect((scene.environment as THREE.Texture).name).toContain('blurred_env_map_0.5');
    expect(scene.background).toBe(scene.environment);
    expect(pathTracingManager.ptRenderer.updateEnvironment).toHaveBeenCalled();
    expect(renderSpy).not.toHaveBeenCalled();
  });

  test('handles errors gracefully', () => {
    const originalLoad = (THREE as any).TextureLoader.prototype.load;
    (THREE as any).TextureLoader.prototype.load = function (
      url: string,
      onLoad?: (texture: THREE.Texture) => void,
      onProgress?: (event: ProgressEvent) => void,
      onError?: (event: Error) => void
    ) {
      if (onError) {
        onError(new Error('Load failed'));
      }
    };

    const envMapUrl = 'test_env.jpg';
    manager = new EnvironmentMapManager({
      renderer, scene, camera, envMapUrl, usePathTracing: false, pathTracingManager: null
    });

    manager.load();
    expect(console.error).toHaveBeenCalledWith('Error loading environment map:', expect.any(Error));

    (THREE as any).TextureLoader.prototype.load = originalLoad; // restore original
  });

});
