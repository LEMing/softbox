import * as THREE from 'three';
import { CameraManager } from '../CameraManager';
import { ErrorCode } from '../../../errors';
import defaultOptions from '../../../defaultOptions';

// Mock the importRaytracer module
jest.mock('../../importRaytracer', () => ({
  importRaytracer: () => ({
    PhysicalCamera: class extends THREE.PerspectiveCamera {
      fStop: number = 1.4;
    },
  }),
}));

// Mock initializeCamera
jest.mock('../initializeCamera', () => ({
  initializeCamera: jest.fn(),
}));

describe('CameraManager', () => {
  let mountRef: { current: HTMLDivElement | null };
  let manager: CameraManager;
  
  beforeEach(() => {
    // Create a mock mount ref with proper dimensions
    const mockDiv = document.createElement('div');
    Object.defineProperty(mockDiv, 'clientWidth', { value: 800, configurable: true });
    Object.defineProperty(mockDiv, 'clientHeight', { value: 600, configurable: true });
    
    mountRef = { current: mockDiv };
  });
  
  describe('constructor', () => {
    it('should successfully create a perspective camera', () => {
      manager = new CameraManager(mountRef as React.RefObject<HTMLDivElement>, defaultOptions);
      
      expect(manager.camera).toBeInstanceOf(THREE.PerspectiveCamera);
      expect(manager.camera).toBeDefined();
    });
    
    it('should throw error when mount ref is null', () => {
      mountRef.current = null;
      
      expect(() => {
        new CameraManager(mountRef as React.RefObject<HTMLDivElement>, defaultOptions);
      }).toThrow('Cannot create camera: Mount element is not ready');
    });
    
    it('should throw error for invalid dimensions', () => {
      Object.defineProperty(mountRef.current, 'clientWidth', { value: 0 });
      
      expect(() => {
        new CameraManager(mountRef as React.RefObject<HTMLDivElement>, defaultOptions);
      }).toThrow('Invalid mount dimensions');
    });
    
    it('should create PhysicalCamera when path tracing is enabled', () => {
      const pathTracingOptions = {
        ...defaultOptions,
        usePathTracing: true,
      };
      
      manager = new CameraManager(mountRef as React.RefObject<HTMLDivElement>, pathTracingOptions);
      
      expect(manager.camera).toBeInstanceOf(THREE.PerspectiveCamera);
      expect((manager.camera as any).fStop).toBe(1.4);
    });
  });
  
  describe('error handling', () => {
    it('should handle errors in initializeCamera', () => {
      const { initializeCamera } = require('../initializeCamera');
      initializeCamera.mockImplementationOnce(() => {
        throw new Error('Camera initialization failed');
      });
      
      expect(() => {
        new CameraManager(mountRef as React.RefObject<HTMLDivElement>, defaultOptions);
      }).toThrow('Camera initialization failed');
    });
  });
});