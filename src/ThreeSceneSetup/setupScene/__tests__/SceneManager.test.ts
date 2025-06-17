// Mock importRaytracer before any imports
jest.mock('../../importRaytracer', () => ({
  importRaytracer: jest.fn(() => ({
    PhysicalCamera: class PhysicalCamera {},
    WebGLPathTracer: jest.fn(),
    BlurredEnvMapGenerator: jest.fn()
  }))
}));

import * as THREE from 'three';
import { SceneManager } from '../SceneManager';
import { CameraManager } from '../CameraManager';
import { RendererManager } from '../RendererManager';
import { ControlsManager } from '../ControlsManager';
import { SceneInitializer } from '../../SceneInitializer';
import { PathTracingManager } from '../PathTracingManager';
import { AnimationManager } from '../AnimationManager';
import { EnvironmentMapManager } from '../EnvironmentMapManager';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { Result } from '../../../utils/Result';
import defaultOptions from '../../../defaultOptions';

// Mock all dependencies
jest.mock('../CameraManager');
jest.mock('../RendererManager');
jest.mock('../ControlsManager');
jest.mock('../../SceneInitializer');
jest.mock('../PathTracingManager');
jest.mock('../AnimationManager');
jest.mock('../EnvironmentMapManager');

describe('SceneManager', () => {
  let mountRef: React.RefObject<HTMLDivElement>;
  let sceneRef: React.MutableRefObject<THREE.Scene | null>;
  let rendererRef: React.MutableRefObject<THREE.WebGLRenderer | null>;
  let cameraRef: React.MutableRefObject<THREE.Camera | null>;
  let mockSetRenderCompleteImage: jest.Mock;
  let mockCamera: THREE.PerspectiveCamera;
  let mockRenderer: THREE.WebGLRenderer;
  let mockControls: any;
  let mockScene: THREE.Scene;
  let mockAnimationManager: any;
  
  beforeEach(() => {
    // Create mock refs
    const mockMount = document.createElement('div');
    mockMount.appendChild = jest.fn();
    mountRef = { current: mockMount };
    sceneRef = { current: null };
    rendererRef = { current: null };
    cameraRef = { current: null };
    
    // Create mock objects
    mockCamera = new THREE.PerspectiveCamera();
    mockRenderer = {
      domElement: document.createElement('canvas'),
      setSize: jest.fn(),
      render: jest.fn(),
      dispose: jest.fn(),
    } as any;
    mockControls = {
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      update: jest.fn(),
      dispose: jest.fn(),
    };
    mockScene = new THREE.Scene();
    
    mockSetRenderCompleteImage = jest.fn();
    
    // Create mock animation manager instance
    mockAnimationManager = {
      setup: jest.fn(() => Result.ok(undefined)),
      startInitialRendering: jest.fn(),
      startRendering: jest.fn(() => Result.ok(undefined)),
      stopRendering: jest.fn(() => Result.ok(undefined)),
    };
    
    // Setup mocks
    (CameraManager as jest.MockedClass<typeof CameraManager>).mockImplementation(() => ({
      camera: mockCamera,
    } as any));
    
    (RendererManager as jest.MockedClass<typeof RendererManager>).mockImplementation(() => ({
      setup: jest.fn(() => Result.ok(mockRenderer)),
      renderer: mockRenderer,
    } as any));
    
    (ControlsManager as jest.MockedClass<typeof ControlsManager>).mockImplementation(() => ({
      setup: jest.fn(() => Result.ok(mockControls)),
      controls: mockControls,
    } as any));
    
    (SceneInitializer as jest.MockedClass<typeof SceneInitializer>).mockImplementation(() => ({
      setup: jest.fn(() => Result.ok(mockScene)),
      scene: mockScene,
    } as any));
    
    (AnimationManager as jest.MockedClass<typeof AnimationManager>).mockImplementation(() => mockAnimationManager);
    
    (EnvironmentMapManager as jest.MockedClass<typeof EnvironmentMapManager>).mockImplementation(() => ({
      setup: jest.fn(() => Result.ok(undefined)),
      load: jest.fn(() => Promise.resolve(Result.ok(new THREE.Texture()))),
    } as any));
    
    (PathTracingManager as jest.MockedClass<typeof PathTracingManager>).mockImplementation(() => ({
      setup: jest.fn(() => Result.ok(undefined)),
      stopPathTracing: jest.fn(),
    } as any));
  });
  
  afterEach(() => {
    jest.clearAllMocks();
  });
  
  describe('constructor', () => {
    it('should throw error when mount ref is not ready', () => {
      const emptyMountRef = { current: null };
      
      expect(() => {
        new SceneManager(
          { mountRef: emptyMountRef, sceneRef, rendererRef, cameraRef },
          null,
          defaultOptions,
          mockSetRenderCompleteImage
        );
      }).toThrow(new ThreeViewerError(
        'Mount element is not ready',
        ErrorCode.COMPONENT_NOT_MOUNTED
      ));
    });
    
    it('should initialize all managers successfully', () => {
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      expect(CameraManager).toHaveBeenCalledWith(mountRef, defaultOptions);
      expect(RendererManager).toHaveBeenCalledWith(defaultOptions);
      expect(ControlsManager).toHaveBeenCalledWith(
        mockCamera,
        mockRenderer.domElement,
        defaultOptions
      );
      expect(SceneInitializer).toHaveBeenCalledWith(
        null,
        mockCamera,
        mockControls,
        defaultOptions,
        mountRef
      );
      expect(AnimationManager).toHaveBeenCalledWith(
        mockRenderer,
        mockScene,
        mockCamera,
        mockControls,
        defaultOptions,
        null
      );
      
      // Check refs are set
      expect(rendererRef.current).toBe(mockRenderer);
      expect(cameraRef.current).toBe(mockCamera);
      expect(sceneRef.current).toBe(mockScene);
    });
    
    it('should throw error when renderer setup fails', () => {
      const error = new ThreeViewerError('Renderer failed', ErrorCode.RENDERER_INIT_FAILED);
      (RendererManager as jest.MockedClass<typeof RendererManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.err(error)),
      } as any));
      
      expect(() => {
        new SceneManager(
          { mountRef, sceneRef, rendererRef, cameraRef },
          null,
          defaultOptions,
          mockSetRenderCompleteImage
        );
      }).toThrow(error);
    });
    
    it('should throw error when controls setup fails', () => {
      const error = new ThreeViewerError('Controls failed', ErrorCode.INVALID_CONFIGURATION);
      (ControlsManager as jest.MockedClass<typeof ControlsManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.err(error)),
      } as any));
      
      expect(() => {
        new SceneManager(
          { mountRef, sceneRef, rendererRef, cameraRef },
          null,
          defaultOptions,
          mockSetRenderCompleteImage
        );
      }).toThrow(error);
    });
    
    it('should throw error when scene setup fails', () => {
      const error = new ThreeViewerError('Scene failed', ErrorCode.SCENE_INIT_FAILED);
      (SceneInitializer as jest.MockedClass<typeof SceneInitializer>).mockImplementation(() => ({
        setup: jest.fn(() => Result.err(error)),
      } as any));
      
      expect(() => {
        new SceneManager(
          { mountRef, sceneRef, rendererRef, cameraRef },
          null,
          defaultOptions,
          mockSetRenderCompleteImage
        );
      }).toThrow(error);
    });
    
    it('should throw error when animation manager setup fails', () => {
      const error = new ThreeViewerError('Animation failed', ErrorCode.INVALID_CONFIGURATION);
      
      // Create a new mock for this test
      const failingAnimationManager = {
        setup: jest.fn(() => Result.err(error)),
      };
      
      (AnimationManager as jest.MockedClass<typeof AnimationManager>).mockImplementation(() => failingAnimationManager as any);
      
      expect(() => {
        new SceneManager(
          { mountRef, sceneRef, rendererRef, cameraRef },
          null,
          defaultOptions,
          mockSetRenderCompleteImage
        );
      }).toThrow(error);
      
      // Restore the original mock
      (AnimationManager as jest.MockedClass<typeof AnimationManager>).mockImplementation(() => mockAnimationManager);
    });
    
    it('should initialize path tracing when enabled', () => {
      const options = { ...defaultOptions, usePathTracing: true };
      
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        options,
        mockSetRenderCompleteImage
      );
      
      expect(PathTracingManager).toHaveBeenCalledWith(
        mockRenderer,
        mockScene,
        mockCamera,
        options,
        mockSetRenderCompleteImage
      );
      expect(sceneManager.pathTracingManager).toBeTruthy();
    });
    
    it('should handle path tracing setup failure gracefully', () => {
      const options = { ...defaultOptions, usePathTracing: true };
      const error = new ThreeViewerError('Path tracing failed', ErrorCode.RENDERER_INIT_FAILED);
      
      (PathTracingManager as jest.MockedClass<typeof PathTracingManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.err(error)),
      } as any));
      
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        options,
        mockSetRenderCompleteImage
      );
      
      expect(consoleWarn).toHaveBeenCalledWith('Failed to setup path tracer:', error);
      expect(sceneManager.pathTracingManager).toBeNull();
      
      consoleWarn.mockRestore();
    });
    
    it('should initialize environment map manager', () => {
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      expect(EnvironmentMapManager).toHaveBeenCalledWith({
        renderer: mockRenderer,
        scene: mockScene,
        camera: mockCamera,
        envMapUrl: defaultOptions.envMapUrl,
        usePathTracing: defaultOptions.usePathTracing,
        pathTracingManager: null,
        backgroundBlurriness: 0.4,
        blurStrengthPathTracing: 0.4
      });
    });
    
    it('should handle environment map setup failure gracefully', () => {
      const error = new ThreeViewerError('Env map failed', ErrorCode.TEXTURE_LOAD_FAILED);
      
      (EnvironmentMapManager as jest.MockedClass<typeof EnvironmentMapManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.err(error)),
        load: jest.fn(() => Promise.resolve(Result.ok(new THREE.Texture()))),
      } as any));
      
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      expect(consoleWarn).toHaveBeenCalledWith('Failed to setup environment map manager:', error);
      
      consoleWarn.mockRestore();
    });
    
    it('should load environment map when URL is provided', async () => {
      const options = { ...defaultOptions, envMapUrl: 'test.hdr' };
      const mockLoad = jest.fn(() => Promise.resolve(Result.ok(new THREE.Texture())));
      
      (EnvironmentMapManager as jest.MockedClass<typeof EnvironmentMapManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.ok(undefined)),
        load: mockLoad,
      } as any));
      
      new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        options,
        mockSetRenderCompleteImage
      );
      
      expect(mockLoad).toHaveBeenCalled();
      
      // Wait for async load
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    
    it('should handle environment map load failure', async () => {
      const options = { ...defaultOptions, envMapUrl: 'test.hdr' };
      const error = new ThreeViewerError('Load failed', ErrorCode.TEXTURE_LOAD_FAILED);
      const mockLoad = jest.fn(() => Promise.resolve(Result.err(error)));
      
      (EnvironmentMapManager as jest.MockedClass<typeof EnvironmentMapManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.ok(undefined)),
        load: mockLoad,
      } as any));
      
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        options,
        mockSetRenderCompleteImage
      );
      
      // Wait for async load
      await new Promise(resolve => setTimeout(resolve, 0));
      
      expect(consoleWarn).toHaveBeenCalledWith('Failed to load environment map:', error);
      
      consoleWarn.mockRestore();
    });
    
    it('should append renderer DOM element to mount', () => {
      new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      expect(mountRef.current!.appendChild).toHaveBeenCalledWith(mockRenderer.domElement);
    });
    
    it('should setup control event listeners', () => {
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      expect(mockControls.addEventListener).toHaveBeenCalledWith('start', expect.any(Function));
      expect(mockControls.addEventListener).toHaveBeenCalledWith('end', expect.any(Function));
      
      // Test start event handler
      const startHandler = mockControls.addEventListener.mock.calls[0][1];
      startHandler();
      
      expect(mockAnimationManager.startRendering).toHaveBeenCalled();
      
      // Test end event handler
      const endHandler = mockControls.addEventListener.mock.calls[1][1];
      endHandler();
      
      expect(mockAnimationManager.stopRendering).toHaveBeenCalled();
    });
    
    it('should handle stop rendering error in control end event', () => {
      const error = new ThreeViewerError('Stop failed', ErrorCode.INVALID_CONFIGURATION);
      
      // Override the stopRendering method for this test
      mockAnimationManager.stopRendering = jest.fn(() => Result.err(error));
      
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      // Trigger end event
      const endHandler = mockControls.addEventListener.mock.calls[1][1];
      endHandler();
      
      expect(consoleWarn).toHaveBeenCalledWith('Failed to stop rendering:', error);
      
      consoleWarn.mockRestore();
      
      // Reset the mock for other tests
      mockAnimationManager.stopRendering = jest.fn(() => Result.ok(undefined));
    });
    
    it('should pass object to SceneInitializer when provided', () => {
      const mockObject = new THREE.Mesh();
      
      new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        mockObject,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      expect(SceneInitializer).toHaveBeenCalledWith(
        mockObject,
        mockCamera,
        mockControls,
        defaultOptions,
        mountRef
      );
    });
  });
  
  describe('onStartRendering', () => {
    it('should start rendering successfully', () => {
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      sceneManager.onStartRendering();
      
      expect(mockAnimationManager.startRendering).toHaveBeenCalled();
    });
    
    it('should throw error when path tracing is enabled but manager is null', () => {
      const options = { ...defaultOptions, usePathTracing: true };
      
      // Force pathTracingManager to be null
      (PathTracingManager as jest.MockedClass<typeof PathTracingManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.err(new ThreeViewerError('Failed', ErrorCode.RENDERER_INIT_FAILED))),
      } as any));
      
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation();
      
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        options,
        mockSetRenderCompleteImage
      );
      
      expect(() => {
        sceneManager.onStartRendering();
      }).toThrow(new ThreeViewerError(
        'Path Tracing Manager is not initialized',
        ErrorCode.RENDERER_INIT_FAILED
      ));
      
      consoleWarn.mockRestore();
    });
    
    it('should stop path tracing when enabled', () => {
      const options = { ...defaultOptions, usePathTracing: true };
      
      const mockStopPathTracing = jest.fn();
      (PathTracingManager as jest.MockedClass<typeof PathTracingManager>).mockImplementation(() => ({
        setup: jest.fn(() => Result.ok(undefined)),
        stopPathTracing: mockStopPathTracing,
      } as any));
      
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        options,
        mockSetRenderCompleteImage
      );
      
      sceneManager.onStartRendering();
      
      expect(mockStopPathTracing).toHaveBeenCalled();
    });
    
    it('should throw error when start rendering fails', () => {
      const error = new ThreeViewerError('Start failed', ErrorCode.INVALID_CONFIGURATION);
      
      // Override the startRendering method for this test
      mockAnimationManager.startRendering = jest.fn(() => Result.err(error));
      
      const consoleError = jest.spyOn(console, 'error').mockImplementation();
      
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      expect(() => {
        sceneManager.onStartRendering();
      }).toThrow(error);
      
      expect(consoleError).toHaveBeenCalledWith('Failed to start rendering:', error);
      
      consoleError.mockRestore();
      
      // Reset the mock for other tests
      mockAnimationManager.startRendering = jest.fn(() => Result.ok(undefined));
    });
  });
  
  describe('getSceneElements', () => {
    it('should return all scene elements', () => {
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        defaultOptions,
        mockSetRenderCompleteImage
      );
      
      const elements = sceneManager.getSceneElements();
      
      expect(elements).toEqual({
        scene: mockScene,
        camera: mockCamera,
        renderer: mockRenderer,
        controls: mockControls,
        pathTracingManager: null,
      });
    });
    
    it('should return path tracing manager when enabled', () => {
      const options = { ...defaultOptions, usePathTracing: true };
      
      const sceneManager = new SceneManager(
        { mountRef, sceneRef, rendererRef, cameraRef },
        null,
        options,
        mockSetRenderCompleteImage
      );
      
      const elements = sceneManager.getSceneElements();
      
      expect(elements.pathTracingManager).toBeTruthy();
    });
  });
});