import type * as THREE from 'three';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService } from './services/ISceneSetupService';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { Result } from '../utils/Result';
import { ThreeViewerError, ErrorCode } from '../errors';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { environmentApplyOptions } from './environmentApplyOptions';

export interface EnvironmentControllerDependencies {
  scene: THREE.Scene;
  renderLoopManager: RenderLoopManager;
  pathTracing: PathTracingCoordinator;
  environmentService?: IEnvironmentService;
  sceneSetupService?: ISceneSetupService;
  getOptions: () => SimpleViewerOptions;
  mergeOptions: (partial: Partial<SimpleViewerOptions>) => void;
  isDisposed: () => boolean;
  reviveRenderLoop: () => void;
}

export class EnvironmentController {
  constructor(private readonly deps: EnvironmentControllerDependencies) {}

  private backgroundGradient(color: string | number, edge: string | number | undefined) {
    return edge !== undefined
      ? { topColor: String(color), bottomColor: String(edge), radial: true }
      : { topColor: String(color), bottomColor: String(color) };
  }

  applyBackgroundColor(color: string | number): void {
    const options = this.deps.getOptions();
    if (options.environment?.url || !this.deps.sceneSetupService) {
      return;
    }
    const gradient = this.backgroundGradient(color, options.backgroundColorEdge);
    const result = this.deps.sceneSetupService.createGradientBackground(this.deps.scene, gradient);
    if (!result.ok) {
      console.warn('Failed to update background color:', result.error);
      return;
    }
    this.deps.renderLoopManager.requestRender();
  }

  async setEnvironmentMap(url: string): Promise<Result<void>> {
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.deps.environmentService) {
      return Result.err(
        new ThreeViewerError('Environment service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    const loadResult = await this.deps.environmentService.loadEnvironmentMap(url);
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!loadResult.ok) {
      return Result.err(loadResult.error);
    }
    const options = this.deps.getOptions();
    const applyResult = this.deps.environmentService.applyToScene(this.deps.scene, loadResult.value, {
      ...environmentApplyOptions(options),
      setBackground: true,
    });
    if (!applyResult.ok) {
      return applyResult;
    }
    this.deps.mergeOptions({ environment: { url } });
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  resetEnvironment(): Result<void> {
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.deps.environmentService) {
      return Result.err(
        new ThreeViewerError('Environment service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    const studioResult = this.deps.environmentService.createStudioEnvironment(
      this.deps.getOptions().environment?.studioLook
    );
    if (!studioResult.ok) {
      return Result.err(studioResult.error);
    }
    const applyResult = this.deps.environmentService.applyToScene(
      this.deps.scene,
      studioResult.value,
      { setBackground: false }
    );
    if (!applyResult.ok) {
      return applyResult;
    }
    const options = this.deps.getOptions();
    if (options.environment) {
      options.environment.url = undefined;
    }
    this.restoreBackgroundColor();
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  async setBackgroundImage(source: string | File | HTMLImageElement): Promise<Result<void>> {
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.deps.environmentService) {
      return Result.err(
        new ThreeViewerError('Environment service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    const result = await this.deps.environmentService.setBackgroundImage(this.deps.scene, source);
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!result.ok) {
      return result;
    }
    this.deps.environmentService.removeGroundProjection(this.deps.scene);
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  setBackgroundColor(color: string | number): Result<void> {
    if (this.deps.isDisposed()) {
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.deps.sceneSetupService) {
      return Result.err(
        new ThreeViewerError('Scene setup service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    const result = this.deps.sceneSetupService.createGradientBackground(
      this.deps.scene,
      this.backgroundGradient(color, undefined)
    );
    if (!result.ok) {
      return result;
    }
    this.deps.environmentService?.removeGroundProjection(this.deps.scene);
    this.deps.mergeOptions({ backgroundColor: color });
    this.deps.getOptions().backgroundColorEdge = undefined;
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  private restoreBackgroundColor(): void {
    const options = this.deps.getOptions();
    const color = options.backgroundColor;
    if (color === undefined || !this.deps.sceneSetupService) {
      return;
    }
    const result = this.deps.sceneSetupService.createGradientBackground(
      this.deps.scene,
      this.backgroundGradient(color, options.backgroundColorEdge)
    );
    if (!result.ok) {
      console.warn('Failed to restore the background color:', result.error);
    }
  }

  private repaintAfterEnvironmentChange(): void {
    this.deps.pathTracing.resetAccumulation(true);
    this.deps.reviveRenderLoop();
    this.deps.renderLoopManager.requestRender();
  }
}
