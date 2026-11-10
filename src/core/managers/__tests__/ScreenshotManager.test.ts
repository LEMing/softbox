import { ScreenshotManager } from '../ScreenshotManager';
import { IRenderer, ICamera, IControls } from '../../interfaces';
import { SceneSerializer } from '../../utils/SceneSerializer';

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
    mockCanvas = document.createElement('canvas');
    mockCanvas.toDataURL = jest.fn().mockReturnValue('data:image/png;base64,mockdata');
    
    mockParent = document.createElement('div');
    mockParent.appendChild(mockCanvas);
    document.body.appendChild(mockParent);
    
    mockRenderer = {
      getDomElement: jest.fn().mockReturnValue(mockCanvas),
      render: jest.fn(),
      setSize: jest.fn(),
      initialize: jest.fn(),
      dispose: jest.fn()
    } as unknown as jest.Mocked<IRenderer>;
    
    mockCamera = {
      type: 'perspective',
      updateProjectionMatrix: jest.fn()
    } as unknown as jest.Mocked<ICamera>;
    
    mockControls = {
      update: jest.fn(),
      dispose: jest.fn()
    } as unknown as jest.Mocked<IControls>;
    
    onRestore = jest.fn();
    
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
      
      expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/png');
      
      expect(mockCanvas.style.display).toBe('none');
      
      const img = mockParent.querySelector('img');
      expect(img).toBeTruthy();
      expect(img?.src).toBe('data:image/png;base64,mockdata');
      expect(img?.style.position).toBe('absolute');
      expect(img?.style.width).toBe('100%');
      expect(img?.style.height).toBe('100%');
      
      expect(screenshotManager.isActive()).toBe(true);
      
      expect(onResourcesDisposed).toHaveBeenCalled();
      
      expect(SceneSerializer.serialize).toHaveBeenCalledWith(
        'test.glb',
        mockCamera,
        mockControls,
        mockCanvas
      );
    });

    it('should not capture if already active', () => {
      const onResourcesDisposed = jest.fn();
      
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        onResourcesDisposed
      );
      
      jest.clearAllMocks();
      
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
      
      expect(screenshotManager.isActive()).toBe(false);
      expect(onResourcesDisposed).not.toHaveBeenCalled();
    });

    it('keeps the live scene when the drawing buffer serializes empty', () => {
      mockCanvas.toDataURL = jest.fn().mockReturnValue('data:,');
      const onResourcesDisposed = jest.fn();
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        onResourcesDisposed
      );

      expect(screenshotManager.isActive()).toBe(false);
      expect(mockCanvas.style.display).not.toBe('none');
      expect(onResourcesDisposed).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('captures without an onResourcesDisposed callback', () => {
      screenshotManager.captureAndReplace(mockCamera, mockControls, 'test.glb');

      expect(screenshotManager.isActive()).toBe(true);
    });

    it('should add event listeners for restoration', () => {
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        jest.fn()
      );
      
      const img = mockParent.querySelector('img') as HTMLImageElement;
      
      const mouseEvent = new MouseEvent('mousedown');
      img.dispatchEvent(mouseEvent);
      
      expect(onRestore).toHaveBeenCalled();
    });
  });

  describe('restore', () => {
    beforeEach(() => {
      screenshotManager.captureAndReplace(
        mockCamera,
        mockControls,
        'test.glb',
        jest.fn()
      );
    });

    it('should restore canvas from screenshot', async () => {
      await screenshotManager.restore();
      
      expect(mockCanvas.style.display).toBe('');
      
      const img = mockParent.querySelector('img');
      expect(img).toBeNull();
      
      expect(screenshotManager.isActive()).toBe(false);
      
      expect(onRestore).toHaveBeenCalled();
    });

    it('should not restore if not active', async () => {
      await screenshotManager.restore();
      jest.clearAllMocks();
      
      await screenshotManager.restore();
      
      expect(onRestore).not.toHaveBeenCalled();
    });

    it('should remove resize handler', async () => {
      const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');

      await screenshotManager.restore();

      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    });

    it('does nothing when the screenshot element was detached externally', async () => {
      const img = mockParent.querySelector('img') as HTMLImageElement;
      mockParent.removeChild(img);

      await screenshotManager.restore();

      expect(screenshotManager.isActive()).toBe(true);
      expect(onRestore).not.toHaveBeenCalled();
    });

    it('completes without an onRestore callback', async () => {
      const manager = new ScreenshotManager({ renderer: mockRenderer });
      manager.captureAndReplace(mockCamera, mockControls, 'test.glb');

      await manager.restore();

      expect(manager.isActive()).toBe(false);
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
      
      expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
      
      const img = mockParent.querySelector('img');
      expect(img).toBeNull();
      
      expect(screenshotManager.isActive()).toBe(false);
      
      expect(screenshotManager.getSerializedState()).toBeUndefined();
    });

    it('should handle dispose when not active', () => {
      expect(() => screenshotManager.dispose()).not.toThrow();
    });

    it('unhides the canvas so a successor viewer on the same element is visible', () => {
      screenshotManager.captureAndReplace(mockCamera, mockControls, 'test.glb', jest.fn());
      expect(mockCanvas.style.display).toBe('none');

      screenshotManager.dispose();

      expect(mockCanvas.style.display).toBe('');
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
      
      window.dispatchEvent(new Event('resize'));

      expect(onRestore).toHaveBeenCalled();
    });

    it('ignores a stale resize handler invoked after restore', async () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      screenshotManager.captureAndReplace(mockCamera, mockControls, 'test.glb', jest.fn());
      const resizeCall = addEventListenerSpy.mock.calls.find(([type]) => type === 'resize');
      const staleHandler = resizeCall?.[1] as () => void;

      await screenshotManager.restore();
      jest.clearAllMocks();

      staleHandler();

      expect(onRestore).not.toHaveBeenCalled();
    });
  });
});