import { ResourceManager } from '../ResourceManager';
import { IScene } from '../../interfaces';
import { IPathTracingService } from '../../services/IPathTracingService';
import { IEnvironmentService } from '../../services/IEnvironmentService';
import { MemoryMonitor } from '../../utils/MemoryMonitor';

// Mock MemoryMonitor
jest.mock('../../utils/MemoryMonitor', () => ({
  MemoryMonitor: {
    logMemoryUsage: jest.fn()
  }
}));

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockScene: jest.Mocked<IScene>;
  let mockPathTracingService: jest.Mocked<IPathTracingService>;
  let mockEnvironmentService: jest.Mocked<IEnvironmentService>;

  beforeEach(() => {
    // Mock scene
    mockScene = {
      traverse: jest.fn(),
      clear: jest.fn(),
      disposeContents: jest.fn(),
      add: jest.fn(),
      remove: jest.fn()
    } as unknown as jest.Mocked<IScene>;

    // Mock path tracing service
    mockPathTracingService = {
      dispose: jest.fn(),
      isEnabled: jest.fn(),
      initialize: jest.fn(),
      render: jest.fn(),
      reset: jest.fn(),
      events: { on: jest.fn(), emit: jest.fn() }
    } as unknown as jest.Mocked<IPathTracingService>;

    // Mock environment service
    mockEnvironmentService = {
      dispose: jest.fn(),
      initialize: jest.fn(),
      loadEnvironmentMap: jest.fn(),
      applyToScene: jest.fn()
    } as unknown as jest.Mocked<IEnvironmentService>;

    // Create resource manager
    resourceManager = new ResourceManager({
      scene: mockScene,
      pathTracingService: mockPathTracingService,
      environmentService: mockEnvironmentService
    });

    // Clear mock calls
    jest.clearAllMocks();
  });

  describe('updateServices', () => {
    it('should update path tracing service', () => {
      const newPathTracingService = {
        dispose: jest.fn()
      } as unknown as jest.Mocked<IPathTracingService>;

      resourceManager.updateServices({
        pathTracingService: newPathTracingService
      });

      // Dispose should use the new service
      resourceManager.disposeServices();
      expect(newPathTracingService.dispose).toHaveBeenCalled();
      expect(mockPathTracingService.dispose).not.toHaveBeenCalled();
    });

    it('should update environment service', () => {
      const newEnvironmentService = {
        dispose: jest.fn()
      } as unknown as jest.Mocked<IEnvironmentService>;

      resourceManager.updateServices({
        environmentService: newEnvironmentService
      });

      // Dispose should use the new service
      resourceManager.disposeServices();
      expect(newEnvironmentService.dispose).toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).not.toHaveBeenCalled();
    });

    it('should update both services', () => {
      const newPathTracingService = { dispose: jest.fn() } as unknown as jest.Mocked<IPathTracingService>;
      const newEnvironmentService = { dispose: jest.fn() } as unknown as jest.Mocked<IEnvironmentService>;

      resourceManager.updateServices({
        pathTracingService: newPathTracingService,
        environmentService: newEnvironmentService
      });

      resourceManager.disposeServices();

      expect(newPathTracingService.dispose).toHaveBeenCalled();
      expect(newEnvironmentService.dispose).toHaveBeenCalled();
      expect(mockPathTracingService.dispose).not.toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).not.toHaveBeenCalled();
    });
  });

  describe('disposeSceneResources', () => {
    it('should dispose scene contents and the environment service', () => {
      resourceManager.disposeSceneResources();

      // Should delegate GPU disposal to the scene (geometry/material/textures)
      expect(mockScene.disposeContents).toHaveBeenCalledTimes(1);

      // Should dispose environment service
      expect(mockEnvironmentService.dispose).toHaveBeenCalled();

      // Should log memory usage
      expect(MemoryMonitor.logMemoryUsage).toHaveBeenCalledWith('Before scene disposal');
      expect(MemoryMonitor.logMemoryUsage).toHaveBeenCalledWith('After scene disposal');
    });

    it('should preserve the path tracing service (final image stays visible)', () => {
      resourceManager.disposeSceneResources(true);

      expect(mockPathTracingService.dispose).not.toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).toHaveBeenCalled();
      expect(mockScene.disposeContents).toHaveBeenCalled();
    });

    it('should not dispose path tracing even when preservePathTracing is false', () => {
      resourceManager.disposeSceneResources(false);

      // The final rendered image is intentionally kept on screen.
      expect(mockPathTracingService.dispose).not.toHaveBeenCalled();
    });

    it('should schedule memory check after delay', () => {
      jest.useFakeTimers();

      resourceManager.disposeSceneResources();

      // Fast forward time
      jest.advanceTimersByTime(2000);

      expect(MemoryMonitor.logMemoryUsage).toHaveBeenCalledWith('After GC delay');

      jest.useRealTimers();
    });

    it('should attempt garbage collection if available', () => {
      const gcMock = jest.fn();
      const globalWithGc = globalThis as typeof globalThis & { gc?: () => void };
      globalWithGc.gc = gcMock;

      resourceManager.disposeSceneResources();

      expect(gcMock).toHaveBeenCalled();

      delete globalWithGc.gc;
    });

    it('should handle missing gc gracefully', () => {
      const globalWithGc = globalThis as typeof globalThis & { gc?: () => void };
      delete globalWithGc.gc;

      expect(() => resourceManager.disposeSceneResources()).not.toThrow();
    });
  });

  describe('disposeServices', () => {
    it('should dispose all services', () => {
      resourceManager.disposeServices();

      expect(mockPathTracingService.dispose).toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).toHaveBeenCalled();
    });

    it('should clear service references', () => {
      resourceManager.disposeServices();

      // Second call should not throw or call dispose again
      jest.clearAllMocks();
      resourceManager.disposeServices();

      expect(mockPathTracingService.dispose).not.toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).not.toHaveBeenCalled();
    });

    it('should handle missing services', () => {
      resourceManager = new ResourceManager({
        scene: mockScene
      });

      expect(() => resourceManager.disposeServices()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose everything', () => {
      const gcMock = jest.fn();
      const globalWithGc = globalThis as typeof globalThis & { gc?: () => void };
      globalWithGc.gc = gcMock;

      resourceManager.dispose();

      // Should dispose services
      expect(mockPathTracingService.dispose).toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).toHaveBeenCalled();

      // Should dispose scene GPU resources
      expect(mockScene.disposeContents).toHaveBeenCalled();

      // Should trigger GC
      expect(gcMock).toHaveBeenCalled();

      delete globalWithGc.gc;
    });
  });
});
