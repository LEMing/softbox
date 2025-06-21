import * as THREE from 'three';
import { AnimationManager } from '../AnimationManager';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { SimpleViewerOptions } from '../../../types';
import { ErrorCode } from '../../../errors';
import defaultOptions from '../../../defaultOptions';
import { PathTracingManager } from '../PathTracingManager';

// Mock lodash throttle
jest.mock('lodash', () => ({
  throttle: (fn: Function) => Object.assign(fn, { cancel: jest.fn() })
}));

// Mock THREE.WebGLRenderer
const mockRenderer = {
  render: jest.fn(),
  shadowMap: { needsUpdate: false },
  domElement: document.createElement('canvas')
};

// Mock OrbitControls
const mockControls = {
  update: jest.fn(),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn()
};

// Mock PathTracingManager
const mockPathTracingManager = {
  ptRenderer: {
    updateCamera: jest.fn()
  },
  startPathTracing: jest.fn(),
  stopPathTracing: jest.fn()
};

// Mock requestAnimationFrame and cancelAnimationFrame
let animationFrameId = 0;
const mockAnimationFrames: { [key: number]: Function } = {};
let capturedCallbacks: Function[] = [];

global.requestAnimationFrame = jest.fn((callback) => {
  animationFrameId++;
  mockAnimationFrames[animationFrameId] = callback;
  capturedCallbacks.push(callback);
  return animationFrameId;
}) as any;

global.cancelAnimationFrame = jest.fn((id) => {
  delete mockAnimationFrames[id];
});

global.performance = {
  now: jest.fn(() => 1000)
} as any;

describe('AnimationManager', () => {
  let manager: AnimationManager;
  let options: SimpleViewerOptions;
  let renderer: THREE.WebGLRenderer;
  let scene: THREE.Scene;
  let camera: THREE.Camera;
  let controls: OrbitControls;
  let pathTracingManager: PathTracingManager | null;

  beforeEach(() => {
    options = { ...defaultOptions };
    renderer = mockRenderer as any;
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera();
    controls = mockControls as any;
    pathTracingManager = null;

    jest.clearAllMocks();
    
    // Clear animation frames and callbacks
    Object.keys(mockAnimationFrames).forEach(key => {
      delete mockAnimationFrames[Number(key)];
    });
    capturedCallbacks = [];
    animationFrameId = 0;
  });

  describe('setup', () => {
    it('should successfully initialize animation manager', () => {
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      const result = manager.setup();

      expect(result.ok).toBe(true);
      
      // Animation should not start automatically on setup
      expect(global.requestAnimationFrame).not.toHaveBeenCalled();
    });

    it('should return error when renderer is null', () => {
      manager = new AnimationManager(null, scene, camera, controls, options, pathTracingManager);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
        expect(result.error.message).toContain('Renderer is not provided');
      }
    });

    it('should return error when scene is null', () => {
      manager = new AnimationManager(renderer, null, camera, controls, options, pathTracingManager);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.SCENE_INIT_FAILED);
        expect(result.error.message).toContain('Scene is not provided');
      }
    });

    it('should return error when camera is null', () => {
      manager = new AnimationManager(renderer, scene, null, controls, options, pathTracingManager);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.CAMERA_INIT_FAILED);
        expect(result.error.message).toContain('Camera is not provided');
      }
    });

    it('should return error when controls are null', () => {
      manager = new AnimationManager(renderer, scene, camera, null, options, pathTracingManager);
      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_CONFIGURATION);
        expect(result.error.message).toContain('Controls are not provided');
      }
    });

    it('should start path tracing when initial rendering starts', () => {
      options.usePathTracing = true;
      options.staticScene = false; // Ensure animation runs
      pathTracingManager = mockPathTracingManager as any;
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();

      expect(global.requestAnimationFrame).toHaveBeenCalled();
      expect(mockPathTracingManager.startPathTracing).toHaveBeenCalled();
    });
  });

  describe('animation loop', () => {
    beforeEach(() => {
      options.staticScene = false; // Ensure animation runs
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();
    });

    it('should update controls in animation loop', () => {
      // Manually trigger the animation frame
      const frameCallback = capturedCallbacks[capturedCallbacks.length - 1];
      frameCallback(1000);

      expect(mockControls.update).toHaveBeenCalled();
    });

    it('should render scene in animation loop', () => {
      // Manually trigger the animation frame
      const frameCallback = capturedCallbacks[capturedCallbacks.length - 1];
      frameCallback(1000);

      expect(mockRenderer.render).toHaveBeenCalledWith(scene, camera);
    });

    it('should call custom animation loop if provided', () => {
      const animationLoop = jest.fn();
      options.animationLoop = animationLoop;
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();

      // Manually trigger the animation frame
      const frameCallback = capturedCallbacks[capturedCallbacks.length - 1];
      frameCallback(1000);

      expect(animationLoop).toHaveBeenCalledWith(1000);
    });

    it('should handle errors in custom animation loop', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      options.animationLoop = () => {
        throw new Error('Animation loop error');
      };
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();

      // Manually trigger the animation frame
      const frameCallback = capturedCallbacks[capturedCallbacks.length - 1];
      frameCallback(1000);

      expect(consoleError).toHaveBeenCalledWith('AnimationManager: Error in animation loop', expect.any(Error));
      consoleError.mockRestore();
    });

    it('should update path tracer camera when enabled', () => {
      options.usePathTracing = true;
      pathTracingManager = mockPathTracingManager as any;
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();

      // Manually trigger the animation frame
      const frameCallback = capturedCallbacks[capturedCallbacks.length - 1];
      frameCallback(1000);

      expect(mockPathTracingManager.ptRenderer.updateCamera).toHaveBeenCalled();
    });

    it('should respect static scene option', () => {
      options.staticScene = true;
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();

      // Stop rendering
      manager.stopRendering();
      
      // Clear previous renders
      mockRenderer.render.mockClear();

      // In static scene mode with stopped rendering, throttledRender should not call render
      (manager as any).throttledRender();

      expect(mockRenderer.render).not.toHaveBeenCalled();
    });
  });

  describe('startRendering', () => {
    beforeEach(() => {
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
    });

    it('should start rendering successfully', () => {
      // First stop rendering
      manager.stopRendering();
      
      const result = manager.startRendering();

      expect(result.ok).toBe(true);
      expect(global.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should stop path tracing when starting rendering', () => {
      options.usePathTracing = true;
      pathTracingManager = mockPathTracingManager as any;
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.stopRendering();

      manager.startRendering();

      expect(mockPathTracingManager.stopPathTracing).toHaveBeenCalled();
    });

    it('should return error when components not initialized', () => {
      manager = new AnimationManager(null, null, null, null, options, null);
      
      const result = manager.startRendering();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_CONFIGURATION);
        expect(result.error.message).toContain('Required components not initialized');
      }
    });
  });

  describe('stopRendering', () => {
    beforeEach(() => {
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
    });

    it('should stop rendering successfully', () => {
      // Start rendering to get an animation frame ID
      manager.startRendering();
      
      const result = manager.stopRendering();

      expect(result.ok).toBe(true);
      expect(global.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should start path tracing when stopping rendering', () => {
      options.usePathTracing = true;
      pathTracingManager = mockPathTracingManager as any;
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();
      
      // Clear initial call
      mockPathTracingManager.startPathTracing.mockClear();

      manager.stopRendering();

      expect(mockPathTracingManager.startPathTracing).toHaveBeenCalledTimes(1); // Once in stopRendering
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      
      // Start rendering to ensure we have an animation frame
      manager.startRendering();

      manager.dispose();

      expect(global.cancelAnimationFrame).toHaveBeenCalled();
      
      // Try to start rendering after dispose - should fail
      const result = manager.startRendering();
      expect(result.ok).toBe(false);
    });

    it('should cancel throttled render', () => {
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();

      const throttledRender = (manager as any).throttledRender;
      expect(throttledRender.cancel).toBeDefined();
      
      manager.dispose();

      expect(throttledRender.cancel).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle render errors gracefully', () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      mockRenderer.render.mockImplementationOnce(() => {
        throw new Error('Render error');
      });
      
      options.staticScene = false; // Ensure animation runs
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      manager.startInitialRendering();

      // Manually trigger the animation frame
      const frameCallback = capturedCallbacks[capturedCallbacks.length - 1];
      frameCallback(1000);

      expect(consoleError).toHaveBeenCalledWith('AnimationManager: Render error', expect.any(Error));
      consoleError.mockRestore();
    });

    it('should warn when rendering with missing components', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      
      // Manually clear a component to simulate runtime error
      (manager as any).renderer = null;
      
      // Trigger render by calling throttledRender directly
      (manager as any).throttledRender();

      expect(consoleWarn).toHaveBeenCalledWith('AnimationManager: Cannot render - missing required components');
      consoleWarn.mockRestore();
    });
  });

  describe('startInitialRendering', () => {
    it('should start animation loop and path tracing', () => {
      options.usePathTracing = true;
      options.staticScene = false; // Ensure animation runs
      pathTracingManager = mockPathTracingManager as any;
      
      manager = new AnimationManager(renderer, scene, camera, controls, options, pathTracingManager);
      manager.setup();
      
      manager.startInitialRendering();

      expect(global.requestAnimationFrame).toHaveBeenCalledWith(expect.any(Function));
      expect(mockPathTracingManager.startPathTracing).toHaveBeenCalled();
    });
  });
});