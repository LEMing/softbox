import * as THREE from 'three';
import { ResourceManager } from '../ResourceManager';
import { disposeSceneContents } from '../../disposal';
import { IPathTracingService } from '../../services/IPathTracingService';
import { IEnvironmentService } from '../../services/IEnvironmentService';

jest.mock('../../disposal', () => ({
  disposeSceneContents: jest.fn(),
}));

const disposeContents = disposeSceneContents as jest.MockedFunction<typeof disposeSceneContents>;

describe('ResourceManager', () => {
  let resourceManager: ResourceManager;
  let mockScene: THREE.Scene;
  let mockPathTracingService: jest.Mocked<IPathTracingService>;
  let mockEnvironmentService: jest.Mocked<IEnvironmentService>;

  beforeEach(() => {
    mockScene = new THREE.Scene();

    mockPathTracingService = {
      dispose: jest.fn(),
      isEnabled: jest.fn(),
      initialize: jest.fn(),
      render: jest.fn(),
      reset: jest.fn(),
      events: { on: jest.fn(), emit: jest.fn() }
    } as unknown as jest.Mocked<IPathTracingService>;

    mockEnvironmentService = {
      dispose: jest.fn(),
      initialize: jest.fn(),
      loadEnvironmentMap: jest.fn(),
      applyToScene: jest.fn()
    } as unknown as jest.Mocked<IEnvironmentService>;

    resourceManager = new ResourceManager({
      scene: mockScene,
      pathTracingService: mockPathTracingService,
      environmentService: mockEnvironmentService
    });

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
    it('should dispose scene contents while keeping backgrounds restorable', () => {
      resourceManager.disposeSceneResources();

      expect(disposeContents).toHaveBeenCalledTimes(1);
      expect(disposeContents).toHaveBeenCalledWith(mockScene, { keepBackgrounds: true });
    });

    it('should NOT dispose the environment service (its textures back the kept background/reflections)', () => {
      resourceManager.disposeSceneResources();

      expect(mockEnvironmentService.dispose).not.toHaveBeenCalled();
    });

    it('should preserve the path tracing service (final image stays visible)', () => {
      resourceManager.disposeSceneResources(true);

      expect(mockPathTracingService.dispose).not.toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).not.toHaveBeenCalled();
      expect(disposeContents).toHaveBeenCalledWith(mockScene, { keepBackgrounds: true });
    });

    it('should not dispose path tracing even when preservePathTracing is false', () => {
      resourceManager.disposeSceneResources(false);

      expect(mockPathTracingService.dispose).not.toHaveBeenCalled();
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

      expect(mockPathTracingService.dispose).toHaveBeenCalled();
      expect(mockEnvironmentService.dispose).toHaveBeenCalled();

      expect(disposeContents).toHaveBeenCalledWith(mockScene);

      expect(gcMock).toHaveBeenCalled();

      delete globalWithGc.gc;
    });
  });
});
