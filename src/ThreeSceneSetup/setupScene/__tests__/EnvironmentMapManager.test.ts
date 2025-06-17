import * as THREE from 'three';
import { EnvironmentMapManager } from '../EnvironmentMapManager';
import { PathTracingManager } from '../PathTracingManager';
import { ErrorCode } from '../../../errors';

// Mock Three.js TextureLoader
const mockTexture = {
  mapping: null,
  dispose: jest.fn()
};

const mockEnvMap = {
  dispose: jest.fn()
};

const mockLoad = jest.fn((url, onLoad, onProgress, onError) => {
  // Default to success
  setTimeout(() => onLoad(mockTexture), 0);
});

jest.mock('three', () => {
  const actualThree = jest.requireActual('three');
  return {
    ...actualThree,
    TextureLoader: jest.fn(() => ({
      load: mockLoad
    })),
    PMREMGenerator: jest.fn(() => ({
      compileEquirectangularShader: jest.fn(),
      fromEquirectangular: jest.fn(() => ({ texture: mockEnvMap })),
      dispose: jest.fn()
    }))
  };
});

// Mock importRaytracer
const mockBlurredEnvMapGenerator = {
  generate: jest.fn(() => mockEnvMap)
};

jest.mock('../../importRaytracer', () => ({
  importRaytracer: jest.fn(() => ({
    BlurredEnvMapGenerator: jest.fn(() => mockBlurredEnvMapGenerator)
  }))
}));

// Mock PathTracingManager
const mockPathTracingManager = {
  ptRenderer: {
    updateEnvironment: jest.fn()
  }
};

describe('EnvironmentMapManager', () => {
  let manager: EnvironmentMapManager;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let envMapUrl: string;

  beforeEach(() => {
    renderer = {
      render: jest.fn()
    } as any;
    scene = {
      environment: null,
      background: null,
      backgroundBlurriness: 0
    } as any;
    camera = new THREE.PerspectiveCamera();
    envMapUrl = 'https://example.com/envmap.jpg';

    jest.clearAllMocks();
    mockTexture.dispose.mockClear();
    mockEnvMap.dispose.mockClear();
    mockLoad.mockClear();
  });

  describe('setup', () => {
    it('should successfully setup with valid parameters', () => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });

      const result = manager.setup();
      expect(result.ok).toBe(true);
    });

    it('should return error when renderer is null', () => {
      manager = new EnvironmentMapManager({
        renderer: null,
        scene,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });

      const result = manager.setup();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
        expect(result.error.message).toContain('Renderer is not provided');
      }
    });

    it('should return error when scene is null', () => {
      manager = new EnvironmentMapManager({
        renderer,
        scene: null,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });

      const result = manager.setup();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.SCENE_INIT_FAILED);
        expect(result.error.message).toContain('Scene is not provided');
      }
    });

    it('should return error when camera is null', () => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera: null,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });

      const result = manager.setup();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.CAMERA_INIT_FAILED);
        expect(result.error.message).toContain('Camera is not provided');
      }
    });
  });

  describe('load', () => {
    beforeEach(() => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });
    });

    it('should successfully load environment map', async () => {
      const result = await manager.load();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mockEnvMap);
      }
      expect(mockLoad).toHaveBeenCalledWith(envMapUrl, expect.any(Function), undefined, expect.any(Function));
      expect(scene.environment).toBe(mockEnvMap);
      expect(scene.background).toBe(mockEnvMap);
      expect(scene.backgroundBlurriness).toBe(0.4);
      expect(mockTexture.dispose).toHaveBeenCalled();
    });

    it('should return error when no URL provided', async () => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl: undefined,
        usePathTracing: false,
        pathTracingManager: null
      });

      const result = await manager.load();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_CONFIGURATION);
        expect(result.error.message).toContain('No environment map URL provided');
      }
    });

    it('should handle texture loading error', async () => {
      mockLoad.mockImplementationOnce((url, onLoad, onProgress, onError) => {
        setTimeout(() => onError(new Error('Network error')), 0);
      });

      const result = await manager.load();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        expect(result.error.message).toContain('Failed to load environment map');
      }
    });

    it('should process path tracing environment when enabled', async () => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: true,
        pathTracingManager: mockPathTracingManager as any,
        blurStrengthPathTracing: 0.5
      });

      const result = await manager.load();

      expect(result.ok).toBe(true);
      expect(mockBlurredEnvMapGenerator.generate).toHaveBeenCalledWith(mockTexture, 0.5);
      expect(mockPathTracingManager.ptRenderer.updateEnvironment).toHaveBeenCalled();
      expect(mockTexture.dispose).toHaveBeenCalled();
    });

    it('should handle missing BlurredEnvMapGenerator', async () => {
      const { importRaytracer } = require('../../importRaytracer');
      importRaytracer.mockReturnValueOnce({ BlurredEnvMapGenerator: null });

      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: true,
        pathTracingManager: mockPathTracingManager as any
      });

      const result = await manager.load();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        expect(result.error.message).toContain('Failed to import BlurredEnvMapGenerator');
      }
    });

    it('should use custom backgroundBlurriness value', async () => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null,
        backgroundBlurriness: 0.8
      });

      await manager.load();

      expect(scene.backgroundBlurriness).toBe(0.8);
    });

    it('should render scene when not using path tracing', async () => {
      await manager.load();

      expect(renderer.render).toHaveBeenCalledWith(scene, camera);
    });
  });

  describe('updateEnvironment', () => {
    beforeEach(() => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });
    });

    it('should successfully update environment', async () => {
      // Load environment first
      await manager.load();
      
      const result = manager.updateEnvironment();
      expect(result.ok).toBe(true);
    });

    it('should return error when scene is not available', () => {
      (manager as any).scene = null;
      
      const result = manager.updateEnvironment();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.SCENE_INIT_FAILED);
        expect(result.error.message).toContain('Scene not available');
      }
    });

    it('should return error when no environment map loaded', () => {
      const result = manager.updateEnvironment();
      
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        expect(result.error.message).toContain('No environment map loaded');
      }
    });

    it('should update path tracer environment when available', async () => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: true,
        pathTracingManager: mockPathTracingManager as any
      });

      await manager.load();
      mockPathTracingManager.ptRenderer.updateEnvironment.mockClear();

      const result = manager.updateEnvironment();
      
      expect(result.ok).toBe(true);
      expect(mockPathTracingManager.ptRenderer.updateEnvironment).toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });
    });

    it('should clean up resources', async () => {
      await manager.load();
      
      manager.dispose();

      expect(scene.environment).toBeNull();
      expect(scene.background).toBeNull();
      expect((manager as any).renderer).toBeNull();
      expect((manager as any).scene).toBeNull();
      expect((manager as any).camera).toBeNull();
    });

    it('should handle dispose without loading', () => {
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should dispose PMREM generator if active', async () => {
      const mockPMREMDispose = jest.fn();
      const PMREMGenerator = THREE.PMREMGenerator as jest.Mock;
      PMREMGenerator.mockImplementationOnce(() => ({
        compileEquirectangularShader: jest.fn(),
        fromEquirectangular: jest.fn(() => ({ texture: mockEnvMap })),
        dispose: mockPMREMDispose
      }));

      await manager.load();
      
      expect(mockPMREMDispose).toHaveBeenCalled();
    });

    it('should not dispose already disposed texture', async () => {
      await manager.load();
      mockTexture.dispose.mockClear();
      
      manager.dispose();
      
      // Texture was already disposed in load, shouldn't be called again
      expect(mockTexture.dispose).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle exceptions during texture processing', async () => {
      mockLoad.mockImplementationOnce((url, onLoad) => {
        setTimeout(() => {
          // Simulate an error during texture processing
          const throwingTexture = {
            ...mockTexture,
            set mapping(value: any) {
              throw new Error('Texture processing error');
            }
          };
          onLoad(throwingTexture);
        }, 0);
      });

      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: false,
        pathTracingManager: null
      });

      const result = await manager.load();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
      }
    });

    it('should handle path tracing setup errors', async () => {
      mockBlurredEnvMapGenerator.generate.mockImplementationOnce(() => {
        throw new Error('Blur generation failed');
      });

      manager = new EnvironmentMapManager({
        renderer,
        scene,
        camera,
        envMapUrl,
        usePathTracing: true,
        pathTracingManager: mockPathTracingManager as any
      });

      const result = await manager.load();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDER_ERROR);
      }
    });
  });
});