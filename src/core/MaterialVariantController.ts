import type * as THREE from 'three';
import { Result } from '../utils/Result';
import { ThreeViewerError, ErrorCode } from '../errors';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { ISceneSetupService } from './services/ISceneSetupService';
import { ModelManager } from './managers/ModelManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';

export interface MaterialVariantControllerDependencies {
  modelManager: ModelManager;
  pathTracing: PathTracingCoordinator;
  sceneSetupService?: ISceneSetupService;
  getOptions: () => SimpleViewerOptions;
  isDisposed: () => boolean;
  repaint: () => void;
}

export class MaterialVariantController {
  private readonly deps: MaterialVariantControllerDependencies;

  constructor(deps: MaterialVariantControllerDependencies) {
    this.deps = deps;
  }

  getNames(): string[] {
    return this.deps.modelManager.getVariantNames();
  }

  select(variant: string | null): Result<void> {
    const model = this.deps.modelManager.getCurrentModel();
    if (model && variant !== null && !this.getNames().includes(variant)) {
      return Result.err(
        new ThreeViewerError(
          `Unknown material variant '${variant}'`,
          ErrorCode.INVALID_PARAMETER
        )
      );
    }
    this.deps.getOptions().variant = variant ?? undefined;
    if (!model || !this.deps.sceneSetupService) {
      return Result.ok(undefined);
    }
    void this.deps.sceneSetupService.applyMaterialVariant(model, variant).then((applied) => {
      if (!applied.ok) {
        console.warn('Failed to apply material variant:', applied.error);
        return;
      }
      if (!applied.value || this.isStale(model)) {
        return;
      }
      this.deps.pathTracing.resetAccumulation(true);
      this.deps.repaint();
    });
    return Result.ok(undefined);
  }

  selectOrWarn(variant: string | null): void {
    const result = this.select(variant);
    if (!result.ok) {
      console.warn('Failed to apply material variant:', result.error);
    }
  }

  private isStale(model: THREE.Object3D): boolean {
    return this.deps.isDisposed() || this.deps.modelManager.getCurrentModel() !== model;
  }
}
