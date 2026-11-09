import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { ModelManager } from '../ModelManager';
import { IModelLoader, MODEL_VARIANT_NAMES_KEY } from '../../services/IModelLoader';
import { Result } from '../../../utils/Result';
import { IFloorAlignmentService } from '../../services/IFloorAlignmentService';
import { ISceneSetupService } from '../../services/ISceneSetupService';
import { ThreeViewerError, ErrorCode } from '../../../errors';
import { TypedEventEmitter } from '../../../events/EventEmitter';
import { ViewerEventMap } from '../../events/CoreViewerEvents';

type DisposableModel = THREE.Group & { disposeGeometry: jest.SpyInstance };

const makeModel = (): DisposableModel => {
  const geometry = new THREE.BoxGeometry();
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  const group = new THREE.Group() as DisposableModel;
  group.add(mesh);
  group.disposeGeometry = jest.spyOn(geometry, 'dispose');
  return group;
};

describe('ModelManager', () => {
  let modelManager: ModelManager;
  let mockModelLoader: jest.Mocked<IModelLoader>;
  let mockScene: THREE.Scene;
  let addSpy: jest.SpyInstance;
  let removeSpy: jest.SpyInstance;
  let mockCamera: THREE.PerspectiveCamera;
  let mockControls: OrbitControls;
  let mockFloorAlignmentService: jest.Mocked<IFloorAlignmentService>;
  let mockSceneSetupService: jest.Mocked<ISceneSetupService>;
  let mockEvents: TypedEventEmitter<ViewerEventMap>;

  beforeEach(() => {
    mockModelLoader = {
      load: jest.fn()
    } as unknown as jest.Mocked<IModelLoader>;

    mockScene = new THREE.Scene();
    addSpy = jest.spyOn(mockScene, 'add');
    removeSpy = jest.spyOn(mockScene, 'remove');

    mockCamera = new THREE.PerspectiveCamera();

    mockControls = {
      update: jest.fn(),
      dispose: jest.fn()
    } as unknown as OrbitControls;

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

    mockEvents = new TypedEventEmitter<ViewerEventMap>();

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
      let mockModel: DisposableModel;
      
      beforeEach(() => {
        mockModel = makeModel();
      });

      beforeEach(() => {
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel
        }));
      });

      it('should load model from URL successfully', async () => {
        const url = 'https://example.com/model.glb';
        const result = await modelManager.loadModel(url, mockEvents);

        expect(result.ok).toBe(true);
        expect(mockModelLoader.load).toHaveBeenCalledWith(url, expect.any(Function));
        expect(addSpy).toHaveBeenCalledWith(mockModel);
        expect(modelManager.getCurrentModel()).toBe(mockModel);
        expect(modelManager.getLastModelUrl()).toBe(url);
      });

      it('surfaces variant names from the namespaced userData key, as a defensive copy', async () => {
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          userData: { [MODEL_VARIANT_NAMES_KEY]: ['beach', 'midnight'] },
        }));

        await modelManager.loadModel('test.glb', mockEvents);

        const names = modelManager.getVariantNames();
        expect(names).toEqual(['beach', 'midnight']);
        names.push('forged');
        expect(modelManager.getVariantNames()).toEqual(['beach', 'midnight']);
      });

      it('ignores an authored `variants` root extra (no KHR extension)', async () => {
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
          userData: { variants: ['summer', 'winter'] },
        }));

        await modelManager.loadModel('test.glb', mockEvents);

        expect(modelManager.getVariantNames()).toEqual([]);
      });

      it('tracks the CURRENT model URL, clearing it for object sources', async () => {
        await modelManager.loadModel('https://cdn.x/a.glb', mockEvents);
        expect(modelManager.getCurrentModelUrl()).toBe('https://cdn.x/a.glb');

        await modelManager.loadModel(mockModel, mockEvents);
        expect(modelManager.getCurrentModelUrl()).toBeNull();
        expect(modelManager.getLastModelUrl()).toBe('https://cdn.x/a.glb');
      });

      it('clears the previous model variants when an object source loads', async () => {
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel,
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
          return Result.ok({ scene: mockModel });
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
        const child = mockModel.children[0];

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

        expect(mockSceneSetupService.fitShadowCameraToObject).toHaveBeenCalledWith(
          mockScene,
          mockModel
        );
        expect(mockSceneSetupService.bakeContactShadow).not.toHaveBeenCalled();
      });

      it('evicts the previous model\'s stale baked disc during the load', async () => {
        await modelManager.loadModel('test.glb', mockEvents);

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
        await modelManager.loadModel('model1.glb', mockEvents);
        const firstModel = mockModel;
        mockModelLoader.load.mockResolvedValue(Result.ok({ scene: makeModel() }));

        await modelManager.loadModel('model2.glb', mockEvents);

        expect(removeSpy).toHaveBeenCalledWith(firstModel);
        expect(firstModel.disposeGeometry).toHaveBeenCalled();
      });
    });

    describe('loading from object', () => {
      let mockObject: THREE.Object3D;
      
      beforeEach(() => {
        mockObject = makeModel();
      });

      it('should accept a THREE.Object3D directly', async () => {
        const result = await modelManager.loadModel(mockObject, mockEvents);

        expect(result.ok).toBe(true);
        expect(mockModelLoader.load).not.toHaveBeenCalled();
        expect(addSpy).toHaveBeenCalledWith(mockObject);
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
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: makeModel()
        }));

        const addError = new ThreeViewerError('Add failed', ErrorCode.SCENE_OPERATION_FAILED);
        addSpy.mockImplementation(() => {
          throw addError;
        });

        const result = await modelManager.loadModel('test.glb', mockEvents);

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.error?.message).toBe('Add failed');
        }
      });

      it('should warn on service failures but continue', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        
        const mockModel = makeModel();
        mockModelLoader.load.mockResolvedValue(Result.ok({
          scene: mockModel
        }));

        mockFloorAlignmentService.alignToFloor.mockReturnValue(
          Result.err(new ThreeViewerError('Align failed', ErrorCode.OPERATION_FAILED))
        );
        mockSceneSetupService.addDynamicGrid.mockReturnValue(
          Result.err(new ThreeViewerError('Grid failed', ErrorCode.OPERATION_FAILED))
        );

        const result = await modelManager.loadModel('test.glb', mockEvents);

        expect(result.ok).toBe(true);
        
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

      it('warns on every failing scene setup step and still loads', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        mockModelLoader.load.mockResolvedValue(Result.ok({ scene: makeModel() }));
        const failure = () => Result.err(new ThreeViewerError('step failed', ErrorCode.OPERATION_FAILED));
        mockSceneSetupService.snapObjectToFloor.mockReturnValue(failure());
        mockSceneSetupService.fitShadowCameraToObject.mockReturnValue(failure());
        mockSceneSetupService.resetContactShadow.mockReturnValue(failure());
        mockSceneSetupService.fitCameraToObject.mockReturnValue(failure());

        const result = await modelManager.loadModel('test.glb', mockEvents);

        expect(result.ok).toBe(true);
        const warnings = consoleWarnSpy.mock.calls.map(([message]) => message);
        expect(warnings).toEqual(expect.arrayContaining([
          'Failed to snap object to floor:',
          'Failed to fit shadow camera to object:',
          'Failed to reset the contact shadow:',
          'Failed to fit camera to object:',
        ]));

        consoleWarnSpy.mockRestore();
      });
    });
  });

  describe('disposeCurrentModel', () => {
    it('should dispose current model', async () => {
      const mockModel = makeModel();
      mockModelLoader.load.mockResolvedValue(Result.ok({
        scene: mockModel
      }));

      await modelManager.loadModel('test.glb', mockEvents);
      
      modelManager.disposeCurrentModel();

      expect(removeSpy).toHaveBeenCalledWith(mockModel);
      expect(mockModel.disposeGeometry).toHaveBeenCalled();
      expect(modelManager.getCurrentModel()).toBeNull();
    });

    it('should handle no current model', () => {
      expect(() => modelManager.disposeCurrentModel()).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should dispose all resources', async () => {
      const mockModel = makeModel();
      mockModelLoader.load.mockResolvedValue(Result.ok({
        scene: mockModel
      }));

      await modelManager.loadModel('test.glb', mockEvents);
      
      modelManager.dispose();

      expect(removeSpy).toHaveBeenCalledWith(mockModel);
      expect(mockModel.disposeGeometry).toHaveBeenCalled();
      expect(modelManager.getCurrentModel()).toBeNull();
      expect(modelManager.getLastModelUrl()).toBeUndefined();
    });
  });

  describe('model disposal', () => {
    it('disposes the model geometry exactly once through the shared disposal helper', async () => {
      const mockModel = makeModel();

      mockModelLoader.load.mockResolvedValue(Result.ok({
        scene: mockModel
      }));

      await modelManager.loadModel('test.glb', mockEvents);
      modelManager.disposeCurrentModel();

      expect(mockModel.disposeGeometry).toHaveBeenCalledTimes(1);
    });
  });

  describe('units conversion', () => {
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
      expect(addSpy).toHaveBeenCalledWith(wrapper);
      expect(result.ok && result.value).toBe(wrapper);
    });

    it('does not wrap when the model is already in meters', async () => {
      const model = makeModel();

      const result = await makeManager(1).loadModel(model, mockEvents);

      expect(result.ok).toBe(true);
      expect(mockSceneSetupService.wrapInUnitsScaleGroup).not.toHaveBeenCalled();
      expect(addSpy).toHaveBeenCalledWith(model);
    });

    it('defaults to no conversion when the factor is omitted', async () => {
      const model = makeModel();

      const result = await makeManager(undefined).loadModel(model, mockEvents);

      expect(result.ok).toBe(true);
      expect(mockSceneSetupService.wrapInUnitsScaleGroup).not.toHaveBeenCalled();
    });

    it('fails the load when a units conversion is configured without a scene setup service', async () => {
      const manager = new ModelManager({
        modelLoader: mockModelLoader,
        scene: mockScene,
        camera: mockCamera,
        controls: mockControls,
        unitsScaleToMeters: 0.0254
      });

      const result = await manager.loadModel(makeModel(), mockEvents);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(ErrorCode.INVALID_PARAMETER);
      }
      expect(addSpy).not.toHaveBeenCalled();
    });

    it('fails the load when the wrap fails instead of rendering at the wrong scale', async () => {
      mockSceneSetupService.wrapInUnitsScaleGroup.mockReturnValue(
        Result.err(new ThreeViewerError('boom', ErrorCode.SCENE_OPERATION_FAILED))
      );

      const result = await makeManager(0.0254).loadModel(makeModel(), mockEvents);

      expect(result.ok).toBe(false);
      expect(addSpy).not.toHaveBeenCalled();
    });
  });
});