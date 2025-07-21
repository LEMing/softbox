import { ScreenshotManager } from '../ScreenshotManager';
import { IRenderer, ICamera, IControls } from '../../interfaces';
import { SceneSerializer } from '../../utils/SceneSerializer';

// Mock SceneSerializer
jest.mock('../../utils/SceneSerializer', () => ({
  SceneSerializer: {
    serialize: jest.fn().mockReturnValue({
      cameraPosition: [0, 0, 5],
      cameraTarget: [0, 0, 0],
      modelUrl: 'test.glb'
    }),
    restore: jest.fn()
  }
}));

describe('ScreenshotManager', () => {
  let screenshotManager: ScreenshotManager;
  let mockRenderer: jest.Mocked<IRenderer>;
  let mockCanvas: HTMLCanvasElement;
  let mockParent: HTMLElement;
  let mockCamera: jest.Mocked<ICamera>;
  let mockControls: jest.Mocked<IControls>;
  let onRestore: jest.Mock;

  beforeEach(() => {
    // Create mock canvas
    mockCanvas = document.createElement('canvas');
    mockCanvas.toDataURL = jest.fn().mockReturnValue('data:image/png;base64,mockdata');
    
    // Create mock parent element
    mockParent = document.createElement('div');
    mockParent.appendChild(mockCanvas);
    document.body.appendChild(mockParent);
    
    // Mock renderer
    mockRenderer = {
      getDomElement: jest.fn().mockReturnValue(mockCanvas),
      render: jest.fn(),
      setSize: jest.fn(),
      initialize: jest.fn(),
      dispose: jest.fn()
    } as unknown as jest.Mocked<IRenderer>;
    
    // Mock camera and controls
    mockCamera = {
      type: 'perspective',
      updateProjectionMatrix: jest.fn()
    } as unknown as jest.Mocked<ICamera>;
    
    mockControls = {
      update: jest.fn(),
      dispose: jest.fn()
    } as unknown as jest.Mocked<IControls>;
    
    // Create callback
    onRestore = jest.fn();
    
    // Create screenshot manager
    screenshotManager = new ScreenshotManager({
      renderer: mockRenderer,
      onRestore
    });
  });

  afterEach(() => {
    document.body.removeChild(mockParent);
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should start inactive', () => {
      expect(screenshotManager.isActive()).toBe(false);
    });
  });

  describe('captureAndReplace', () => {
    it('should capture screenshot and replace canvas', () => {
      const onResourcesDisposed = jest.fn();
      
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        onResourcesDisposed
      );
      
      // Should capture canvas content
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
      
      // Should hide canvas
      expect(mockCanvas.style.display).toBe('none');
      
      // Should create image element
      const img = mockParent.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.src).toBe('data:image/png;base64,mockdata');
      expect(img?.style.position).toBe('absolute');
      expect(img?.style.width).toBe('100%');
      expect(img?.style.height).toBe('100%');
      
      // Should be active
      expect(screenshotManager.isActive()).toBe(true);
      
      // Should call resources disposed callback
      expect(onResourcesDisposed).toHaveBeenCalled();
      
      // Should serialize scene state
      expect(SceneSerializer.serialize).toHaveBeenCalledWith(
        'test.glb',
        mockCamera,
        mockControls,
        mockCanvas
      );
    });

    it('should not capture if already active', () => {
      const onResourcesDisposed = jest.fn();
      
      // First capture
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        onResourcesDisposed
      );
      
      // Reset mocks
      jest.clearAllMocks();
      
      // Second capture should do nothing
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test2.glb',
        onResourcesDisposed
      );
      
      expect(mockCanvas.toDataURL).not.toHaveBeenCalled();
      expect(onResourcesDisposed).not.toHaveBeenCalled();
    });

    it('should handle missing parent element', () => {
      // Remove canvas from parent
      mockParent.removeChild(mockCanvas);
      const orphanCanvas = document.createElement('canvas');
      orphanCanvas.toDataURL = jest.fn().mockReturnValue('data:image/png;base64,test');
      
      mockRenderer.getDomElement.mockReturnValue(orphanCanvas);
      
      const onResourcesDisposed = jest.fn();
      
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        onResourcesDisposed
      );
      
      // Should not create screenshot
      expect(screenshotManager.isActive()).toBe(false);
      expect(onResourcesDisposed).not.toHaveBeenCalled();
    });

    it('should add event listeners for restoration', () => {
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        jest.fn()
      );
      
      const img = mockParent.querySelector('img') as HTMLImageElement;
      
      // Simulate mousedown
      const mouseEvent = new MouseEvent('mousedown');
      img.dispatchEvent(mouseEvent);
      
      // Should trigger restore
      expect(onRestore).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    beforeEach(() => {
      // Capture first
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        jest.fn()
      );
    });

    it('should restore canvas from screenshot', async () => {
      await screenshotManager.restore();
      
      // Should show canvas again
      expect(mockCanvas.style.display).toBe('');
      
      // Should remove image
      const img = mockParent.querySelector('img');
      expect(img).toBeNull();
      
      // Should not be active
      expect(screenshotManager.isActive()).toBe(false);
      
      // Should call restore callback
      expect(onRestore).toHaveBeenCalled();
    });

    it('should not restore if not active', async () => {
      // First restore
      await screenshotManager.restore();
      jest.clearAllMocks();
      
      // Second restore should do nothing
      await screenshotManager.restore();
      
      expect(onRestore).not.toHaveBeenCalled();
    });

    it('should remove resize handler', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      
      await screenshotManager.restore();
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });
  });

  describe('getSerializedState', () => {
    it('should return serialized state after capture', () => {
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        jest.fn()
      );
      
      const state = screenshotManager.getSerializedState();
      expect(state).toEqual({
        cameraPosition: [0, 0, 5],
        cameraTarget: [0, 0, 0],
        modelUrl: 'test.glb'
      });
    });

    it('should return undefined before capture', () => {
      expect(screenshotManager.getSerializedState()).toBeUndefined();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', () => {
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        jest.fn()
      );
      
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
      
      screenshotManager.dispose();
      
      // Should remove resize handler
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      
      // Should remove image
      const img = mockParent.querySelector('img');
      expect(img).toBeNull();
      
      // Should not be active
      expect(screenshotManager.isActive()).toBe(false);
      
      // Should clear serialized state
      expect(screenshotManager.getSerializedState()).toBeUndefined();
    });

    it('should handle dispose when not active', () => {
      expect(() => screenshotManager.dispose()).not.toThrow();
    });
  });

  describe('window resize handling', () => {
    it('should restore on window resize', () => {
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        jest.fn()
      );
      
      // Trigger resize event
      window.dispatchEvent(new Event('resize'));
      
      // Should trigger restore
      expect(onRestore).toHaveBeenCalled();
    });
  });
});