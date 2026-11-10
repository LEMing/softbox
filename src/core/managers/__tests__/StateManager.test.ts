import { StateManager } from '../StateManager';
import { ViewerState } from '../../entities/ViewerState';
import { ThreeViewerError, ErrorCode } from '../../../errors';

describe('StateManager', () => {
  let stateManager: StateManager;

  beforeEach(() => {
    stateManager = new StateManager();
  });

  describe('initialization', () => {
    it('should start with default state', () => {
      expect(stateManager.getState()).toBeInstanceOf(ViewerState);
      expect(stateManager.isInitialized()).toBe(false);
      expect(stateManager.getStatus()).toBe('idle');
      expect(stateManager.getCurrentModel()).toBeNull();
    });
  });

  describe('state transitions', () => {
    it('should set initialized state', () => {
      stateManager.setInitialized();
      
      expect(stateManager.isInitialized()).toBe(true);
      expect(stateManager.getStatus()).toBe('idle');
    });

    it('should transition to loading state', () => {
      stateManager.startLoading();
      
      expect(stateManager.getStatus()).toBe('loading');
    });

    it('should set loaded state with model', () => {
      const mockModel = { 
        dispose: jest.fn(),
        traverse: jest.fn()
      };
      
      stateManager.setLoaded(mockModel as unknown as import('../../interfaces').IObject3D);
      
      expect(stateManager.getStatus()).toBe('loaded');
      expect(stateManager.getCurrentModel()).toBe(mockModel);
    });

    it('should set error state', () => {
      const error = new ThreeViewerError(
        'Test error',
        ErrorCode.INITIALIZATION_FAILED
      );
      
      stateManager.setError(error);
      
      expect(stateManager.getStatus()).toBe('error');
      expect(stateManager.getState().error).toBe(error);
    });

    it('should start rendering', () => {
      stateManager.startRendering();
      
      expect(stateManager.getStatus()).toBe('rendering');
    });

    it('should update render info', () => {
      const renderInfo = {
        frameCount: 100,
        fps: 60,
        lastRenderTime: 16.67
      };
      
      stateManager.updateRenderInfo(renderInfo);
      
      const state = stateManager.getState();
      expect(state.renderInfo.frameCount).toBe(100);
      expect(state.renderInfo.fps).toBe(60);
      expect(state.renderInfo.lastRenderTime).toBe(16.67);
    });

    it('should set disposed state', () => {
      const mockModel = { dispose: jest.fn(), traverse: jest.fn() };
      stateManager.setLoaded(mockModel as unknown as import('../../interfaces').IObject3D);
      stateManager.setDisposed();
      
      expect(stateManager.getStatus()).toBe('disposed');
      expect(stateManager.getCurrentModel()).toBeNull();
    });
  });

  describe('state validation', () => {
    it('should check if can load', () => {
      expect(stateManager.canLoad()).toBe(false);
      
      stateManager.setInitialized();
      expect(stateManager.canLoad()).toBe(true);
      
      stateManager.startLoading();
      expect(stateManager.canLoad()).toBe(false);
      
      stateManager.setLoaded({ dispose: jest.fn() } as unknown as import('../../interfaces').IObject3D);
      expect(stateManager.canLoad()).toBe(true);
      
      stateManager.setError(new ThreeViewerError('Test', ErrorCode.MODEL_LOAD_FAILED));
      expect(stateManager.canLoad()).toBe(true);
      
      stateManager.setDisposed();
      expect(stateManager.canLoad()).toBe(false);
    });
  });

  describe('state change callbacks', () => {
    it('should notify subscribers on state change', () => {
      const callback = jest.fn();
      stateManager.onStateChange(callback);
      
      stateManager.setInitialized();
      
      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith(expect.any(ViewerState));
      expect(callback.mock.calls[0][0].isInitialized).toBe(true);
    });

    it('should handle multiple subscribers', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      stateManager.onStateChange(callback1);
      stateManager.onStateChange(callback2);
      
      stateManager.startLoading();
      
      expect(callback1).toHaveBeenCalledTimes(1);
      expect(callback2).toHaveBeenCalledTimes(1);
    });

    it('should unsubscribe callbacks', () => {
      const callback = jest.fn();
      const unsubscribe = stateManager.onStateChange(callback);
      
      stateManager.setInitialized();
      expect(callback).toHaveBeenCalledTimes(1);
      
      unsubscribe();
      
      stateManager.startLoading();
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in callbacks gracefully', () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const errorCallback = jest.fn(() => {
        throw new Error('Callback error');
      });
      const normalCallback = jest.fn();
      
      stateManager.onStateChange(errorCallback);
      stateManager.onStateChange(normalCallback);
      
      expect(() => stateManager.setInitialized()).not.toThrow();
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('Error in state change callback:', expect.any(Error));
      
      consoleErrorSpy.mockRestore();
    });

    it('should clear all callbacks', () => {
      const callback1 = jest.fn();
      const callback2 = jest.fn();
      
      stateManager.onStateChange(callback1);
      stateManager.onStateChange(callback2);
      
      stateManager.clearCallbacks();
      stateManager.setInitialized();
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).not.toHaveBeenCalled();
    });
  });
});