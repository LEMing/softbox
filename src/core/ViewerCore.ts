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
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { CaptureStillOptions } from '../types/CaptureStillOptions';
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

    this.modelManager = new ModelManager({
      modelLoader: dependencies.modelLoader,
      scene: this.scene,
      camera: this.camera,
      controls: this.controls,
      floorAlignmentService: dependencies.floorAlignmentService,
      sceneSetupService: this.sceneSetupService,
      autoFitToObject: this.options.camera?.autoFitToObject
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

      if (result.ok) {
        this.stateManager.setLoaded(result.value);
        this.attachAnimations(result.value);
        this.renderLoopManager.requestRender();
        // A new model restarts the accumulation from scratch.
        this.pathTracing.resetAccumulation();
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
      if (!this.renderer || (this.renderer as unknown as { renderer: null | unknown }).renderer === null) {
        this.renderLoopManager.stop();
        return;
      }

      const currentTime = performance.now();
      const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

      const controlsChanged = this.controls.update();
      if (controlsChanged) {
        this.events.emit('controls:change', { controls: this.controls });
        // A camera move invalidates the accumulated path-traced frame.
        this.pathTracing.resetAccumulation();
        this.renderLoopManager.requestRender();
      }

      if (this.animationService?.isPlaying()) {
        this.animationService.update(deltaTime / 1000);
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

    const renderResult = await (
      this.pathTracing.render(this.scene, this.camera) ??
      Promise.resolve(this.renderer.render(this.scene, this.camera))
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
    this.options = deepMerge(this.options, partial);

    let needsRender = false;
    if (partial.backgroundColor !== undefined) {
      this.applyBackgroundColor(partial.backgroundColor);
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
    if (autoRotate !== undefined) {
      this.controls.autoRotate = autoRotate;
      if (autoRotate) {
        this.renderLoopManager.requireContinuous('turntable');
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
        this.playAnimations(typeof autoplay === 'string' ? autoplay : undefined);
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
    if (needsRender) {
      // An option change must repaint even after idle detection stopped the
      // loop (staticScene) — a dead rAF chain ignores the needsRender flag.
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
  }

  private applyBackgroundColor(color: string | number): void {
    // An environment map owns the background when present; don't override it.
    if (this.options.environment?.url || !this.sceneSetupService) {
      return;
    }
    const result = this.sceneSetupService.createGradientBackground(this.scene, {
      topColor: String(color),
      bottomColor: String(color),
    });
    if (!result.ok) {
      console.warn('Failed to update background color:', result.error);
      return;
    }
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

  /** Clip names of the loaded model, in file order (empty when none). */
  getAnimationNames(): string[] {
    return this.animationService?.getClipNames() ?? [];
  }

  /** Plays one clip by name, or ALL clips when no name is given (looped). */
  playAnimations(clipName?: string): void {
    if (!this.animationService) {
      return;
    }
    this.animationService.play(clipName);
    if (this.animationService.isPlaying()) {
      this.renderLoopManager.requireContinuous('animations');
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    }
  }

  /** Freezes playback on the current pose; play() resumes. */
  pauseAnimations(): void {
    this.animationService?.pause();
    this.renderLoopManager.releaseContinuous('animations');
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
      this.playAnimations(typeof autoplay === 'string' ? autoplay : undefined);
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
