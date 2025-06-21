import * as THREE from 'three';
import { PathTracingManager } from '../PathTracingManager';
import { SimpleViewerOptions } from '../../../types';
import { ErrorCode } from '../../../errors';
import defaultOptions from '../../../defaultOptions';

// Mock WebGLRenderer
const mockCanvas = {
  toDataURL: jest.fn(() => 'data:image/png;base64,test'),
  getContext: jest.fn(() => ({})),
};

jest.mock('three', () => {
  const actualThree = jest.requireActual('three');
  return {
    ...actualThree,
    WebGLRenderer: jest.fn(() => ({
      domElement: mockCanvas,
      setSize: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
    })),
  };
});

// Mock WebGLPathTracer
const mockPathTracer = {
  setScene: jest.fn(),
  renderToCanvas: true,
  updateMaterials: jest.fn(),
  updateLights: jest.fn(),
  updateEnvironment: jest.fn(),
  reset: jest.fn(),
  renderSample: jest.fn(),
  dispose: jest.fn(),
};

// Mock importRaytracer
jest.mock('../../importRaytracer', () => ({
  importRaytracer: jest.fn(() => ({
    WebGLPathTracer: jest.fn(() => mockPathTracer),
    PhysicalCamera: jest.fn(),
    BlurredEnvMapGenerator: jest.fn(),
  }))
}));

describe('PathTracingManager', () => {
  let manager: PathTracingManager;
  let options: SimpleViewerOptions;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let onComplete: jest.Mock;

  beforeEach(() => {
    options = { ...defaultOptions, usePathTracing: true, maxSamplesPathTracing: 50 };
    renderer = new THREE.WebGLRenderer();
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    onComplete = jest.fn();

    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('should successfully initialize path tracer', () => {
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      const result = manager.setup();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mockPathTracer);
        expect(manager.ptRenderer).toBe(mockPathTracer);
        expect(mockPathTracer.setScene).toHaveBeenCalledWith(scene, camera);
        expect(mockPathTracer.updateMaterials).toHaveBeenCalled();
        expect(mockPathTracer.updateLights).toHaveBeenCalled();
      }
    });

    it('should return error when renderer is null', () => {
      manager = new PathTracingManager(null as any, scene, camera, options, onComplete);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
        expect(result.error.message).toContain('Renderer is not provided');
      }
    });

    it('should return error when scene is null', () => {
      manager = new PathTracingManager(renderer, null as any, camera, options, onComplete);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.SCENE_INIT_FAILED);
        expect(result.error.message).toContain('Scene is not provided');
      }
    });

    it('should return error when camera is null', () => {
      manager = new PathTracingManager(renderer, scene, null as any, options, onComplete);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.CAMERA_INIT_FAILED);
        expect(result.error.message).toContain('Camera is not provided');
      }
    });

    it('should handle WebGLPathTracer import failure', () => {
      const { importRaytracer } = require('../../importRaytracer');
      importRaytracer.mockReturnValueOnce({ WebGLPathTracer: null });
      
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RESOURCE_NOT_FOUND);
        expect(result.error.message).toContain('Failed to import WebGLPathTracer');
      }
    });

    it('should update environment when scene has environment map', () => {
      scene.environment = new THREE.Texture();
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      manager.setup();

      expect(mockPathTracer.updateEnvironment).toHaveBeenCalled();
    });

    it('should handle setup errors gracefully', () => {
      mockPathTracer.setScene.mockImplementationOnce(() => {
        throw new Error('Scene setup failed');
      });
      
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDER_ERROR);
      }
    });
  });

  describe('updatePathTracerRenderer', () => {
    it('should update path tracer successfully', () => {
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      manager.setup();
      
      const result = manager.updatePathTracerRenderer();

      expect(result.ok).toBe(true);
      expect(mockPathTracer.setScene).toHaveBeenCalledWith(scene, camera);
      expect(mockPathTracer.updateMaterials).toHaveBeenCalled();
      expect(mockPathTracer.updateLights).toHaveBeenCalled();
    });

    it('should return error when path tracer not initialized', () => {
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      
      const result = manager.updatePathTracerRenderer();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_CONFIGURATION);
        expect(result.error.message).toContain('Path tracer not initialized');
      }
    });
  });

  describe('path tracing workflow', () => {
    beforeEach(() => {
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      manager.setup();
    });

    it('should start path tracing', () => {
      manager.startPathTracing();
      
      expect(mockPathTracer.reset).toHaveBeenCalled();
    });

    it('should stop path tracing', () => {
      manager.startPathTracing();
      manager.stopPathTracing();
      
      // Verify internal state change (indirectly through behavior)
      manager.startPathTracing(); // Should reset again if properly stopped
      expect(mockPathTracer.reset).toHaveBeenCalledTimes(2);
    });

    it('should save screenshot', () => {
      manager.saveScreenshot();
      
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
      expect(onComplete).toHaveBeenCalledWith('data:image/png;base64,test');
    });

    it('should reset for standard render', () => {
      manager.startPathTracing();
      manager.resetForStandardRender();
      
      // Should be able to start again after reset
      manager.startPathTracing();
      expect(mockPathTracer.reset).toHaveBeenCalledTimes(2);
    });
  });

  describe('onComplete setter/getter', () => {
    it('should set and get onComplete callback', () => {
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      
      const newCallback = jest.fn();
      manager.onComplete = newCallback;
      
      expect(manager.onComplete).toBe(newCallback);
    });
  });

  describe('dispose', () => {
    it('should dispose path tracer when initialized', () => {
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      manager.setup();
      manager.startPathTracing();

      manager.dispose();

      expect(mockPathTracer.dispose).toHaveBeenCalled();
      expect(manager.ptRenderer).toBeNull();
    });

    it('should handle dispose when path tracer is null', () => {
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      
      expect(() => manager.dispose()).not.toThrow();
    });

    it('should handle path tracer without dispose method', () => {
      const pathTracerWithoutDispose = { ...mockPathTracer };
      delete (pathTracerWithoutDispose as any).dispose;
      
      const { importRaytracer } = require('../../importRaytracer');
      importRaytracer.mockReturnValueOnce({
        WebGLPathTracer: jest.fn(() => pathTracerWithoutDispose)
      });
      
      manager = new PathTracingManager(renderer, scene, camera, options, onComplete);
      manager.setup();
      
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});