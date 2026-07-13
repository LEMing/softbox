import { IModelLoader, IObject3D, IScene, ICamera, IControls, Result } from '../interfaces';
import { IFloorAlignmentService } from '../services/IFloorAlignmentService';
import { ISceneSetupService } from '../services/ISceneSetupService';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { TypedEventEmitter } from '../../events/EventEmitter';
import { ViewerEventMap } from '../events/CoreViewerEvents';

export interface ModelManagerDependencies {
  modelLoader: IModelLoader;
  scene: IScene;
  camera: ICamera;
  controls: IControls;
  floorAlignmentService?: IFloorAlignmentService;
  sceneSetupService?: ISceneSetupService;
  autoFitToObject?: boolean;
  /** Drop the loaded model onto the floor at y=0 (default true). */
  floorAlignment?: boolean;
  /** Factor converting the model's authored units to meters (1 = already meters). */
  unitsScaleToMeters?: number;
}

/**
 * Manages model loading, disposal, and scene setup
 */
export class ModelManager {
  private currentModel: IObject3D | null = null;
  private lastModelUrl?: string;
  private currentVariants: string[] = [];
  
  private readonly modelLoader: IModelLoader;
  private readonly scene: IScene;
  private readonly camera: ICamera;
  private readonly controls: IControls;
  private readonly floorAlignmentService?: IFloorAlignmentService;
  private readonly sceneSetupService?: ISceneSetupService;
  private readonly autoFitToObject: boolean;
  private readonly floorAlignment: boolean;
  private readonly unitsScaleToMeters: number;

  constructor(dependencies: ModelManagerDependencies) {
    this.modelLoader = dependencies.modelLoader;
    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.controls = dependencies.controls;
    this.floorAlignmentService = dependencies.floorAlignmentService;
    this.sceneSetupService = dependencies.sceneSetupService;
    this.autoFitToObject = dependencies.autoFitToObject ?? false;
    this.floorAlignment = dependencies.floorAlignment ?? true;
    this.unitsScaleToMeters = dependencies.unitsScaleToMeters ?? 1;
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
   * KHR_materials_variants names of the current model ([] when it has none).
   */
  getVariantNames(): string[] {
    return this.currentVariants;
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
        const loadResult = await this.modelLoader.load(source, (loaded, total) => {
          events.emit('model:progress', { url: source, loaded, total });
        });
        if (!loadResult.ok) {
          throw loadResult.error;
        }
        model = loadResult.value.scene;
        this.currentVariants =
          ((loadResult.value.userData as { variants?: string[] } | undefined)?.variants) ?? [];
      } else {
        // Use provided object
        model = source;
        this.currentVariants = [];
      }

      if (this.unitsScaleToMeters !== 1) {
        if (!this.sceneSetupService) {
          throw new ThreeViewerError(
            'A units conversion is configured but no scene setup service is available to apply it',
            ErrorCode.INVALID_PARAMETER
          );
        }
        // Rendering an inches-authored model as meters would be off by 39x —
        // failing loudly beats silently showing the wrong scale.
        const wrapResult = this.sceneSetupService.wrapInUnitsScaleGroup(model, this.unitsScaleToMeters);
        if (!wrapResult.ok) {
          throw wrapResult.error;
        }
        model = wrapResult.value;
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

      // Align model to floor (skipped when the model already carries its own
      // ground and must keep its authored Y — see the `floorAlignment` option).
      if (this.floorAlignment && this.floorAlignmentService) {
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

        // The bounding-box floor alignment above is a cheap approximation —
        // some models' overall bounding box (e.g. a baked ground-shadow decal
        // sitting lower than the wheels/feet) doesn't match their true lowest
        // contact point. Now that the floor mesh exists, raycast the object
        // down onto it and correct any residual gap. Skipped with floor
        // alignment so a model that keeps its authored Y is not snapped down.
        if (this.floorAlignment) {
          const snapResult = this.sceneSetupService.snapObjectToFloor(this.scene, model);
          if (!snapResult.ok) {
            console.warn('Failed to snap object to floor:', snapResult.error);
          }
        }

        // The key light's shadow-camera frustum is otherwise a fixed
        // world-space size set before any model existed — fine for a
        // car-sized object, but it leaves a small object only a handful of
        // shadow-map texels to work with, rendering a blocky shadow. Resize
        // it to the model now that its final (floor-snapped) position and
        // size are known.
        const shadowFitResult = this.sceneSetupService.fitShadowCameraToObject(this.scene, model);
        if (!shadowFitResult.ok) {
          console.warn('Failed to fit shadow camera to object:', shadowFitResult.error);
        }

        // NOTE: the soft contact-shadow BAKE is deliberately NOT run here. It
        // is a synchronous multi-pass render that can take a long beat on a
        // weak GPU, and running it inside the load would hold the loading
        // overlay up (and the first paint back) for its whole duration.
        // ViewerCore defers it past the first painted frame instead — the
        // live realtime catcher grounds the model until the bake swaps in.
        // Any PREVIOUS model's baked disc is stale from this point (wrong
        // shape, size and position under the new model), so evict it and put
        // the live catcher back in charge for the deferral window.
        const resetResult = this.sceneSetupService.resetContactShadow(this.scene);
        if (!resetResult.ok) {
          console.warn('Failed to reset the contact shadow:', resetResult.error);
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
    this.modelLoader.dispose?.();
    this.lastModelUrl = undefined;
  }
}