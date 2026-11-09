import {
  IModelLoader,
  IObject3D,
  IScene,
  ICamera,
  IControls,
  Result,
  MODEL_VARIANT_NAMES_KEY,
} from '../interfaces';
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
  floorAlignment?: boolean;
  unitsScaleToMeters?: number;
}

export class ModelManager {
  private currentModel: IObject3D | null = null;
  private lastModelUrl?: string;
  private currentModelUrl: string | null = null;
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

  getCurrentModel(): IObject3D | null {
    return this.currentModel;
  }

  getLastModelUrl(): string | undefined {
    return this.lastModelUrl;
  }

  getCurrentModelUrl(): string | null {
    return this.currentModelUrl;
  }

  getVariantNames(): string[] {
    return [...this.currentVariants];
  }

  async loadModel(
    source: string | IObject3D,
    events: TypedEventEmitter<ViewerEventMap>
  ): Promise<Result<IObject3D>> {
    const startTime = performance.now();

    try {
      let model: IObject3D;

      if (typeof source === 'string') {
        this.lastModelUrl = source;
        events.emit('model:loading', { url: source });
        const loadResult = await this.modelLoader.load(source, (loaded, total) => {
          events.emit('model:progress', { url: source, loaded, total });
        });
        if (!loadResult.ok) {
          throw loadResult.error;
        }
        model = loadResult.value.scene;
        this.currentModelUrl = source;
        this.currentVariants =
          ((loadResult.value.userData?.[MODEL_VARIANT_NAMES_KEY]) as string[] | undefined) ?? [];
      } else {
        model = source;
        this.currentModelUrl = null;
        this.currentVariants = [];
      }

      if (this.unitsScaleToMeters !== 1) {
        if (!this.sceneSetupService) {
          throw new ThreeViewerError(
            'A units conversion is configured but no scene setup service is available to apply it',
            ErrorCode.INVALID_PARAMETER
          );
        }
        const wrapResult = this.sceneSetupService.wrapInUnitsScaleGroup(model, this.unitsScaleToMeters);
        if (!wrapResult.ok) {
          throw wrapResult.error;
        }
        model = wrapResult.value;
      }

      if (this.currentModel) {
        this.scene.remove(this.currentModel);
        this.disposeObject(this.currentModel);
      }

      const addResult = this.scene.add(model);
      if (!addResult.ok) {
        throw addResult.error;
      }

      if (this.floorAlignment && this.floorAlignmentService) {
        const alignResult = this.floorAlignmentService.alignToFloor(model);
        if (!alignResult.ok) {
          console.warn('Failed to align model to floor:', alignResult.error);
        }
      }

      model.traverse((child) => {
        if ('castShadow' in child && 'receiveShadow' in child) {
          child.castShadow = true;
          child.receiveShadow = true;
        }
      });

      this.currentModel = model;

      if (this.sceneSetupService) {
        const gridResult = this.sceneSetupService.addDynamicGrid(this.scene, model, 2);
        if (!gridResult.ok) {
          console.warn('Failed to add dynamic grid:', gridResult.error);
        }

        if (this.floorAlignment) {
          const snapResult = this.sceneSetupService.snapObjectToFloor(this.scene, model);
          if (!snapResult.ok) {
            console.warn('Failed to snap object to floor:', snapResult.error);
          }
        }

        const shadowFitResult = this.sceneSetupService.fitShadowCameraToObject(this.scene, model);
        if (!shadowFitResult.ok) {
          console.warn('Failed to fit shadow camera to object:', shadowFitResult.error);
        }

        const resetResult = this.sceneSetupService.resetContactShadow(this.scene);
        if (!resetResult.ok) {
          console.warn('Failed to reset the contact shadow:', resetResult.error);
        }
      }

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

  disposeCurrentModel(): void {
    if (this.currentModel) {
      this.scene.remove(this.currentModel);
      this.disposeObject(this.currentModel);
      this.currentModel = null;
    }
  }

  private disposeObject(object: IObject3D): void {
    object.dispose();
  }

  dispose(): void {
    this.disposeCurrentModel();
    this.modelLoader.dispose?.();
    this.lastModelUrl = undefined;
  }
}