import { IModelLoader, IObject3D, IScene, ICamera, IControls, Result } from '../interfaces';
import { IFloorAlignmentService } from '../services/IFloorAlignmentService';
import { ISceneSetupService } from '../services/ISceneSetupService';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../events/ViewerEvents';

export interface ModelManagerDependencies {
  modelLoader: IModelLoader;
  scene: IScene;
  camera: ICamera;
  controls: IControls;
  floorAlignmentService?: IFloorAlignmentService;
  sceneSetupService?: ISceneSetupService;
  autoFitToObject?: boolean;
}

/**
 * Manages model loading, disposal, and scene setup
 */
export class ModelManager {
  private currentModel: IObject3D | null = null;
  private lastModelUrl?: string;
  
  private readonly modelLoader: IModelLoader;
  private readonly scene: IScene;
  private readonly camera: ICamera;
  private readonly controls: IControls;
  private readonly floorAlignmentService?: IFloorAlignmentService;
  private readonly sceneSetupService?: ISceneSetupService;
  private readonly autoFitToObject: boolean;

  constructor(dependencies: ModelManagerDependencies) {
    this.modelLoader = dependencies.modelLoader;
    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.controls = dependencies.controls;
    this.floorAlignmentService = dependencies.floorAlignmentService;
    this.sceneSetupService = dependencies.sceneSetupService;
    this.autoFitToObject = dependencies.autoFitToObject ?? false;
  }

  /**
   * Get current model
   */
  getCurrentModel(): IObject3D | null {
    return this.currentModel;
  }

  /**
   * Get last loaded model URL
   */
  getLastModelUrl(): string | undefined {
    return this.lastModelUrl;
  }

  /**
   * Load a 3D model
   */
  async loadModel(
    source: string | IObject3D,
    events: TypedEventEmitter<ViewerEventMap>
  ): Promise<Result<IObject3D>> {
    const startTime = performance.now();

    try {
      let model: IObject3D;

      if (typeof source === 'string') {
        // Store URL for potential restoration
        this.lastModelUrl = source;
        events.emit('model:loading', { url: source });
        // Load from URL
        const loadResult = await this.modelLoader.load(source);
        if (!loadResult.ok) {
          throw loadResult.error;
        }
        model = loadResult.value.scene;
      } else {
        // Use provided object
        model = source;
      }

      // Clear existing model
      if (this.currentModel) {
        this.scene.remove(this.currentModel);
        this.disposeObject(this.currentModel);
      }

      // Add new model to scene
      const addResult = this.scene.add(model);
      if (!addResult.ok) {
        throw addResult.error;
      }

      // Align model to floor
      if (this.floorAlignmentService) {
        const alignResult = this.floorAlignmentService.alignToFloor(model);
        if (!alignResult.ok) {
          console.warn('Failed to align model to floor:', alignResult.error);
        }
      }

      // Enable shadows on the model
      model.traverse((child) => {
        if ('castShadow' in child && 'receiveShadow' in child) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      // Store current model
      this.currentModel = model;

      // Add dynamic grid based on object size
      if (this.sceneSetupService) {
        const gridResult = this.sceneSetupService.addDynamicGrid(this.scene, model, 2);
        if (!gridResult.ok) {
          console.warn('Failed to add dynamic grid:', gridResult.error);
        }
      }

      // Auto-fit camera to object if enabled
      if (this.autoFitToObject && this.sceneSetupService) {
        const fitResult = this.sceneSetupService.fitCameraToObject(
          model,
          this.camera,
          this.controls
        );
        if (!fitResult.ok) {
          console.warn('Failed to fit camera to object:', fitResult.error);
        }
      }

      // Emit event
      const loadTime = performance.now() - startTime;
      events.emit('model:loaded', { model, loadTime });

      return Result.ok(model);
    } catch (error) {
      const viewerError = error instanceof ThreeViewerError ? error :
        new ThreeViewerError(
          'Failed to load model',
          ErrorCode.MODEL_LOAD_FAILED,
          { originalError: error, source }
        );

      events.emit('model:error', {
        error: viewerError,
        url: typeof source === 'string' ? source : undefined
      });

      return Result.err(viewerError);
    }
  }

  /**
   * Dispose current model
   */
  disposeCurrentModel(): void {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.disposeObject(this.currentModel);
      this.currentModel = null;
    }
  }

  /**
   * Dispose of an object and its children. Delegates to the object's own
   * dispose(), which routes through the canonical Three.js disposal helper
   * (geometry + materials + textures + light shadows).
   */
  private disposeObject(object: IObject3D): void {
    object.dispose();
  }

  /**
   * Dispose all resources
   */
  dispose(): void {
    this.disposeCurrentModel();
    this.lastModelUrl = undefined;
  }
}