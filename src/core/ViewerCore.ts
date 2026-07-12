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
import { deferToNextFrame } from './utils/deferToNextFrame';
import { SceneSerializer } from './utils/SceneSerializer';
import { applyCameraAspect } from './utils/cameraAspect';
import { StateManager } from './managers/StateManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { PathTracingCoordinator } from './PathTracingCoordinator';
import { CaptureController } from './CaptureController';
import { EnvironmentController } from './EnvironmentController';
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
  /**
   * Defers work until after the next two painted frames (default:
   * `deferToNextFrame`, rAF + macrotask twice). Injectable so tests can run
   * the deferred work deterministically.
   */
  deferToNextFrame?: (callback: () => void) => void;
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
  private readonly environment: EnvironmentController;
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
  private readonly deferToNextFrame: (callback: () => void) => void;

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
    this.deferToNextFrame = dependencies.deferToNextFrame ?? deferToNextFrame;

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

    this.environment = new EnvironmentController({
      scene: this.scene,
      renderLoopManager: this.renderLoopManager,
      pathTracing: this.pathTracing,
      environmentService: this.environmentService,
      sceneSetupService: this.sceneSetupService,
      getOptions: () => this.options,
      mergeOptions: (partial) => {
        this.options = deepMerge(this.options, partial);
      },
      isDisposed: () => this.disposed,
      reviveRenderLoop: () => this.reviveRenderLoop(),
    });
  }

  async initialize(): Promise<Result<void>> {
    try {
      // Registered before renderer.initialize so a chunk failure on the
      // INITIAL effects pipeline surfaces too, not only on runtime swaps.
      this.renderer.setPostProcessingErrorHandler?.((error) => {
        if (!this.disposed) {
          this.events.emit('error', {
            error: new ThreeViewerError(
              'Post-processing effects failed to load; rendering without them',
              ErrorCode.OPERATION_FAILED,
              { originalError: error }
            ),
          });
        }
      });
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
        // The soft contact-shadow bake is a synchronous multi-pass render that
        // can take a long beat on a weak GPU. Deferred past the first painted
        // frame so the model (grounded by the live realtime catcher) appears
        // immediately; the baked disc swaps in silently a couple frames later.
        this.scheduleContactShadowBake(result.value);
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
   * (background color, tone-mapping exposure, environment intensity, the
   * post-processing effect toggles). Structural options — antialias, controls
   * type, path-tracing tuning, lighting, helpers — take effect at construction
   * time and require a rebuild.
   */
  updateOptions(partial: Partial<SimpleViewerOptions>): void {
    if (this.disposed) {
      return;
    }
    const previousAutoplay = this.options.animations?.autoplay;
    const previousAutoRotate = this.options.controls?.autoRotate;
    const previousPathTracingEnabled = this.options.pathTracing?.enabled ?? false;
    const previousPostEffects = ViewerCore.postEffectsKey(this.options);
    const previousBackgroundColor = this.options.backgroundColor;
    const previousBackgroundColorEdge = this.options.backgroundColorEdge;
    const previousEnvironmentIntensity = this.options.environment?.environmentIntensity;
    this.options = deepMerge(this.options, partial);
    // deepMerge intentionally ignores `undefined` overrides so they never wipe a
    // base value — but switching away from the dark preset sends
    // `backgroundColorEdge: undefined` precisely to CLEAR the radial vignette.
    // Honour an explicit clear so a dark→light switch drops the vignette instead
    // of leaving a dark-cornered scrim stuck on the light background.
    if ('backgroundColorEdge' in partial) {
      this.options.backgroundColorEdge = partial.backgroundColorEdge;
    }
    // Same lesson one level down: deepMerge merges plain objects key-by-key,
    // but an object `colorGrade` is a VALUE — the consumer's latest shape must
    // win wholesale, or a removed sub-field (dropping `saturation`, say)
    // silently keeps its old amount and the change is filtered as a no-op.
    if (partial.renderer && 'colorGrade' in partial.renderer && this.options.renderer) {
      this.options.renderer.colorGrade = partial.renderer.colorGrade;
    }

    let needsRender = false;
    // A change to either the base colour or its radial-vignette edge repaints
    // the backdrop; applyBackgroundColor reads the (now-reconciled) edge itself.
    const backgroundChanged =
      partial.backgroundColor !== undefined || partial.backgroundColorEdge !== undefined;
    if (backgroundChanged && this.options.backgroundColor !== undefined) {
      this.environment.applyBackgroundColor(this.options.backgroundColor);
      // The tracer reads scene.background only at ingest — without a forced
      // re-ingest a converged traced frame keeps the old backdrop forever
      // (camera-move resets are non-forced and never re-read it). Guarded on
      // an ACTUAL value change: the runtime-options effect re-sends the whole
      // set on every unrelated update, and defaults keep backgroundColor
      // always defined — a presence check would force a BVH re-ingest per
      // slider tick.
      const backgroundValueChanged =
        this.options.backgroundColor !== previousBackgroundColor ||
        this.options.backgroundColorEdge !== previousBackgroundColorEdge;
      if (backgroundValueChanged) {
        this.pathTracing.resetAccumulation(true);
      }
    }
    const exposure = partial.renderer?.toneMappingExposure;
    if (exposure !== undefined) {
      this.renderer.setToneMappingExposure(exposure);
      needsRender = true;
    }
    // Post-processing effects swap the composer live. Guarded against re-sends
    // of an unchanged set (the runtime-options effect re-sends everything):
    // rebuilding the composer costs a pipeline chunk + target allocation, so it
    // must only happen when an effect actually changed.
    const nextPostEffects = ViewerCore.postEffectsKey(this.options);
    if (
      partial.renderer &&
      nextPostEffects !== previousPostEffects &&
      this.renderer.setPostProcessing
    ) {
      this.renderer.setPostProcessing({
        bloom: this.options.renderer?.bloom ?? false,
        vignette: this.options.renderer?.vignette ?? false,
        filmGrain: this.options.renderer?.filmGrain ?? false,
        colorGrade: this.options.renderer?.colorGrade ?? false,
      });
      // The swap re-derives the pixel-ratio cap, which can resize the drawing
      // buffer (DPR > 2) and CLEAR a completed path-traced frame — whose
      // presentation path deliberately never repaints (it preserves the
      // canvas). Force a re-accumulation so a live traced session repaints
      // instead of sticking blank; same treatment as an environment change.
      this.pathTracing.resetAccumulation(true);
      needsRender = true;
    }
    const environmentIntensity = partial.environment?.environmentIntensity;
    if (environmentIntensity !== undefined) {
      this.scene.setEnvironmentIntensity(environmentIntensity);
      // Ingest-visible like the background: the tracer samples
      // scene.environmentIntensity only inside setScene. Same value-change
      // guard — the default keeps this field defined on every re-send.
      if (environmentIntensity !== previousEnvironmentIntensity) {
        this.pathTracing.resetAccumulation(true);
      }
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

  /** Content key of the resolved post-effect set, for cheap change detection. */
  private static postEffectsKey(options: SimpleViewerOptions): string {
    const renderer = options.renderer;
    return JSON.stringify([
      renderer?.bloom ?? false,
      renderer?.vignette ?? false,
      renderer?.filmGrain ?? false,
      renderer?.colorGrade ?? false,
    ]);
  }

  /**
   * Runtime: replace the environment map (reflections + background) with the HDRI
   * at `url`. Textures are cached by URL, so toggling the same map on/off is cheap.
   */
  setEnvironmentMap(url: string): Promise<Result<void>> {
    return this.environment.setEnvironmentMap(url);
  }

  /**
   * Runtime: drop back to the built-in studio environment and the clean gradient
   * background, undoing a prior setEnvironmentMap / setBackgroundImage.
   */
  resetEnvironment(): Result<void> {
    return this.environment.resetEnvironment();
  }

  /**
   * Runtime: paint an uploaded image as the scene backdrop, leaving the studio/HDRI
   * lighting (scene.environment) untouched.
   */
  setBackgroundImage(source: string | File | HTMLImageElement): Promise<Result<void>> {
    return this.environment.setBackgroundImage(source);
  }

  /**
   * Runtime: set a solid background color (e.g. to clear a background image back to
   * the theme color). Unlike updateOptions this is an explicit override, so it paints
   * even when an environment URL is configured.
   */
  setBackgroundColor(color: string | number): Result<void> {
    return this.environment.setBackgroundColor(color);
  }

  resize(width: number, height: number): void {
    // A queued resize (rAF / ResizeObserver) can fire after teardown — e.g. the
    // StrictMode unmount->remount in dev. Rendering against a disposed renderer
    // produces WebGL "Program object expected" errors, so bail.
    if (this.disposed) {
      return;
    }
    const targetAspect = width / height;
    const canvas = this.renderer.getDomElement();
    // The canvas drawing buffer is in DEVICE pixels (CSS size × pixel ratio),
    // while the incoming dimensions are CSS pixels — compare like with like,
    // or the no-op guard is dead on every DPR ≠ 1 display and each resize call
    // runs the full path (redundant setSize + repaint). Math.floor matches
    // exactly how three's setSize derives the buffer size, so fractional
    // CSS × ratio products compare correctly too.
    const pixelRatio = this.renderer.getPixelRatio();
    const sizeMatches =
      canvas.width === Math.floor(width * pixelRatio) &&
      canvas.height === Math.floor(height * pixelRatio);
    // A structural rebuild reuses the already-sized canvas but with a FRESH
    // camera still at its construction-default aspect. A size-only guard would
    // then skip applyCameraAspect and the frame renders stretched (a round model
    // reads as an ellipse). So skip only when the camera aspect is ALSO already
    // correct, not on canvas size alone.
    const isPerspective = this.camera.type === 'perspective' && 'aspect' in this.camera;
    const aspectMatches =
      !isPerspective ||
      Math.abs((this.camera as unknown as { aspect: number }).aspect - targetAspect) < 1e-6;
    if (sizeMatches && aspectMatches) {
      return;
    }

    applyCameraAspect(this.camera, targetAspect);
    if (!sizeMatches) {
      this.renderer.setSize(width, height);
    }

    // Render immediately so the resized frame never shows stretched — through
    // the composer when effects are on, or every ResizeObserver tick of a
    // drag-resize paints an effect-free frame (a visible shimmer).
    try {
      this.renderRaster();
    } catch {
      // The scene may not be ready yet; the render loop repaints shortly.
    }

    // A resize invalidates the whole accumulation, exactly like a camera
    // move: the tracer's copied camera matrices keep the old aspect (synced
    // only on reset), its internal setSize self-reset would silently diverge
    // from the service's own sample counter (a noisy frame then "completes"
    // early), and the dissolve's raster snapshot is sized to the old buffer.
    // resetAccumulation also re-arms a converged-and-self-paused tracer; the
    // loop revive below is what actually restarts accumulation — convergence
    // hard-stops the rAF chain ~100ms later, and demand flags alone cannot
    // restart a dead loop.
    this.pathTracing.resetAccumulation();
    this.reviveRenderLoop();
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
      void this.pathTracing
        .enableRuntime()
        .then((active) => {
          if (active && !this.disposed) {
            this.reviveRenderLoop();
            this.renderLoopManager.requestRender();
          }
        })
        .catch((error) => {
          // Init failures come back as Results (and emit 'error' in the
          // coordinator); this catch is the backstop for anything thrown past
          // that contract, so the runtime toggle can never surface as an
          // unhandled rejection.
          if (!this.disposed) {
            this.events.emit('error', {
              error: new ThreeViewerError(
                'Failed to enable path tracing',
                ErrorCode.PATH_TRACING_INIT_FAILED,
                { originalError: error }
              ),
            });
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
      console.warn('Failed to bake contact shadow:', bakeResult.error);
    }
  }

  /**
   * Bake the load-time contact shadow AFTER the next painted frame, so the
   * synchronous multi-pass bake never holds the first paint (or the loading
   * overlay) hostage on a weak GPU. Skipped when the world moved on by the
   * time it fires: the viewer was disposed, a newer model superseded this one,
   * or playback started (playing runs in live-shadow mode; the pause handler
   * re-bakes for the resting pose itself).
   */
  private scheduleContactShadowBake(model: IObject3D): void {
    this.deferToNextFrame(() => {
      if (
        this.disposed ||
        this.modelManager.getCurrentModel() !== model ||
        this.animationService?.isPlaying()
      ) {
        return;
      }
      this.rebakeContactShadowForCurrentPose();
      // The bake swaps the live catcher for the baked disc — repaint so the
      // swap shows even after idle detection wound the loop down.
      this.reviveRenderLoop();
      this.renderLoopManager.requestRender();
    });
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

  /**
   * True once dispose() has run. Lets callers skip work on a viewer that a
   * structural rebuild tore down underneath an in-flight async op (e.g. a model
   * load racing a rebuild) instead of surfacing a benign "after dispose" error.
   */
  isDisposed(): boolean {
    return this.disposed;
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
