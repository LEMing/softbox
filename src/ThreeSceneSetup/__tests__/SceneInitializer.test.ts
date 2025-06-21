import * as THREE from 'three';
import { SceneInitializer } from '../SceneInitializer';
import { SimpleViewerOptions } from '../../types';
import { ErrorCode } from '../../errors';
import defaultOptions from '../../defaultOptions';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

// Mock dependencies
jest.mock('../initializeScene');
jest.mock('../addHelpers');
jest.mock('../addLighting');
jest.mock('../createGradientBackground');
jest.mock('../fitCameraToObject');
jest.mock('../importRaytracer', () => ({
  importRaytracer: () => ({
    PhysicalCamera: jest.fn(),
    WebGLPathTracer: jest.fn(),
    BlurredEnvMapGenerator: jest.fn()
  })
}));

// Mock OrbitControls
jest.mock('three/examples/jsm/controls/OrbitControls', () => ({
  OrbitControls: jest.fn().mockImplementation(() => ({
    target: new THREE.Vector3(),
    update: jest.fn(),
  }))
}));

describe('SceneInitializer', () => {
  let initializer: SceneInitializer;
  let options: SimpleViewerOptions;
  let camera: THREE.Camera;
  let controls: OrbitControls;
  let object: THREE.Object3D;
  let mountRef: React.RefObject<HTMLDivElement>;
  let mockDiv: HTMLDivElement;

  beforeEach(() => {
    options = { ...defaultOptions };
    camera = new THREE.PerspectiveCamera();
    controls = new OrbitControls(camera, document.createElement('canvas'));
    object = new THREE.Mesh();
    mockDiv = document.createElement('div');
    
    // Set dimensions
    Object.defineProperty(mockDiv, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(mockDiv, 'clientHeight', { value: 600, configurable: true });
    
    mountRef = { current: mockDiv };

    // Mock initializeScene to return a scene
    const { initializeScene } = require('../initializeScene');
    initializeScene.mockReturnValue(new THREE.Scene());

    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('should successfully initialize scene', () => {
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      const result = initializer.setup();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBeInstanceOf(THREE.Scene);
        expect(initializer.scene).toBe(result.value);
      }
    });

    it('should return error when mount ref is null', () => {
      const nullMountRef = { current: null };
      initializer = new SceneInitializer(object, camera, controls, options, nullMountRef);
      
      const result = initializer.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.COMPONENT_NOT_MOUNTED);
        expect(result.error.message).toContain('Mount element is not ready');
      }
    });

    it('should return error when camera is null', () => {
      initializer = new SceneInitializer(object, null as any, controls, options, mountRef);
      
      const result = initializer.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.CAMERA_INIT_FAILED);
        expect(result.error.message).toContain('Camera is not provided');
      }
    });

    it('should return error when controls are null', () => {
      initializer = new SceneInitializer(object, camera, null as any, options, mountRef);
      
      const result = initializer.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_CONFIGURATION);
        expect(result.error.message).toContain('Controls are not provided');
      }
    });

    it('should return error when mount element has invalid dimensions', () => {
      Object.defineProperty(mockDiv, 'clientWidth', { value: 0 });
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      
      const result = initializer.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_CONFIGURATION);
        expect(result.error.message).toContain('Invalid mount element dimensions');
      }
    });

    it('should handle initializeScene returning null', () => {
      const { initializeScene } = require('../initializeScene');
      initializeScene.mockReturnValue(null);
      
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      const result = initializer.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.SCENE_INIT_FAILED);
        expect(result.error.message).toContain('Failed to initialize Three.js scene');
      }
    });

    it('should add object to scene when provided', () => {
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      const result = initializer.setup();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.children).toContain(object);
        expect(object.castShadow).toBe(true);
      }
    });

    it('should work without object', () => {
      initializer = new SceneInitializer(null, camera, controls, options, mountRef);
      const result = initializer.setup();

      expect(result.ok).toBe(true);
    });

    it('should create gradient background when studioEnvironment is true', () => {
      options.helpers.studioEnvironment = true;
      const { createGradientBackground } = require('../createGradientBackground');
      
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      initializer.setup();

      expect(createGradientBackground).toHaveBeenCalledWith(
        expect.any(THREE.Scene),
        expect.any(THREE.Vector2)
      );
    });

    it('should fit camera to object when autoFitToObject is true', () => {
      options.camera.autoFitToObject = true;
      const { fitCameraToObject } = require('../fitCameraToObject');
      
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      initializer.setup();

      expect(fitCameraToObject).toHaveBeenCalledWith(
        expect.any(THREE.Scene),
        camera
      );
    });

    it('should handle setup errors gracefully', () => {
      const { addLighting } = require('../addLighting');
      addLighting.mockImplementation(() => {
        throw new Error('Lighting setup failed');
      });
      
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      const result = initializer.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.SCENE_INIT_FAILED);
      }
    });
  });

  describe('dispose', () => {
    it('should dispose scene and its children', () => {
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      initializer.setup();

      // Add some test objects with geometry and materials
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial();
      const mesh = new THREE.Mesh(geometry, material);
      
      geometry.dispose = jest.fn();
      material.dispose = jest.fn();
      
      initializer.scene?.add(mesh);

      initializer.dispose();

      expect(initializer.scene).toBeNull();
      expect(geometry.dispose).toHaveBeenCalled();
      expect(material.dispose).toHaveBeenCalled();
    });

    it('should handle dispose when scene is null', () => {
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      
      expect(() => initializer.dispose()).not.toThrow();
    });

    it('should dispose array of materials', () => {
      initializer = new SceneInitializer(object, camera, controls, options, mountRef);
      initializer.setup();

      const materials = [
        new THREE.MeshBasicMaterial(),
        new THREE.MeshStandardMaterial()
      ];
      materials.forEach(m => m.dispose = jest.fn());
      
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), materials);
      initializer.scene?.add(mesh);

      initializer.dispose();

      materials.forEach(m => {
        expect(m.dispose).toHaveBeenCalled();
      });
    });
  });
});