import * as THREE from 'three';
import { ControlsManager } from '../ControlsManager';
import { SimpleViewerOptions, ControlType } from '../../../types';
import { ErrorCode } from '../../../errors';
import defaultOptions from '../../../defaultOptions';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { MapControls } from 'three/examples/jsm/controls/MapControls';

// Mock controls
const createMockControl = () => ({
  enabled: true,
  enableDamping: false,
  dampingFactor: 0.05,
  enableZoom: true,
  enableRotate: true,
  enablePan: true,
  update: jest.fn(),
  dispose: jest.fn(),
  addEventListener: jest.fn(),
});

jest.mock('three/examples/jsm/controls/OrbitControls');

jest.mock('three/examples/jsm/controls/MapControls');

describe('ControlsManager', () => {
  let manager: ControlsManager;
  let options: SimpleViewerOptions;
  let camera: THREE.Camera;
  let rendererDomElement: HTMLCanvasElement;

  beforeEach(() => {
    options = { ...defaultOptions };
    camera = new THREE.PerspectiveCamera();
    rendererDomElement = document.createElement('canvas');
    
    // Setup default mocks
    (OrbitControls as jest.Mock).mockImplementation(() => createMockControl());
    (MapControls as jest.Mock).mockImplementation(() => createMockControl());
    
    manager = new ControlsManager(camera, rendererDomElement, options);
    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('should successfully create OrbitControls by default', () => {
      const result = manager.setup();

      expect(result.ok).toBe(true);
      expect(OrbitControls).toHaveBeenCalledWith(camera, rendererDomElement);
      if (result.ok) {
        expect(result.value.update).toHaveBeenCalled();
        expect(manager.controls).toBe(result.value);
      }
    });

    it('should create MapControls when specified', () => {
      options.controls.type = ControlType.MapControls;
      manager = new ControlsManager(camera, rendererDomElement, options);

      const result = manager.setup();

      expect(result.ok).toBe(true);
      expect(MapControls).toHaveBeenCalledWith(camera, rendererDomElement);
      if (result.ok) {
        expect(result.value.update).toHaveBeenCalled();
      }
    });

    it('should apply control options', () => {
      options.controls = {
        ...options.controls,
        enabled: false,
        enableDamping: true,
        dampingFactor: 0.1,
        enableZoom: false,
        enableRotate: false,
        enablePan: false,
      };
      manager = new ControlsManager(camera, rendererDomElement, options);

      const result = manager.setup();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.enabled).toBe(false);
        expect(result.value.enableDamping).toBe(true);
        expect(result.value.dampingFactor).toBe(0.1);
        expect(result.value.enableZoom).toBe(false);
        expect(result.value.enableRotate).toBe(false);
        expect(result.value.enablePan).toBe(false);
      }
    });

    it('should return error when camera is null', () => {
      manager = new ControlsManager(null as any, rendererDomElement, options);

      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.CAMERA_INIT_FAILED);
        expect(result.error.message).toContain('Camera is not initialized');
      }
    });

    it('should return error when renderer DOM element is null', () => {
      manager = new ControlsManager(camera, null as any, options);

      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
        expect(result.error.message).toContain('Renderer DOM element is not available');
      }
    });

  });

  describe('dispose', () => {
    it('should dispose controls when initialized', () => {
      manager.setup();
      const controls = manager.controls;

      manager.dispose();

      expect(controls?.dispose).toHaveBeenCalled();
      expect(manager.controls).toBeNull();
    });

    it('should handle dispose when controls are null', () => {
      expect(() => manager.dispose()).not.toThrow();
    });
  });
});