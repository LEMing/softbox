import * as THREE from 'three';
import { fitCameraToObject } from '../fitCameraToObject';

// Mock importRaytracer at the module level
jest.mock('../importRaytracer', () => ({
  importRaytracer: jest.fn(() => ({
    PhysicalCamera: class PhysicalCamera extends THREE.PerspectiveCamera {}
  }))
}));

describe('fitCameraToObject', () => {
  let mockScene: THREE.Scene;
  let mockSize: THREE.Vector3;
  let mockCenter: THREE.Vector3;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Setup mock scene
    mockScene = new THREE.Scene();
    
    // Setup mock box calculations
    mockSize = new THREE.Vector3(10, 10, 10);
    mockCenter = new THREE.Vector3(0, 0, 0);
    
    // Mock Box3 prototype methods
    jest.spyOn(THREE.Box3.prototype, 'setFromObject').mockReturnThis();
    jest.spyOn(THREE.Box3.prototype, 'getSize').mockImplementation(function(target) {
      target.copy(mockSize);
      return target;
    });
    jest.spyOn(THREE.Box3.prototype, 'getCenter').mockImplementation(function(target) {
      target.copy(mockCenter);
      return target;
    });
    
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    consoleWarnSpy.mockRestore();
  });

  describe('PerspectiveCamera', () => {
    it('should fit perspective camera to object', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const initialPosition = camera.position.clone();
      
      fitCameraToObject(mockScene, camera);
      
      expect(THREE.Box3.prototype.setFromObject).toHaveBeenCalledWith(mockScene);
      expect(camera.position).not.toEqual(initialPosition);
      
      // Calculate expected position
      const maxDim = 10; // max of (10, 10, 10)
      const fov = (75 * Math.PI) / 180;
      const expectedZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * 1.2; // padding = 1.2
      
      expect(camera.position.x).toBe(0); // center.x
      expect(camera.position.y).toBe(0); // center.y
      expect(camera.position.z).toBeCloseTo(expectedZ);
    });

    it('should handle different object sizes', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      
      // Test with different sizes
      const sizes = [
        new THREE.Vector3(20, 10, 5),
        new THREE.Vector3(5, 30, 10),
        new THREE.Vector3(15, 15, 40)
      ];
      
      sizes.forEach(size => {
        mockSize.copy(size);
        fitCameraToObject(mockScene, camera);
        
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = (75 * Math.PI) / 180;
        const expectedZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * 1.2;
        
        expect(camera.position.z).toBeCloseTo(expectedZ);
      });
    });

    it('should handle different object centers', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      
      mockCenter.set(5, -10, 3);
      fitCameraToObject(mockScene, camera);
      
      const maxDim = 10;
      const fov = (75 * Math.PI) / 180;
      const expectedZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * 1.2;
      
      expect(camera.position.x).toBe(5);
      expect(camera.position.y).toBe(-10);
      expect(camera.position.z).toBeCloseTo(3 + expectedZ);
    });

    it('should update projection matrix', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const updateSpy = jest.spyOn(camera, 'updateProjectionMatrix');
      
      fitCameraToObject(mockScene, camera);
      
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should make camera look at object center', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      const lookAtSpy = jest.spyOn(camera, 'lookAt');
      
      mockCenter.set(2, 3, 4);
      fitCameraToObject(mockScene, camera);
      
      expect(lookAtSpy).toHaveBeenCalledWith(mockCenter);
    });
  });

  describe('OrthographicCamera', () => {
    it('should fit orthographic camera to object', () => {
      const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
      
      fitCameraToObject(mockScene, camera);
      
      const width = 10 * 1.2; // size.x * padding
      const height = 10 * 1.2; // size.y * padding
      
      expect(camera.left).toBe(-width / 2);
      expect(camera.right).toBe(width / 2);
      expect(camera.top).toBe(height / 2);
      expect(camera.bottom).toBe(-height / 2);
      
      const expectedZ = 0 + 10 * 1.2; // center.z + size.z * padding
      expect(camera.position.x).toBe(0);
      expect(camera.position.y).toBe(0);
      expect(camera.position.z).toBe(expectedZ);
      
      expect(camera.near).toBe(0.1);
      expect(camera.far).toBe(expectedZ + 10 * 1.2);
    });

    it('should handle non-uniform object sizes', () => {
      const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
      
      mockSize.set(20, 30, 15);
      fitCameraToObject(mockScene, camera);
      
      const width = 20 * 1.2;
      const height = 30 * 1.2;
      
      expect(camera.left).toBe(-width / 2);
      expect(camera.right).toBe(width / 2);
      expect(camera.top).toBe(height / 2);
      expect(camera.bottom).toBe(-height / 2);
    });

    it('should update projection matrix for orthographic camera', () => {
      const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
      const updateSpy = jest.spyOn(camera, 'updateProjectionMatrix');
      
      fitCameraToObject(mockScene, camera);
      
      expect(updateSpy).toHaveBeenCalled();
    });

    it('should make orthographic camera look at object center', () => {
      const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
      const lookAtSpy = jest.spyOn(camera, 'lookAt');
      
      mockCenter.set(1, 2, 3);
      fitCameraToObject(mockScene, camera);
      
      expect(lookAtSpy).toHaveBeenCalledWith(mockCenter);
    });
  });

  describe('PhysicalCamera', () => {
    it('should fit PhysicalCamera to object', () => {
      // Import the mocked module
      const { importRaytracer } = require('../importRaytracer');
      const { PhysicalCamera } = importRaytracer();
      const camera = new PhysicalCamera(75, 1, 0.1, 1000);
      
      fitCameraToObject(mockScene, camera);
      
      // Should be treated like PerspectiveCamera
      const maxDim = 10;
      const fov = (75 * Math.PI) / 180;
      const expectedZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * 1.2;
      
      expect(camera.position.z).toBeCloseTo(expectedZ);
    });
  });

  describe('Unsupported camera types', () => {
    it('should warn for unsupported camera types', () => {
      // Create a custom camera that's not supported
      const customCamera = new THREE.Camera();
      
      fitCameraToObject(mockScene, customCamera);
      
      expect(consoleWarnSpy).toHaveBeenCalledWith('Camera type not supported in fitCameraToObject');
    });

    it('should not modify unsupported camera', () => {
      const customCamera = new THREE.Camera();
      const initialPosition = customCamera.position.clone();
      
      fitCameraToObject(mockScene, customCamera);
      
      expect(customCamera.position).toEqual(initialPosition);
    });
  });

  describe('Edge cases', () => {
    it('should handle empty scene', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      mockSize.set(0, 0, 0);
      
      fitCameraToObject(mockScene, camera);
      
      // Should still position camera, even with zero size
      expect(camera.position.z).toBe(0);
    });

    it('should handle very small objects', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      mockSize.set(0.001, 0.001, 0.001);
      
      fitCameraToObject(mockScene, camera);
      
      const maxDim = 0.001;
      const fov = (75 * Math.PI) / 180;
      const expectedZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * 1.2;
      
      expect(camera.position.z).toBeCloseTo(expectedZ);
    });

    it('should handle very large objects', () => {
      const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 10000);
      mockSize.set(1000, 1000, 1000);
      
      fitCameraToObject(mockScene, camera);
      
      const maxDim = 1000;
      const fov = (75 * Math.PI) / 180;
      const expectedZ = Math.abs((maxDim / 2) / Math.tan(fov / 2)) * 1.2;
      
      expect(camera.position.z).toBeCloseTo(expectedZ);
    });
  });
});