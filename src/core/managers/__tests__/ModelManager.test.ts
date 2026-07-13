import { ModelManager } from '../ModelManager';
import {
  IModelLoader,
  IObject3D,
  IScene,
  ICamera,
  IControls,
  Result,
  MODEL_VARIANT_NAMES_KEY,
} from '../../interfaces';
import { IFloorAlignmentService } from '../../services/IFloorAlignmentService';
import { ISceneSetupService } from '../../services/ISceneSetupService';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ViewerEventMap } from '../../events/CoreViewerEvents';

describe('ModelManager', () => {
  let modelManager: ModelManager;
  let mockModelLoader: jest.Mocked<IModelLoader>;
  let mockScene: jest.Mocked<IScene>;
  let mockCamera: jest.Mocked<ICamera>;
  let mockControls: jest.Mocked<IControls>;
  let mockFloorAlignmentService: jest.Mocked<IFloorAlignmentService>;
  let mockSceneSetupService: jest.Mocked<ISceneSetupService>;
  let mockEvents: TypedEventEmitter<ViewerEventMap>;

  beforeEach(() => {
    // Mock model loader
    mockModelLoader = {
      load: jest.fn()
    } as unknown as jest.Mocked<IModelLoader>;

    // Mock scene
    mockScene = {
      add: jest.fn().mockReturnValue(Result.ok(undefined)),
      remove: jest.fn().mockReturnValue(Result.ok(undefined)),
      clear: jest.fn(),
      traverse: jest.fn()
    } as unknown as jest.Mocked<IScene>;

    // Mock camera and controls
    mockCamera = {
      type: 'perspective',
      updateProjectionMatrix: jest.fn()
    } as unknown as jest.Mocked<ICamera>;

    mockControls = {
      update: jest.fn(),
      dispose: jest.fn()
    } as unknown as jest.Mocked<IControls>;

    // Mock services
    mockFloorAlignmentService = {
      alignToFloor: jest.fn().mockReturnValue(Result.ok(undefined))
    } as unknown as jest.Mocked<IFloorAlignmentService>;

    mockSceneSetupService = {
      addDynamicGrid: jest.fn().mockReturnValue(Result.ok(undefined)),
      snapObjectToFloor: jest.fn().mockReturnValue(Result.ok(undefined)),
      fitShadowCameraToObject: jest.fn().mockReturnValue(Result.ok(undefined)),
      bakeContactShadow: jest.fn().mockReturnValue(Result.ok(undefined)),
      resetContactShadow: jest.fn().mockReturnValue(Result.ok(undefined)),
      setContactShadowMode: jest.fn().mockReturnValue(Result.ok(undefined)),
      fitCameraToObject: jest.fn().mockReturnValue(Result.ok(undefined)),
      wrapInUnitsScaleGroup: jest.fn()
    } as unknown as jest.Mocked<ISceneSetupService>;

    // Create event emitter
    mockEvents = new TypedEventEmitter<ViewerEventMap>();

    // Create model manager
    modelManager = new ModelManager({
      modelLoader: mockModelLoader,
      scene: mockScene,
      camera: mockCamera,
      controls: mockControls,
      floorAlignmentService: mockFloorAlignmentService,
      sceneSetupService: mockSceneSetupService,
      autoFitToObject: true
    });
  });

  describe('initialization', () => {
    it('should start with no model', () => {
      expect(modelManager.getCurrentModel()).toBeNull();
      expect(modelManager.getLastModelUrl()).toBeUndefined();
    });
  });

  describe('loadModel', () => {
    describe('loading from URL', () => {
      let mockModel: IObject3D;
      
      beforeEach(() => {
        mockModel = {
          traverse: jest.fn((callback: (obj: unknown) => void) => {
            // Simulate traversing children
            const child = { castShadow: false, receiveShadow: false };
            callback(child);
          }),
          dispose: jest.fn()
        } as unknown as IObject3D;
      });

      beforeEach(() => {
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          animations: []
        }));
      });

      it('should load model from URL successfully', async () => {
        const url = 'https://example.com/model.glb';
        const result = await modelManager.loadModel(url, mockEvents);

        expect(result.ok).toBe(true);
        expect(mockModelLoader.load).toHaveBeenCalledWith(url, expect.any(Function));
        expect(mockScene.add).toHaveBeenCalledWith(mockModel);
        expect(modelManager.getCurrentModel()).toBe(mockModel);
        expect(modelManager.getLastModelUrl()).toBe(url);
      });

      it('surfaces variant names from the namespaced userData key, as a defensive copy', async () => {
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          animations: [],
          userData: { [MODEL_VARIANT_NAMES_KEY]: ['beach', 'midnight'] },
        }));

        await modelManager.loadModel('test.glb', mockEvents);

        const names = modelManager.getVariantNames();
        expect(names).toEqual(['beach', 'midnight']);
        // Mutating the returned array must not defeat name validation.
        names.push('forged');
        expect(modelManager.getVariantNames()).toEqual(['beach', 'midnight']);
      });

      it('ignores an authored `variants` root extra (no KHR extension)', async () => {
        // GLTFLoader copies root extras verbatim into gltf.userData — app
        // metadata must not masquerade as colorways and grow a dead picker.
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          animations: [],
          userData: { variants: ['summer', 'winter'] },
        }));

        await modelManager.loadModel('test.glb', mockEvents);

        expect(modelManager.getVariantNames()).toEqual([]);
      });

      it('clears the previous model variants when an object source loads', async () => {
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          animations: [],
          userData: { [MODEL_VARIANT_NAMES_KEY]: ['beach'] },
        }));
        await modelManager.loadModel('test.glb', mockEvents);
        expect(modelManager.getVariantNames()).toEqual(['beach']);

        await modelManager.loadModel(mockModel, mockEvents);
        expect(modelManager.getVariantNames()).toEqual([]);
      });

      it('emits model:progress as the loader reports download progress', async () => {
        mockModelLoader.load.mockImplementation(async (_url, onProgress) => {
          onProgress?.(50, 200);
          onProgress?.(200, 200);
          return Result.ok({ scene: mockModel, animations: [] });
        });
        const progressEvents: Array<{ url: string; loaded: number; total: number }> = [];
        mockEvents.on('model:progress', (data) => progressEvents.push(data));

        await modelManager.loadModel('test.glb', mockEvents);

        expect(progressEvents).toEqual([
          { url: 'test.glb', loaded: 50, total: 200 },
          { url: 'test.glb', loaded: 200, total: 200 },
        ]);
      });

      it('should align model to floor', async () => {
        await modelManager.loadModel('test.glb', mockEvents);

        expect(mockFloorAlignmentService.alignToFloor).toHaveBeenCalledWith(mockModel);
      });

      it('should snap the model to the floor by default (floorAlignment enabled)', async () => {
        await modelManager.loadModel('test.glb', mockEvents);

        expect(mockSceneSetupService.snapObjectToFloor).toHaveBeenCalledWith(mockScene, mockModel);
      });

      it('should not align or snap to floor when floorAlignment is false', async () => {
        modelManager = new ModelManager({
          modelLoader: mockModelLoader,
          scene: mockScene,
          camera: mockCamera,
          controls: mockControls,
          floorAlignmentService: mockFloorAlignmentService,
          sceneSetupService: mockSceneSetupService,
          floorAlignment: false
        });

        await modelManager.loadModel('test.glb', mockEvents);

        expect(mockFloorAlignmentService.alignToFloor).not.toHaveBeenCalled();
        expect(mockSceneSetupService.snapObjectToFloor).not.toHaveBeenCalled();
      });

      it('should enable shadows on model', async () => {
        const child = { castShadow: false, receiveShadow: false };
        (mockModel.traverse as jest.Mock).mockImplementation((callback: (obj: unknown) => void) => {
          callback(child);
        });

        await modelManager.loadModel('test.glb', mockEvents);

        expect(child.castShadow).toBe(true);
        expect(child.receiveShadow).toBe(true);
      });

      it('should add dynamic grid', async () => {
        await modelManager.loadModel('test.glb', mockEvents);

        expect(mockSceneSetupService.addDynamicGrid).toHaveBeenCalledWith(
          mockScene,
          mockModel,
          2
        );
      });

      it('fits the shadow camera during the load, but never bakes (the viewer defers the bake)', async () => {
        await modelManager.loadModel('test.glb', mockEvents);

        // The fit is cheap and the live realtime shadow needs it immediately.
        expect(mockSceneSetupService.fitShadowCameraToObject).toHaveBeenCalledWith(
          mockScene,
          mockModel
        );
        // The bake is a synchronous multi-pass render that would hold the
        // loading overlay (and the first paint) hostage on a weak GPU —
        // ViewerCore schedules it past the first painted frame instead.
        expect(mockSceneSetupService.bakeContactShadow).not.toHaveBeenCalled();
      });

      it('evicts the previous model\'s stale baked disc during the load', async () => {
        await modelManager.loadModel('test.glb', mockEvents);

        // The new model's bake is deferred; without this the OLD model's baked
        // shadow (wrong shape/size/position) would show for the whole window.
        expect(mockSceneSetupService.resetContactShadow).toHaveBeenCalledWith(mockScene);
      });

      it('should fit camera to object when autoFit is true', async () => {
        await modelManager.loadModel('test.glb', mockEvents);

        expect(mockSceneSetupService.fitCameraToObject).toHaveBeenCalledWith(
          mockModel,
          mockCamera,
          mockControls
        );
      });

      it('should not fit camera when autoFit is false', async () => {
        modelManager = new ModelManager({
          modelLoader: mockModelLoader,
          scene: mockScene,
          camera: mockCamera,
          controls: mockControls,
          autoFitToObject: false
        });

        await modelManager.loadModel('test.glb', mockEvents);

        expect(mockSceneSetupService?.fitCameraToObject).not.toHaveBeenCalled();
      });

      it('should emit model:loaded event', async () => {
        const loadedHandler = jest.fn();
        mockEvents.on('model:loaded', loadedHandler);

        await modelManager.loadModel('test.glb', mockEvents);

        expect(loadedHandler).toHaveBeenCalledWith({
          model: mockModel,
          loadTime: expect.any(Number)
        });
      });

      it('should emit model:loading with the url before model:loaded', async () => {
        const order: string[] = [];
        const loadingHandler = jest.fn(() => order.push('loading'));
        mockEvents.on('model:loading', loadingHandler);
        mockEvents.on('model:loaded', () => order.push('loaded'));

        await modelManager.loadModel('test.glb', mockEvents);

        expect(loadingHandler).toHaveBeenCalledWith({ url: 'test.glb' });
        expect(order).toEqual(['loading', 'loaded']);
      });

      it('should dispose previous model', async () => {
        // Load first model
        await modelManager.loadModel('model1.glb', mockEvents);
        const firstModel = modelManager.getCurrentModel();

        // Load second model
        await modelManager.loadModel('model2.glb', mockEvents);

        expect(mockScene.remove).toHaveBeenCalledWith(firstModel);
        expect(firstModel?.dispose).toHaveBeenCalled();
      });
    });

    describe('loading from object', () => {
      let mockObject: IObject3D;
      
      beforeEach(() => {
        mockObject = {
          traverse: jest.fn(),
          dispose: jest.fn()
        } as unknown as IObject3D;
      });

      it('should accept IObject3D directly', async () => {
        const result = await modelManager.loadModel(mockObject, mockEvents);

        expect(result.ok).toBe(true);
        expect(mockModelLoader.load).not.toHaveBeenCalled();
        expect(mockScene.add).toHaveBeenCalledWith(mockObject);
        expect(modelManager.getCurrentModel()).toBe(mockObject);
      });

      it('should not store URL when loading object', async () => {
        await modelManager.loadModel(mockObject, mockEvents);
        
        expect(modelManager.getLastModelUrl()).toBeUndefined();
      });
    });

    describe('error handling', () => {
      it('should handle loader errors', async () => {
        const loaderError = new ThreeViewerError(
          'Failed to load',
          ErrorCode.MODEL_LOAD_FAILED
        );
        mockModelLoader.load.mockResolvedValue(Result.err(loaderError));

        const errorHandler = jest.fn();
        mockEvents.on('model:error', errorHandler);

        const result = await modelManager.loadModel('error.glb', mockEvents);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error).toBe(loaderError);
        }
        expect(errorHandler).toHaveBeenCalledWith({
          error: loaderError,
          url: 'error.glb'
        });
      });

      it('should handle scene add errors', async () => {
        const mockModel = { traverse: jest.fn(), dispose: jest.fn() } as unknown as IObject3D;
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          animations: []
        }));

        const addError = new ThreeViewerError('Add failed', ErrorCode.SCENE_OPERATION_FAILED);
        mockScene.add.mockReturnValue(Result.err(addError));

        const result = await modelManager.loadModel('test.glb', mockEvents);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error?.message).toBe('Add failed');
        }
      });

      it('should warn on service failures but continue', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        const mockModel = { traverse: jest.fn(), dispose: jest.fn() } as unknown as IObject3D;
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          animations: []
        }));

        // Make services fail
        mockFloorAlignmentService.alignToFloor.mockReturnValue(
          Result.err(new ThreeViewerError('Align failed', ErrorCode.OPERATION_FAILED))
        );
        mockSceneSetupService.addDynamicGrid.mockReturnValue(
          Result.err(new ThreeViewerError('Grid failed', ErrorCode.OPERATION_FAILED))
        );

        const result = await modelManager.loadModel('test.glb', mockEvents);

        // Should still succeed
        expect(result.ok).toBe(true);
        
        // Should warn about failures
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Failed to align model to floor:',
          expect.any(ThreeViewerError)
        );
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Failed to add dynamic grid:',
          expect.any(ThreeViewerError)
        );

        consoleWarnSpy.mockRestore();
      });
    });
  });

  describe('disposeCurrentModel', () => {
    it('should dispose current model', async () => {
      const mockModel = { traverse: jest.fn(), dispose: jest.fn() } as unknown as IObject3D;
      mockModelLoader.load.mockResolvedValue(Result.ok({
        scene: mockModel,
        animations: []
      }));

      await modelManager.loadModel('test.glb', mockEvents);
      
      modelManager.disposeCurrentModel();

      expect(mockScene.remove).toHaveBeenCalledWith(mockModel);
      expect(mockModel.dispose).toHaveBeenCalled();
      expect(modelManager.getCurrentModel()).toBeNull();
    });

    it('should handle no current model', () => {
      expect(() => modelManager.disposeCurrentModel()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose all resources', async () => {
      const mockModel = { traverse: jest.fn(), dispose: jest.fn() } as unknown as IObject3D;
      mockModelLoader.load.mockResolvedValue(Result.ok({
        scene: mockModel,
        animations: []
      }));

      await modelManager.loadModel('test.glb', mockEvents);
      
      modelManager.dispose();

      expect(mockScene.remove).toHaveBeenCalledWith(mockModel);
      expect(mockModel.dispose).toHaveBeenCalled();
      expect(modelManager.getCurrentModel()).toBeNull();
      expect(modelManager.getLastModelUrl()).toBeUndefined();
    });
  });

  describe('disposeObject (private)', () => {
    it('delegates disposal to the object (canonical geometry/material/texture disposal lives in the adapter)', async () => {
      const mockModel = {
        traverse: jest.fn(),
        dispose: jest.fn(),
      } as unknown as IObject3D;

      mockModelLoader.load.mockResolvedValue(Result.ok({
        scene: mockModel,
        animations: []
      }));

      await modelManager.loadModel('test.glb', mockEvents);
      modelManager.disposeCurrentModel();

      // ModelManager delegates to object.dispose(); the actual geometry/material/
      // texture/shadow disposal is covered by disposal.test.ts against real THREE.
      expect(mockModel.dispose).toHaveBeenCalledTimes(1);
    });
  });

  describe('units conversion', () => {
    const makeModel = () =>
      ({ traverse: jest.fn(), dispose: jest.fn() } as unknown as IObject3D);

    const makeManager = (unitsScaleToMeters?: number) =>
      new ModelManager({
        modelLoader: mockModelLoader,
        scene: mockScene,
        camera: mockCamera,
        controls: mockControls,
        floorAlignmentService: mockFloorAlignmentService,
        sceneSetupService: mockSceneSetupService,
        unitsScaleToMeters
      });

    it('wraps the model in a units scale group and treats the wrapper as the model', async () => {
      const model = makeModel();
      const wrapper = makeModel();
      mockSceneSetupService.wrapInUnitsScaleGroup.mockReturnValue(Result.ok(wrapper));

      const result = await makeManager(0.0254).loadModel(model, mockEvents);

      expect(result.ok).toBe(true);
      expect(mockSceneSetupService.wrapInUnitsScaleGroup).toHaveBeenCalledWith(model, 0.0254);
      expect(mockScene.add).toHaveBeenCalledWith(wrapper);
      expect(result.ok && result.value).toBe(wrapper);
    });

    it('does not wrap when the model is already in meters', async () => {
      const model = makeModel();

      const result = await makeManager(1).loadModel(model, mockEvents);

      expect(result.ok).toBe(true);
      expect(mockSceneSetupService.wrapInUnitsScaleGroup).not.toHaveBeenCalled();
      expect(mockScene.add).toHaveBeenCalledWith(model);
    });

    it('defaults to no conversion when the factor is omitted', async () => {
      const model = makeModel();

      const result = await makeManager(undefined).loadModel(model, mockEvents);

      expect(result.ok).toBe(true);
      expect(mockSceneSetupService.wrapInUnitsScaleGroup).not.toHaveBeenCalled();
    });

    it('fails the load when the wrap fails instead of rendering at the wrong scale', async () => {
      mockSceneSetupService.wrapInUnitsScaleGroup.mockReturnValue(
        Result.err(new ThreeViewerError('boom', ErrorCode.SCENE_OPERATION_FAILED))
      );

      const result = await makeManager(0.0254).loadModel(makeModel(), mockEvents);

      expect(result.ok).toBe(false);
      expect(mockScene.add).not.toHaveBeenCalled();
    });
  });
});