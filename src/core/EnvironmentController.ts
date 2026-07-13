import { IScene } from './interfaces/IScene';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService } from './services/ISceneSetupService';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { Result } from '../utils/Result';
import { ThreeViewerError, ErrorCode } from '../errors';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';

export interface EnvironmentControllerDependencies {
  scene: IScene;
  renderLoopManager: RenderLoopManager;
  pathTracing: PathTracingCoordinator;
  environmentService?: IEnvironmentService;
  sceneSetupService?: ISceneSetupService;
  /** Live view of the viewer's resolved options (the reference is reassigned on merges). */
  getOptions: () => SimpleViewerOptions;
  /** Merge a partial into the viewer's stored options (deepMerge semantics). */
  mergeOptions: (partial: Partial<SimpleViewerOptions>) => void;
  isDisposed: () => boolean;
  /** Restart a wound-down render loop so a look change repaints. */
  reviveRenderLoop: () => void;
}

/**
 * Owns the RUNTIME environment & backdrop changes — the scene's background
 * paint (flat fill or radial studio vignette) and the live environment-map
 * API (`setEnvironmentMap` / `resetEnvironment` / `setBackgroundImage` /
 * `setBackgroundColor`). Pulled out of ViewerCore so the viewer orchestrates
 * lifecycle while this owns the "what dresses the scene right now" concern;
 * the construction-time counterpart is `SceneConfigurator`.
 */
export class EnvironmentController {
  constructor(private readonly deps: EnvironmentControllerDependencies) {}

  // A flat fill, or a radial studio vignette when a `backgroundColorEdge` is set
  // (base behind the subject → edge in the corners). Single source of truth so
  // every backdrop repaint — preset switch, environment reset, solid override —
  // agrees on flat-vs-radial.
  private backgroundGradient(color: string | number, edge: string | number | undefined) {
    return edge !== undefined
      ? { topColor: String(color), bottomColor: String(edge), radial: true }
      : { topColor: String(color), bottomColor: String(color) };
  }

  /** Runtime repaint of the backdrop (preset switch / options update). */
  applyBackgroundColor(color: string | number): void {
    const options = this.deps.getOptions();
    // An environment map owns the background when present; don't override it.
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

  /**
   * Runtime: replace the environment map (reflections + background) with the HDRI
   * at `url`. Textures are cached by URL, so toggling the same map on/off is cheap.
   */
  async setEnvironmentMap(url: string): Promise<Result<void>> {
    if (this.deps.isDisposed()) {
      // Same contract as the capture APIs: a disposed viewer reports the
      // failure instead of claiming success for work it never did.
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
      // Same contract as the capture APIs: a disposed viewer reports the
      // failure instead of claiming success for work it never did.
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!loadResult.ok) {
      return Result.err(loadResult.error);
    }
    const options = this.deps.getOptions();
    const applyResult = this.deps.environmentService.applyToScene(this.deps.scene, loadResult.value, {
      backgroundBlurriness: options.environment?.backgroundBlurriness,
      backgroundIntensity: options.environment?.backgroundIntensity,
      environmentIntensity: options.environment?.environmentIntensity,
      setBackground: true,
    });
    if (!applyResult.ok) {
      return applyResult;
    }
    this.deps.mergeOptions({ environment: { url } });
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  /**
   * Runtime: drop back to the built-in studio environment and the clean gradient
   * background, undoing a prior setEnvironmentMap / setBackgroundImage.
   */
  resetEnvironment(): Result<void> {
    if (this.deps.isDisposed()) {
      // Same contract as the capture APIs: a disposed viewer reports the
      // failure instead of claiming success for work it never did.
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.deps.environmentService) {
      return Result.err(
        new ThreeViewerError('Environment service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    // Restore the SAME studio grade the viewer was built with (scenes drive
    // `environment.studioLook`), not whatever grade happens to be the default.
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

  /**
   * Runtime: paint an uploaded image as the scene backdrop, leaving the studio/HDRI
   * lighting (scene.environment) untouched.
   */
  async setBackgroundImage(source: string | File | HTMLImageElement): Promise<Result<void>> {
    if (this.deps.isDisposed()) {
      // Same contract as the capture APIs: a disposed viewer reports the
      // failure instead of claiming success for work it never did.
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
      // Same contract as the capture APIs: a disposed viewer reports the
      // failure instead of claiming success for work it never did.
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!result.ok) {
      return result;
    }
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  /**
   * Runtime: set a solid background color (e.g. to clear a background image back to
   * the theme color). Unlike updateOptions this is an explicit override, so it paints
   * even when an environment URL is configured.
   */
  setBackgroundColor(color: string | number): Result<void> {
    if (this.deps.isDisposed()) {
      // Same contract as the capture APIs: a disposed viewer reports the
      // failure instead of claiming success for work it never did.
      return Result.err(
        new ThreeViewerError('Viewer is disposed', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.deps.sceneSetupService) {
      return Result.err(
        new ThreeViewerError('Scene setup service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    // An explicit solid override drops any radial vignette; clear the edge so the
    // stored state matches the flat paint (and a later restore stays flat).
    const result = this.deps.sceneSetupService.createGradientBackground(
      this.deps.scene,
      this.backgroundGradient(color, undefined)
    );
    if (!result.ok) {
      return result;
    }
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
    // Honour a preset's radial vignette (e.g. dark) so it survives a reset.
    const result = this.deps.sceneSetupService.createGradientBackground(
      this.deps.scene,
      this.backgroundGradient(color, options.backgroundColorEdge)
    );
    if (!result.ok) {
      console.warn('Failed to restore the background color:', result.error);
    }
  }

  private repaintAfterEnvironmentChange(): void {
    // A live path-traced session must re-ingest the new environment/background;
    // the forced reset re-runs the tracer's scene setup on the next frame.
    this.deps.pathTracing.resetAccumulation(true);
    this.deps.reviveRenderLoop();
    this.deps.renderLoopManager.requestRender();
  }
}
