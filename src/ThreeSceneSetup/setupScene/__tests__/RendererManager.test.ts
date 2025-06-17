import { RendererManager } from '../RendererManager';
import { SimpleViewerOptions } from '../../../types';
import { ErrorCode } from '../../../errors';
import defaultOptions from '../../../defaultOptions';

// Mock the entire RendererManager implementation to avoid WebGL issues in test
const mockRenderer = {
  domElement: document.createElement('canvas'),
  dispose: jest.fn(),
  setPixelRatio: jest.fn(),
  shadowMap: { enabled: false, type: 2 },
  toneMapping: 4,
  toneMappingExposure: 1,
};

// Mock initializeRenderer
jest.mock('../initializeRenderer', () => ({
  initializeRenderer: jest.fn(() => mockRenderer)
}));

describe('RendererManager', () => {
  let manager: RendererManager;
  let options: SimpleViewerOptions;

  beforeEach(() => {
    options = { ...defaultOptions };
    manager = new RendererManager(options);
    jest.clearAllMocks();
  });

  describe('setup', () => {
    it('should successfully initialize renderer with WebGL support', () => {
      // Mock WebGL support
      jest.spyOn(manager as any, 'isWebGLSupported').mockReturnValue(true);

      const result = manager.setup();

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toBe(mockRenderer);
        expect(manager.renderer).toBe(mockRenderer);
      }
    });

    it('should return error when WebGL is not supported', () => {
      // Mock no WebGL support
      jest.spyOn(manager as any, 'isWebGLSupported').mockReturnValue(false);

      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.WEBGL_NOT_SUPPORTED);
        expect(result.error.message).toContain('WebGL is not supported');
      }
    });

    it('should handle initialization errors', () => {
      // Mock WebGL support
      jest.spyOn(manager as any, 'isWebGLSupported').mockReturnValue(true);
      
      // Mock initializeRenderer to throw
      const { initializeRenderer } = require('../initializeRenderer');
      initializeRenderer.mockImplementationOnce(() => {
        throw new Error('Renderer initialization failed');
      });

      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
      }
    });

    it('should return error when renderer is null', () => {
      // Mock WebGL support
      jest.spyOn(manager as any, 'isWebGLSupported').mockReturnValue(true);
      
      // Mock initializeRenderer to return null
      const { initializeRenderer } = require('../initializeRenderer');
      initializeRenderer.mockImplementationOnce(() => null);

      const result = manager.setup();

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.RENDERER_INIT_FAILED);
        expect(result.error.message).toContain('Failed to initialize renderer');
      }
    });
  });

  describe('dispose', () => {
    it('should dispose renderer when initialized', () => {
      jest.spyOn(manager as any, 'isWebGLSupported').mockReturnValue(true);
      manager.setup();

      manager.dispose();

      expect(mockRenderer.dispose).toHaveBeenCalled();
      expect(manager.renderer).toBeNull();
    });

    it('should handle dispose when renderer is null', () => {
      expect(() => manager.dispose()).not.toThrow();
    });
  });

  describe('isWebGLSupported', () => {
    it('should detect WebGL support correctly', () => {
      // Save original values
      const originalCreateElement = document.createElement;
      const originalWebGLRenderingContext = (window as any).WebGLRenderingContext;
      
      // Ensure WebGLRenderingContext exists
      (window as any).WebGLRenderingContext = {};
      
      // Test with WebGL support
      document.createElement = jest.fn((tagName: string) => {
        if (tagName === 'canvas') {
          const canvas = {} as any;
          canvas.getContext = (type: string) => {
            if (type === 'webgl' || type === 'experimental-webgl') {
              return {};
            }
            return null;
          };
          return canvas;
        }
        return originalCreateElement.call(document, tagName);
      }) as any;
      
      const managerWebGL = new RendererManager(options);
      expect((managerWebGL as any).isWebGLSupported()).toBe(true);
      
      // Test without WebGL support
      document.createElement = jest.fn((tagName: string) => {
        if (tagName === 'canvas') {
          const canvas = {} as any;
          canvas.getContext = () => null;
          return canvas;
        }
        return originalCreateElement.call(document, tagName);
      }) as any;
      
      const managerNoWebGL = new RendererManager(options);
      expect((managerNoWebGL as any).isWebGLSupported()).toBe(false);
      
      // Test without WebGLRenderingContext
      (window as any).WebGLRenderingContext = undefined;
      const managerNoWebGLContext = new RendererManager(options);
      expect((managerNoWebGLContext as any).isWebGLSupported()).toBe(false);
      
      // Restore
      document.createElement = originalCreateElement;
      (window as any).WebGLRenderingContext = originalWebGLRenderingContext;
    });

    it('should handle canvas creation errors gracefully', () => {
      const originalCreateElement = document.createElement;
      document.createElement = jest.fn(() => {
        throw new Error('Canvas creation failed');
      });

      const testManager = new RendererManager(options);
      expect((testManager as any).isWebGLSupported()).toBe(false);

      document.createElement = originalCreateElement;
    });
  });
});