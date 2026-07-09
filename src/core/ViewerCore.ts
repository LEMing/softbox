import {
  IRenderer,
  IRendererOptions,
  IScene,
  IModelLoader,
  ICamera,
  IControls,
  IObject3D,
  IAnchorProjectionService,
  IAnchorProjector,
  Result
} from './interfaces';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/CoreViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { resolveUnitsScaleToMeters } from './utils/units';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { CaptureStillOptions } from '../types/CaptureStillOptions';
import { CaptureVideoOptions } from '../types/CaptureVideoOptions';
import { IPathTracingService } from './services/IPathTracingService';
import { ISelectionService } from './services/ISelectionService';
import { IAnimationService } from './services/IAnimationService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService } from './services/ISceneSetupService';
import { SceneConfigurator } from './SceneConfigurator';
import { IFloorAlignmentService } from './services/IFloorAlignmentService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { deepMerge } from '../utils/deepMerge';
import { SceneSerializer } from './utils/SceneSerializer';
import { applyCameraAspect } from './utils/cameraAspect';
import { StateManager } from './managers/StateManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { CaptureController } from './CaptureController';
import { ViewerState } from './entities/ViewerState';

export type { CaptureStillOptions };

export interface ViewerDependencies {
  renderer: IRenderer;
  scene: IScene;
  camera: ICamera;
  controls: IControls;
  modelLoader: IModelLoader;
  options: SimpleViewerOptions;
  rendererOptions?: IRendererOptions;
  // Optional services
  pathTracingService?: IPathTracingService;
  environmentService?: IEnvironmentService;
  sceneSetupService?: ISceneSetupService;
  floorAlignmentService?: IFloorAlignmentService;
  selectionService?: ISelectionService;
  anchorProjectionService?: IAnchorProjectionService;
  animationService?: IAnimationService;
}

/**
 * Core business logic for the 3D viewer — a thin orchestrator over the
 * managers (state, model, screenshot, resources), the path-tracing
 * coordinator and the capture controller. Independent of UI framework and
 * rendering engine.
 */
export class ViewerCore {
  private readonly events: TypedEventEmitter<ViewerEventMap>;
  private readonly renderLoopManager: RenderLoopManager;
  private frameCount: number = 0;
  private disposed: boolean = false;
  private readonly pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  // Serializes loadModel() so rapid object changes queue (last-wins) instead of
  // the second load being rejected while the first is still in flight.
  private modelLoadChain: Promise<unknown> = Promise.resolve();

  // Managers & subsystems
  private readonly stateManager: StateManager;
  private readonly screenshotManager: ScreenshotManager;
  private readonly modelManager: ModelManager;
  private readonly resourceManager: ResourceManager;
  private readonly sceneConfigurator: SceneConfigurator;
  private readonly pathTracing: PathTracingCoordinator;
  private readonly capture: CaptureController;
  private controlsChangeUnsubscribe: (() => void) | null = null;

  // Dependencies
  private readonly renderer: IRenderer;
  private readonly scene: IScene;
  private readonly camera: ICamera;
  private readonly controls: IControls;
  private options: SimpleViewerOptions;
  private readonly rendererOptions?: IRendererOptions;
  private readonly sceneSetupService?: ISceneSetupService;
  private readonly environmentService?: IEnvironmentService;
  private readonly selectionService?: ISelectionService;
  private readonly anchorProjectionService?: IAnchorProjectionService;
  private readonly animationService?: IAnimationService;

  constructor(dependencies: ViewerDependencies) {
    this.renderer = dependencies.renderer;
    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.controls = dependencies.controls;
    this.options = dependencies.options;
    this.rendererOptions = dependencies.rendererOptions;
    this.sceneSetupService = dependencies.sceneSetupService;
    this.environmentService = dependencies.environmentService;
    this.selectionService = dependencies.selectionService;
    this.anchorProjectionService = dependencies.anchorProjectionService;
    this.animationService = dependencies.animationService;

    this.stateManager = new StateManager();

    this.screenshotManager = new ScreenshotManager({
      renderer: this.renderer,
      onRestore: async () => {
        await this.restoreFromScreenshot();
      }
    });

    const unitsScaleToMeters = resolveUnitsScaleToMeters(this.options.units);

    this.modelManager = new ModelManager({
      modelLoader: dependencies.modelLoader,
      scene: this.scene,
      camera: this.camera,
      controls: this.controls,
      floorAlignmentService: dependencies.floorAlignmentService,
      sceneSetupService: this.sceneSetupService,
      renderer: this.renderer,
      autoFitToObject: this.options.camera?.autoFitToObject,
      floorAlignment: this.options.floorAlignment,
      unitsScaleToMeters
    });

    this.resourceManager = new ResourceManager({
      scene: this.scene,
      pathTracingService: dependencies.pathTracingService,
      environmentService: this.environmentService
    });

    this.sceneConfigurator = new SceneConfigurator();

    this.events = new TypedEventEmitter<ViewerEventMap>();

    const renderingOptions = this.options.rendering || {};
    const defaultIdleDetection = this.options.staticScene !== false;

    this.renderLoopManager = new RenderLoopManager({
      enableIdleDetection: renderingOptions.enableIdleDetection ?? defaultIdleDetection,
      idleDelay: renderingOptions.idleDelay,
      targetFPS: renderingOptions.targetFPS,
      enableFrameRateLimiting: renderingOptions.enableFrameRateLimiting,
      alwaysRender: false // Will be set later based on staticScene
    });

    this.pathTracing = new PathTracingCoordinator({
      service: dependencies.pathTracingService,
      events: this.events,
      renderLoopManager: this.renderLoopManager,
      renderer: this.renderer,
      getOptions: () => this.options,
      isDisposed: () => this.disposed,
      schedule: (callback, delayMs) => this.schedule(callback, delayMs),
      replaceWithScreenshot: () => this.replaceWithScreenshot(),
    });

    this.capture = new CaptureController({
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      events: this.events,
      renderLoopManager: this.renderLoopManager,
      pathTracing: this.pathTracing,
      getStatus: () => this.stateManager.getStatus(),
      isDisposed: () => this.disposed,
      awaitModelLoads: () => this.modelLoadChain,
      reviveRenderLoop: () => this.reviveRenderLoop(),
      isAutoRotating: () => this.controls.autoRotate,
      isScreenshotActive: () => this.screenshotManager.isActive(),
    });
  }

  async initialize(): Promise<Result<void>> {
    try {
      const rendererResult = this.renderer.initialize(this.rendererOptions || {});
      if (!rendererResult.ok) {
        return rendererResult;
      }

      if (this.sceneSetupService) {
        this.sceneConfigurator.configureScene(this.scene, this.sceneSetupService, this.options);
      }

      // configureEnvironment bails internally if the viewer is disposed across
      // its awaits; re-check here before the next async step.
      if (this.environmentService) {
        await this.sceneConfigurator.configureEnvironment(
          this.scene,
          this.environmentService,
          this.sceneSetupService,
          this.renderer,
          this.options,
          () => this.disposed
        );
        if (this.disposed) {
          return Result.ok(undefined);
        }
      }

      await this.pathTracing.initialize();
      if (this.disposed) {
        return Result.ok(undefined);
      }

      // Click-picking on the loaded model → 'object:selected'
      if (this.selectionService) {
        this.selectionService.initialize({
          canvas: this.renderer.getDomElement(),
          camera: this.camera,
          getPickRoot: () => this.modelManager.getCurrentModel(),
          bvh: this.options.selection?.bvh,
          onPick: (pick) => {
            if (pick && !this.disposed) {
              this.events.emit('object:selected', pick);
            }
          },
        });
      }

      this.stateManager.setInitialized();
      this.startRenderLoop();

      // The controls mutate the camera directly from user input, so once the
      // loop has wound down (idle static scene, converged path tracing)
      // nothing else observes the interaction — this is what wakes it back up.
      this.controlsChangeUnsubscribe = this.controls.onChange(() => {
        if (this.disposed) {
          return;
        }
        this.reviveRenderLoop();
        this.renderLoopManager.requestRender();
      });

      if (!this.options.staticScene) {
        this.renderLoopManager.setAlwaysRender(true);
      } else if (this.pathTracing.isEnabled()) {
        this.renderLoopManager.requireContinuous('path-tracing');
      }
      if (this.options.controls?.autoRotate) {
        this.renderLoopManager.requireContinuous('turntable');
      }

      this.renderLoopManager.requestRender();

      return Result.ok(undefined);
    } catch (error) {
      const viewerError = new ThreeViewerError(
        'Failed to initialize viewer',
        ErrorCode.INITIALIZATION_FAILED,
        { originalError: error }
      );
      this.stateManager.setError(viewerError);
      this.events.emit('error', { error: viewerError });
      return Result.err(viewerError);
    }
  }

  /**
   * Load a model. Calls are serialized: when `object` changes faster than a load
   * resolves, the new load waits for the in-flight one and then supersedes it
   * (last-wins), instead of being rejected as INVALID_STATE while status is
   * 'loading' and silently dropped.
   */
  loadModel(source: string | IObject3D): Promise<Result<void>> {
    const run = this.modelLoadChain.then(() => this.runLoadModel(source));
    // Keep the chain alive even if a load rejects, so later loads still run.
    this.modelLoadChain = run.then(() => undefined, () => undefined);
    return run;
  }

  private async runLoadModel(source: string | IObject3D): Promise<Result<void>> {
    if (this.disposed) {
      return Result.err(
        new ThreeViewerError('Cannot load model after dispose', ErrorCode.INVALID_STATE)
      );
    }
    if (!this.stateManager.canLoad()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot load model in current state',
          ErrorCode.INVALID_STATE,
          {
            currentState: this.stateManager.getStatus(),
            isInitialized: this.stateManager.isInitialized()
          }
        )
      );
    }

    try {
      this.stateManager.startLoading();

      const result = await this.modelManager.loadModel(source, this.events);

      if (this.disposed) {
        // dispose() ran while the load was in flight: the model manager
        // already added the freshly-loaded model to a scene nobody renders
        // and nothing else will ever call dispose() again to reclaim it.
        if (result.ok) {
          this.modelManager.disposeCurrentModel();
        }
        return Result.err(
          new ThreeViewerError('Viewer was disposed while the model was loading', ErrorCode.INVALID_STATE)
        );
      }

      if (result.ok) {
        this.stateManager.setLoaded(result.value);
        this.attachAnimations(result.value);
        // The loop may have wound down entirely (converged path tracing) —
        // requestRender alone cannot restart a dead rAF chain, and without
        // this the new model never paints until the user touches the controls.
        this.reviveRenderLoop();
        this.renderLoopManager.requestRender();
        // A new model restarts the accumulation from scratch. Forced: the
        // stale ingest must not survive, or the tracer keeps sampling the
        // previous model's geometry.
        this.pathTracing.resetAccumulation(true);
        return Result.ok(undefined);
      } else {
        this.stateManager.setError(result.error);
        return result;
      }
    } catch (error) {
      const viewerError = error instanceof ThreeViewerError ? error :
        new ThreeViewerError(
          'Failed to load model',
          ErrorCode.MODEL_LOAD_FAILED,
          { originalError: error, source }
        );

      this.stateManager.setError(viewerError);
      return Result.err(viewerError);
    }
  }

  private startRenderLoop(): void {
    this.renderLoopManager.start((deltaTime) => {
      if (this.disposed) {
        this.renderLoopManager.stop();
        return;
      }
      if (!this.stateManager.isInitialized() || this.stateManager.getStatus() === 'error') {
        return;
      }
      // A disposed renderer must stop the loop, not render into a dead context.
      if (!this.renderer || this.renderer.isDisposed()) {
        this.renderLoopManager.stop();
        return;
      }

      const currentTime = performance.now();
      const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

      const isAnimating = this.animationService?.isPlaying() ?? false;
      // Skip the controls update while they are disabled so an external camera
      // driver (e.g. a consumer's first-person controls) can own the camera —
      // OrbitControls.update() re-aims at the orbit target every frame and would
      // otherwise fight it. The loop still renders unconditionally below, so the
      // externally-driven camera is shown.
      const controlsChanged = this.controls.enabled ? this.controls.update() : false;
      if (controlsChanged) {
        this.events.emit('controls:change', { controls: this.controls });
        // A camera move invalidates the accumulated path-traced frame. While
        // animations play the accumulation is suspended below — resetting
        // here would re-arm it against geometry that changes every frame.
        if (!isAnimating) {
          this.pathTracing.resetAccumulation();
        }
        this.renderLoopManager.requestRender();
      }

      if (isAnimating && this.animationService) {
        this.animationService.update(deltaTime / 1000);
        this.pathTracing.suspendWhileAnimating();
      }

      // Completion is detected across the frame: snapshot before, check after.
      const frameState = this.pathTracing.beforeFrame();

      this.renderFrame().catch(error => {
        console.error('[ViewerCore] Render frame error:', error);
      });

      this.pathTracing.detectCompletion(frameState, currentTime);

      this.frameCount++;
      this.stateManager.updateRenderInfo({
        frameCount: this.frameCount,
        fps: Math.round(fps),
        lastRenderTime: performance.now() - currentTime,
      });
    });
  }

  private stopRenderLoop(): void {
    this.renderLoopManager.stop();
  }

  /**
   * Schedule a deferred callback that is automatically cancelled on dispose and
   * never runs against a disposed viewer.
   */
  private schedule(callback: () => void, delayMs: number): void {
    const id = setTimeout(() => {
      this.pendingTimers.delete(id);
      if (this.disposed) {
        return;
      }
      callback();
    }, delayMs);
    this.pendingTimers.add(id);
  }

  private async renderFrame(): Promise<void> {
    const startTime = performance.now();

    if (!this.renderer || !this.scene || !this.camera) {
      console.warn('[ViewerCore] Cannot render - components not initialized');
      return;
    }
    // A screenshot replaces the live canvas; rendering under it is wasted work.
    if (this.screenshotManager.isActive()) {
      return;
    }

    this.stateManager.startRendering();

    // The raster branch routes through the post-processing composer (bloom/
    // vignette/grain) when the renderer has one; path tracing (when it returns
    // a frame) bypasses it — the tracer draws to the canvas itself.
    const renderResult = await (
      this.pathTracing.render(this.scene, this.camera) ??
      Promise.resolve(this.renderRaster())
    );

    if (!renderResult.ok) {
      console.error('[ViewerCore] Render failed:', renderResult.error);
      this.events.emit('error', { error: renderResult.error });
      return;
    }

    this.events.emit('render:complete', {
      frame: this.frameCount,
      renderTime: performance.now() - startTime,
      samples: this.pathTracing.getSampleCount()
    });
  }

  /** Plain raster render, through the post-processing composer when present. */
  private renderRaster(): Result<void> {
    return this.renderer.renderPostProcessed
      ? this.renderer.renderPostProcessed(this.scene, this.camera)
      : this.renderer.render(this.scene, this.camera);
  }

  /**
   * Apply runtime-tunable options to a live viewer without rebuilding it.
   *
   * Only options that are safe to change on a running viewer are honoured here
   * (background color, tone-mapping exposure, environment intensity).
   * Structural options — renderer, controls type, path tracing, lighting,
   * helpers — take effect at construction time and require a rebuild.
   */
  updateOptions(partial: Partial<SimpleViewerOptions>): void {
    if (this.disposed) {
      return;
    }
    const previousAutoplay = this.options.animations?.autoplay;
    const previousAutoRotate = this.options.controls?.autoRotate;
    const previousPathTracingEnabled = this.options.pathTracing?.enabled ?? false;
    this.options = deepMerge(this.options, partial);
    // deepMerge intentionally ignores `undefined` overrides so they never wipe a
    // base value — but switching away from the dark preset sends
    // `backgroundColorEdge: undefined` precisely to CLEAR the radial vignette.
    // Honour an explicit clear so a dark→light switch drops the vignette instead
    // of leaving a dark-cornered scrim stuck on the light background.
    if ('backgroundColorEdge' in partial) {
      this.options.backgroundColorEdge = partial.backgroundColorEdge;
    }

    let needsRender = false;
    // A change to either the base colour or its radial-vignette edge repaints
    // the backdrop; applyBackgroundColor reads the (now-reconciled) edge itself.
    const backgroundChanged =
      partial.backgroundColor !== undefined || partial.backgroundColorEdge !== undefined;
    if (backgroundChanged && this.options.backgroundColor !== undefined) {
      this.applyBackgroundColor(this.options.backgroundColor);
    }
    const exposure = partial.renderer?.toneMappingExposure;
    if (exposure !== undefined) {
      this.renderer.setToneMappingExposure(exposure);
      needsRender = true;
    }
    const environmentIntensity = partial.environment?.environmentIntensity;
    if (environmentIntensity !== undefined) {
      this.scene.setEnvironmentIntensity(environmentIntensity);
      needsRender = true;
    }
    const autoRotate = partial.controls?.autoRotate;
    // Guarded against re-sends of an unchanged value (the runtime-options
    // effect re-sends the whole set): re-asserting `true` must not override
    // an imperative pause or spuriously reject a pending capture.
    if (autoRotate !== undefined && autoRotate !== previousAutoRotate) {
      this.controls.autoRotate = autoRotate;
      if (autoRotate) {
        this.renderLoopManager.requireContinuous('turntable');
        // A spin-up invalidates any pending path-traced capture's wait — the
        // accumulation now resets every frame and can never converge.
        this.capture.notifyTurntableEnabled();
      } else {
        this.renderLoopManager.releaseContinuous('turntable');
      }
      needsRender = true;
    }
    const autoRotateSpeed = partial.controls?.autoRotateSpeed;
    if (autoRotateSpeed !== undefined) {
      this.controls.autoRotateSpeed = autoRotateSpeed;
      needsRender = true;
    }
    const autoplay = partial.animations?.autoplay;
    // Guarded against re-sends of an unchanged value: play() restarts clips
    // from t=0, and the runtime-options effect re-sends the whole set.
    if (autoplay !== undefined && autoplay !== previousAutoplay) {
      if (autoplay) {
        // Before any model lands there is nothing to play and nothing to
        // validate a clip name against — the merged option is enough;
        // attachAnimations applies it when the load resolves.
        if (this.modelManager.getCurrentModel()) {
          this.autoplayFromOptions(autoplay);
        }
      } else {
        this.pauseAnimations();
      }
      needsRender = true;
    }
    const animationSpeed = partial.animations?.speed;
    if (animationSpeed !== undefined) {
      this.animationService?.setSpeed(animationSpeed);
      needsRender = true;
    }
    const pathTracingEnabled = partial.pathTracing?.enabled;
    // Guarded against re-sends of an unchanged value (the runtime-options
    // effect re-sends the whole set): a redundant enable must not restart a
    // running accumulation, and a redundant disable must not thrash the loop.
    if (pathTracingEnabled !== undefined && pathTracingEnabled !== previousPathTracingEnabled) {
      this.setPathTracingEnabled(pathTracingEnabled);
      needsRender = true;
    }
    if (needsRender) {
      // An option change must repaint even after idle detection stopped the
      // loop (staticScene) — a dead rAF chain ignores the needsRender flag.
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
  }

  // A flat fill, or a radial studio vignette when a `backgroundColorEdge` is set
  // (base behind the subject → edge in the corners). Single source of truth so
  // every backdrop repaint — preset switch, environment reset, solid override —
  // agrees on flat-vs-radial.
  private backgroundGradient(color: string | number, edge: string | number | undefined) {
    return edge !== undefined
      ? { topColor: String(color), bottomColor: String(edge), radial: true }
      : { topColor: String(color), bottomColor: String(color) };
  }

  private applyBackgroundColor(color: string | number): void {
    // An environment map owns the background when present; don't override it.
    if (this.options.environment?.url || !this.sceneSetupService) {
      return;
    }
    const gradient = this.backgroundGradient(color, this.options.backgroundColorEdge);
    const result = this.sceneSetupService.createGradientBackground(this.scene, gradient);
    if (!result.ok) {
      console.warn('Failed to update background color:', result.error);
      return;
    }
    this.renderLoopManager.requestRender();
  }

  /**
   * Runtime: replace the environment map (reflections + background) with the HDRI
   * at `url`. Textures are cached by URL, so toggling the same map on/off is cheap.
   */
  async setEnvironmentMap(url: string): Promise<Result<void>> {
    if (this.disposed) {
      return Result.ok(undefined);
    }
    if (!this.environmentService) {
      return Result.err(
        new ThreeViewerError('Environment service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    const loadResult = await this.environmentService.loadEnvironmentMap(url);
    if (this.disposed) {
      return Result.ok(undefined);
    }
    if (!loadResult.ok) {
      return Result.err(loadResult.error);
    }
    const applyResult = this.environmentService.applyToScene(this.scene, loadResult.value, {
      backgroundBlurriness: this.options.environment?.backgroundBlurriness,
      backgroundIntensity: this.options.environment?.backgroundIntensity,
      environmentIntensity: this.options.environment?.environmentIntensity,
      setBackground: true,
    });
    if (!applyResult.ok) {
      return applyResult;
    }
    this.options = deepMerge(this.options, { environment: { url } });
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  /**
   * Runtime: drop back to the built-in studio environment and the clean gradient
   * background, undoing a prior setEnvironmentMap / setBackgroundImage.
   */
  resetEnvironment(): Result<void> {
    if (this.disposed) {
      return Result.ok(undefined);
    }
    if (!this.environmentService) {
      return Result.err(
        new ThreeViewerError('Environment service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    const studioResult = this.environmentService.createStudioEnvironment();
    if (!studioResult.ok) {
      return Result.err(studioResult.error);
    }
    this.environmentService.applyToScene(this.scene, studioResult.value, { setBackground: false });
    if (this.options.environment) {
      this.options.environment.url = undefined;
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
    if (this.disposed) {
      return Result.ok(undefined);
    }
    if (!this.environmentService) {
      return Result.err(
        new ThreeViewerError('Environment service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    const result = await this.environmentService.setBackgroundImage(this.scene, source);
    if (this.disposed) {
      return Result.ok(undefined);
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
    if (this.disposed) {
      return Result.ok(undefined);
    }
    if (!this.sceneSetupService) {
      return Result.err(
        new ThreeViewerError('Scene setup service unavailable', ErrorCode.INVALID_STATE)
      );
    }
    // An explicit solid override drops any radial vignette; clear the edge so the
    // stored state matches the flat paint (and a later restore stays flat).
    const result = this.sceneSetupService.createGradientBackground(
      this.scene,
      this.backgroundGradient(color, undefined)
    );
    if (!result.ok) {
      return result;
    }
    this.options = deepMerge(this.options, { backgroundColor: color });
    this.options.backgroundColorEdge = undefined;
    this.repaintAfterEnvironmentChange();
    return Result.ok(undefined);
  }

  private restoreBackgroundColor(): void {
    const color = this.options.backgroundColor;
    if (color === undefined || !this.sceneSetupService) {
      return;
    }
    // Honour a preset's radial vignette (e.g. dark) so it survives a reset.
    this.sceneSetupService.createGradientBackground(
      this.scene,
      this.backgroundGradient(color, this.options.backgroundColorEdge)
    );
  }

  private repaintAfterEnvironmentChange(): void {
    // A live path-traced session must re-ingest the new environment/background;
    // the forced reset re-runs the tracer's scene setup on the next frame.
    this.pathTracing.resetAccumulation(true);
    this.reviveRenderLoop();
    this.renderLoopManager.requestRender();
  }

  resize(width: number, height: number): void {
    // A queued resize (rAF / ResizeObserver) can fire after teardown — e.g. the
    // StrictMode unmount->remount in dev. Rendering against a disposed renderer
    // produces WebGL "Program object expected" errors, so bail.
    if (this.disposed) {
      return;
    }
    const canvas = this.renderer.getDomElement();
    if (canvas.width === width && canvas.height === height) {
      return;
    }

    const wasPathTracingActive = this.pathTracing.onResizeStart();

    applyCameraAspect(this.camera, width / height);
    this.renderer.setSize(width, height);

    // Render immediately so the resized frame never shows stretched.
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      // The scene may not be ready yet; the render loop repaints shortly.
    }

    this.pathTracing.onResizeEnd(wasPathTracingActive);
    this.renderLoopManager.requestRender();
  }

  getState() {
    return this.stateManager.getState();
  }

  onStateChange(callback: (state: ViewerState) => void): () => void {
    return this.stateManager.onStateChange(callback);
  }

  getEvents(): TypedEventEmitter<ViewerEventMap> {
    return this.events;
  }

  getDomElement(): HTMLCanvasElement {
    return this.renderer.getDomElement();
  }

  /**
   * Public accessors for the engine-agnostic viewer parts. Presentation code
   * uses these instead of reaching into private fields, so the interface
   * boundary survives a private-field rename.
   */
  getRenderer(): IRenderer {
    return this.renderer;
  }

  getScene(): IScene {
    return this.scene;
  }

  getCamera(): ICamera {
    return this.camera;
  }

  getControls(): IControls {
    return this.controls;
  }

  /** The currently loaded model, or null while nothing is loaded. */
  getModel(): IObject3D | null {
    return this.modelManager.getCurrentModel();
  }

  /** Request a single render through the internal render loop. */
  requestRender(): void {
    this.renderLoopManager.requestRender();
  }

  /**
   * With staticScene idle detection the loop STOPS when idle; waking flags
   * alone cannot restart a dead requestAnimationFrame chain.
   */
  private reviveRenderLoop(): void {
    if (this.stateManager.isInitialized() && !this.renderLoopManager.isRunning()) {
      this.startRenderLoop();
    }
  }

  /**
   * Toggle path tracing on a live viewer — no rebuild, no model refetch. The
   * enable path loads the tracer lazily, so it awaits; both paths then revive a
   * wound-down loop and request a frame. A dispose mid-await is guarded.
   */
  private setPathTracingEnabled(enabled: boolean): void {
    if (enabled) {
      void this.pathTracing.enableRuntime().then((active) => {
        if (active && !this.disposed) {
          this.reviveRenderLoop();
          this.renderLoopManager.requestRender();
        }
      });
    } else {
      this.pathTracing.disableRuntime();
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
  }

  /** Clip names of the loaded model, in file order (empty when none). */
  getAnimationNames(): string[] {
    return this.animationService?.getClipNames() ?? [];
  }

  /**
   * Plays one clip by name, or ALL clips when no name is given (looped).
   * Errs on a clip name the loaded model does not carry — a typo'd name
   * must not silently leave the model frozen.
   */
  playAnimations(clipName?: string): Result<void> {
    if (!this.animationService) {
      if (clipName !== undefined) {
        return Result.err(
          new ThreeViewerError(
            `Cannot play animation clip '${clipName}': the viewer was assembled without an animation service`,
            ErrorCode.INVALID_STATE
          )
        );
      }
      return Result.ok(undefined);
    }
    const played = this.animationService.play(clipName);
    if (!played.ok) {
      return played;
    }
    if (this.animationService.isPlaying()) {
      // The baked contact shadow is a snapshot of one pose — a moving model
      // needs the real-time catcher until playback stops.
      this.sceneSetupService?.setContactShadowMode(this.scene, 'live');
      this.renderLoopManager.requireContinuous('animations');
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
    return Result.ok(undefined);
  }

  /**
   * Options-driven autoplay has no caller to hand a Result to — a typo'd
   * clip name in `animations.autoplay` surfaces on the console instead.
   */
  private autoplayFromOptions(autoplay: boolean | string): void {
    const played = this.playAnimations(typeof autoplay === 'string' ? autoplay : undefined);
    if (!played.ok) {
      console.error('animations.autoplay failed:', played.error.message);
    }
  }

  /** Freezes playback on the current pose; play() resumes. */
  pauseAnimations(): void {
    this.animationService?.pause();
    this.renderLoopManager.releaseContinuous('animations');
    this.rebakeContactShadowForCurrentPose();
    // Playback suspended the path-traced accumulation; the model now rests
    // in a NEW pose, so the resumed accumulation must re-ingest the scene
    // (force), not just re-sync the camera.
    this.pathTracing.resetAccumulation(true);
    // One more frame so the swapped-in baked shadow reaches the screen even
    // though the continuous-render demand is gone.
    this.renderLoopManager.requestRender();
  }

  /**
   * Re-bake the contact shadow against whatever pose playback stopped on;
   * the pre-pause bake pictured the load pose. Falls back to leaving the
   * live catcher up if baking isn't possible right now.
   */
  private rebakeContactShadowForCurrentPose(): void {
    const model = this.modelManager.getCurrentModel();
    if (!model || !this.sceneSetupService) {
      return;
    }
    const bakeResult = this.sceneSetupService.bakeContactShadow(this.scene, model, this.renderer);
    if (!bakeResult.ok) {
      console.warn('Failed to re-bake contact shadow after pausing animations:', bakeResult.error);
    }
  }

  private attachAnimations(model: IObject3D): void {
    if (!this.animationService) {
      return;
    }
    // The previous model's playback (and its loop demand) dies with it.
    this.renderLoopManager.releaseContinuous('animations');
    this.animationService.attach(model);
    const animationOptions = this.options.animations;
    if (animationOptions?.speed !== undefined) {
      this.animationService.setSpeed(animationOptions.speed);
    }
    const autoplay = animationOptions?.autoplay;
    if (autoplay) {
      this.autoplayFromOptions(autoplay);
    }
  }

  /**
   * Creates a projector that maps a world-space anchor to canvas pixels (the
   * engine math behind DOM annotations like `Hotspot`), or null when the
   * viewer was assembled without an anchor-projection service.
   */
  createAnchorProjector(): IAnchorProjector | null {
    if (!this.anchorProjectionService) {
      return null;
    }
    return this.anchorProjectionService.createProjector({
      camera: this.camera,
      getCanvas: () => this.renderer.getDomElement(),
      getModel: () => this.getModel(),
    });
  }

  /**
   * Capture a still of the current scene as a PNG data URL. See
   * {@link CaptureController} for the raster and path-traced semantics.
   */
  captureStill(options: CaptureStillOptions = {}): Promise<Result<string>> {
    return this.capture.captureStill(options);
  }

  /**
   * Record the live canvas for a few seconds and resolve with the encoded
   * clip. See {@link CaptureController.captureVideo}.
   */
  captureVideo(options: CaptureVideoOptions = {}): Promise<Result<Blob>> {
    return this.capture.captureVideo(options);
  }

  private replaceWithScreenshot(): void {
    const lastModelUrl = this.modelManager.getLastModelUrl();

    this.screenshotManager.captureAndReplace(
      this.camera,
      this.controls,
      lastModelUrl,
      () => {
        this.modelManager.disposeCurrentModel();
        this.resourceManager.disposeSceneResources(true);
      }
    );
  }

  private async restoreFromScreenshot(): Promise<void> {
    const serializedState = this.screenshotManager.getSerializedState();

    if (serializedState) {
      await SceneSerializer.restore(
        serializedState,
        this.camera,
        this.controls,
        async (url) => {
          const result = await this.loadModel(url);
          if (!result.ok) {
            console.error('[ViewerCore] Failed to reload model:', result.error);
          }
        }
      );
    }

    if (!this.renderLoopManager.isRunning()) {
      this.startRenderLoop();
    }
    this.renderLoopManager.requestRender();
  }

  dispose(): void {
    // Mark as disposed first to prevent any further operations
    this.disposed = true;

    this.pendingTimers.forEach((id) => clearTimeout(id));
    this.pendingTimers.clear();

    this.stopRenderLoop();
    this.controlsChangeUnsubscribe?.();
    this.controlsChangeUnsubscribe = null;
    this.selectionService?.dispose();
    this.animationService?.detach();

    // resourceManager.dispose() already disposes and detaches all scene
    // contents, so no separate scene.clear() is needed here.
    this.modelManager.dispose();
    this.resourceManager.dispose();
    this.screenshotManager.dispose();
    this.controls.dispose();
    this.renderer.dispose();

    this.stateManager.setDisposed();

    // Settle any captureStill waiter so its promise resolves to INVALID_STATE
    // instead of dangling after the listener map is cleared below.
    this.capture.settleOnDispose();

    this.events.removeAllListeners();
    this.stateManager.clearCallbacks();
  }
}
