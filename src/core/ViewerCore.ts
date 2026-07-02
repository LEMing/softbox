import {
  IRenderer,
  IRendererOptions,
  IScene,
  IModelLoader,
  ICamera,
  IControls,
  IObject3D,
  Result
} from './interfaces';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/ViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { CaptureStillOptions } from '../types/CaptureStillOptions';
import { IPathTracingService } from './services/IPathTracingService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService } from './services/ISceneSetupService';
import { SceneConfigurator } from './SceneConfigurator';
import { IFloorAlignmentService } from './services/IFloorAlignmentService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { deepMerge } from '../utils/deepMerge';
import { SceneSerializer } from './utils/SceneSerializer';
import { hasInternalRenderer } from './interfaces/IRendererExtension';
import { StateManager } from './managers/StateManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { ViewerState } from './entities/ViewerState';
import { DEFAULT_PATH_TRACING_SAMPLES } from './constants';

export type { CaptureStillOptions };

type CaptureWaitOutcome = 'complete' | 'disposed' | 'error';

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
}

/**
 * Core business logic for the 3D viewer
 * Independent of UI framework and rendering engine
 */
export class ViewerCore {
  private readonly events: TypedEventEmitter<ViewerEventMap>;
  private readonly renderLoopManager: RenderLoopManager;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private pathTracingStartTime?: number;
  private pathTracingCompleteHandled: boolean = false;
  private disposed: boolean = false;
  // Pending captureStill waiters, settled by dispose() so their promises never
  // dangle after teardown.
  private readonly pendingCaptureSettlers = new Set<(outcome: CaptureWaitOutcome) => void>();
  private readonly pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();
  // Serializes loadModel() so rapid object changes queue (last-wins) instead of
  // the second load being rejected while the first is still in flight.
  private modelLoadChain: Promise<unknown> = Promise.resolve();

  // Managers
  private readonly stateManager: StateManager;
  private readonly screenshotManager: ScreenshotManager;
  private readonly modelManager: ModelManager;
  private readonly resourceManager: ResourceManager;
  private readonly sceneConfigurator: SceneConfigurator;

  // Dependencies
  private readonly renderer: IRenderer;
  private readonly scene: IScene;
  private readonly camera: ICamera;
  private readonly controls: IControls;
  private options: SimpleViewerOptions;
  private readonly rendererOptions?: IRendererOptions;
  private readonly sceneSetupService?: ISceneSetupService;
  private environmentService?: IEnvironmentService;
  private pathTracingService?: IPathTracingService;

  constructor(dependencies: ViewerDependencies) {
    this.renderer = dependencies.renderer;
    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.controls = dependencies.controls;
    this.options = dependencies.options;
    this.rendererOptions = dependencies.rendererOptions;
    this.sceneSetupService = dependencies.sceneSetupService;
    this.environmentService = dependencies.environmentService;
    this.pathTracingService = dependencies.pathTracingService;

    // Initialize managers
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
      pathTracingService: this.pathTracingService,
      environmentService: this.environmentService
    });

    this.sceneConfigurator = new SceneConfigurator();

    this.events = new TypedEventEmitter<ViewerEventMap>();
    
    // Configure render loop based on options
    const renderingOptions = this.options.rendering || {};
    const defaultIdleDetection = this.options.staticScene !== false; // Default to true for static scenes
    
    this.renderLoopManager = new RenderLoopManager({
      enableIdleDetection: renderingOptions.enableIdleDetection ?? defaultIdleDetection,
      idleDelay: renderingOptions.idleDelay,
      targetFPS: renderingOptions.targetFPS,
      enableFrameRateLimiting: renderingOptions.enableFrameRateLimiting,
      alwaysRender: false // Will be set later based on staticScene
    });
  }

  /**
   * Initialize the viewer
   */
  async initialize(): Promise<Result<void>> {
    try {
      // Use provided renderer options or empty object
      const rendererOptions = this.rendererOptions || {};

      // Initialize renderer
      const rendererResult = this.renderer.initialize(rendererOptions);
      if (!rendererResult.ok) {
        return rendererResult;
      }

      // Setup scene (helpers, lighting, background)
      if (this.sceneSetupService) {
        this.sceneConfigurator.configureScene(this.scene, this.sceneSetupService, this.options);
      }

      // Setup environment. configureEnvironment bails internally if the viewer is
      // disposed across its awaits; re-check here before the next async step.
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

      // Initialize path tracing if enabled
      const pathTracingEnabledInit = this.options.pathTracing?.enabled ?? false;
      if (this.pathTracingService && pathTracingEnabledInit) {
        const pathTracingResult = await this.pathTracingService.initialize({
          enabled: true,
          renderer: this.renderer
        });
        if (this.disposed) {
          return Result.ok(undefined);
        }

        if (!pathTracingResult.ok) {
          console.warn('Failed to initialize path tracing:', pathTracingResult.error);
        } else {
          // Update path tracing settings
          if (this.options.pathTracing) {
            this.pathTracingService.updateSettings({
              samples: this.options.pathTracing.maxSamples ?? DEFAULT_PATH_TRACING_SAMPLES,
              bounces: this.options.pathTracing.bounces,
              transmissiveBounces: this.options.pathTracing.transmissiveBounces,
              renderScale: this.options.pathTracing.renderScale,
              lowResScale: this.options.pathTracing.lowResScale,
              dynamicLowRes: this.options.pathTracing.dynamicLowRes,
              enablePathTracing: this.options.pathTracing.enabled ?? pathTracingEnabledInit
            });
          }
          
          // Listen for pathtracing:paused event
          this.pathTracingService.events.on('pathtracing:paused', (_data) => {
            
            // Stop the render loop to prevent further renders
            this.renderLoopManager.disableContinuousRendering();
            
            // Disable always render if it was enabled
            if (!this.options.staticScene) {
              this.renderLoopManager.setAlwaysRender(false);
            }
            
            // Stop the render loop completely after a short delay
            this.schedule(() => {
              this.renderLoopManager.stop();
            }, 100);
          });
        }
      }

      // Update state
      this.stateManager.setInitialized();

      // Start render loop
      this.startRenderLoop();
      
      // Configure render mode based on scene type
      if (!this.options.staticScene) {
        this.renderLoopManager.setAlwaysRender(true);
      } else {
        // Enable continuous rendering only if path tracing is active
        const pathTracingEnabled = this.options.pathTracing?.enabled ?? false;
        if (this.pathTracingService && pathTracingEnabled) {
          this.renderLoopManager.enableContinuousRendering();
        }
      }
      
      // Request initial render
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
   * Load a 3D model
   */
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
        
        // Request render after model load
        this.renderLoopManager.requestRender();
        
        // Reset path tracing when new model is loaded
        const pathTracingEnabledForReset = this.options.pathTracing?.enabled ?? false;
        if (this.pathTracingService && pathTracingEnabledForReset) {
          this.pathTracingService.reset();
          this.pathTracingCompleteHandled = false;
        }
        
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

  /**
   * Start the render loop
   */
  private startRenderLoop(): void {
    this.renderLoopManager.start((deltaTime) => {
      // Skip frame if disposed
      if (this.disposed) {
        this.renderLoopManager.stop();
        return;
      }
      
      // Skip frame if not initialized
      if (!this.stateManager.isInitialized() || this.stateManager.getStatus() === 'error') {
        return;
      }
      
      // Additional safety check - if renderer is disposed, stop the loop
      if (!this.renderer || (this.renderer as unknown as { renderer: null | unknown }).renderer === null) {
        this.renderLoopManager.stop();
        return;
      }
      
      const currentTime = performance.now();
      const fps = deltaTime > 0 ? 1000 / deltaTime : 0;

      // Update controls
      const controlsChanged = this.controls.update();
      if (controlsChanged) {
        this.events.emit('controls:change', { controls: this.controls });
        // Reset path tracing accumulation when camera moves
        const pathTracingEnabled = this.options.pathTracing?.enabled ?? false;
        if (this.pathTracingService && pathTracingEnabled) {
          this.pathTracingService.reset();
          this.pathTracingCompleteHandled = false;
        }
        // Request render on control change
        this.renderLoopManager.requestRender();
      }

      // Check path tracing status BEFORE rendering
      const wasPathTracingActive = this.pathTracingService?.isEnabled() || false;
      const pathTracingSamples = this.pathTracingService?.getSampleCount() || 0;
      const maxSamples = this.options.pathTracing?.maxSamples ?? DEFAULT_PATH_TRACING_SAMPLES;
      
      // Only render if RenderLoopManager says we need to
      // The manager already handled all the logic about when to render
      // Render frame
      this.renderFrame().catch(error => {
        console.error('[ViewerCore] Render frame error:', error);
      });
      
      // Check if path tracing just completed AFTER rendering
      const currentSampleCount = this.pathTracingService?.getSampleCount() || 0;
      
      // Path tracing completes once we reach max samples (the service disables
      // itself during rendering, so we detect the sample threshold, not state).
      if (currentSampleCount >= maxSamples && !this.pathTracingCompleteHandled && wasPathTracingActive) {
        this.handlePathTracingComplete(pathTracingSamples, currentTime);
      }

      // Update render info
      this.frameCount++;
      this.stateManager.updateRenderInfo({
        frameCount: this.frameCount,
        fps: Math.round(fps),
        lastRenderTime: performance.now() - currentTime,
      });
      
      this.lastFrameTime = currentTime;
    });
  }

  /**
   * Handle path-tracing reaching its sample target: emit completion, stop
   * continuous rendering, and either capture a screenshot or keep the final
   * image on screen.
   */
  private handlePathTracingComplete(pathTracingSamples: number, currentTime: number): void {
    this.pathTracingCompleteHandled = true;
    this.renderLoopManager.disableContinuousRendering();
    if (!this.options.staticScene) {
      this.renderLoopManager.setAlwaysRender(false);
    }

    this.events.emit('pathtracing:complete', {
      samples: pathTracingSamples,
      totalTime: currentTime - (this.pathTracingStartTime || 0),
    });

    if (this.options.replaceWithScreenshotOnComplete) {
      this.schedule(() => {
        this.replaceWithScreenshot();
        // Stop the render loop after the screenshot to avoid disposed-service renders
        this.schedule(() => this.renderLoopManager.stop(), 200);
      }, 100);
      return;
    }

    // Keep the final path-traced image visible: one last render, stop the loop,
    // and prevent autoClear from wiping the preserved buffer.
    this.renderLoopManager.requestRender();
    this.schedule(() => this.renderLoopManager.stop(), 100);
    if (hasInternalRenderer(this.renderer)) {
      const threeRenderer = this.renderer.getInternalRenderer() as { autoClear: boolean } | null;
      if (threeRenderer) {
        threeRenderer.autoClear = false;
      }
    }
  }

  /**
   * Stop the render loop
   */
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

  /**
   * Render a single frame
   */
  private async renderFrame(): Promise<void> {
    const startTime = performance.now();

    // Check if renderer is initialized
    if (!this.renderer || !this.scene || !this.camera) {
      console.warn('[ViewerCore] Cannot render - components not initialized');
      return;
    }
    
    // Don't render if we're showing a screenshot
    if (this.screenshotManager.isActive()) {
      return;
    }

    this.stateManager.startRendering();
    
    let renderResult;
    const pathTracingActiveInRender = this.pathTracingService?.isEnabled() || false;
    const pathTracingSamples = this.pathTracingService?.getSampleCount() || 0;
    const maxSamples = this.options.pathTracing?.maxSamples ?? DEFAULT_PATH_TRACING_SAMPLES;
    
    // Check if we should use path tracing
    // Use path tracing if it's enabled OR if it has completed (to preserve the final image)
    // BUT NOT if the service has been disposed
    const shouldUsePathTracing = this.pathTracingService && 
                                 !this.pathTracingService.isPathTracerDisposed() &&
                                 (pathTracingActiveInRender || 
                                  (pathTracingSamples >= maxSamples && pathTracingSamples > 0));
    
    if (shouldUsePathTracing && this.pathTracingService) {
      // Track start time for path tracing
      if (this.pathTracingService.getSampleCount() === 0) {
        this.pathTracingStartTime = performance.now();
      }
      // Use path tracing renderer (async)
      renderResult = await this.pathTracingService.render(this.scene, this.camera);
    } else {
      // Use standard renderer
      renderResult = this.renderer.render(this.scene, this.camera);
    }

    if (!renderResult.ok) {
      console.error('[ViewerCore] Render failed:', renderResult.error);
      this.events.emit('error', { error: renderResult.error });
      return;
    }

    const renderTime = performance.now() - startTime;
    const sampleCount = this.pathTracingService?.getSampleCount() || 0;
    
    this.events.emit('render:complete', {
      frame: this.frameCount,
      renderTime,
      samples: sampleCount
    });
    
    // Remove duplicate path tracing complete event
    // This is now handled in the render loop callback to ensure proper state transitions
  }

  /**
   * Resize the renderer
   */
  /**
   * Apply runtime-tunable options to a live viewer without rebuilding it.
   *
   * Only options that are safe to change on a running viewer are honoured here
   * (currently the background color). Structural options — renderer, controls
   * type, path tracing, lighting, helpers, environment — still take effect at
   * construction time and require a rebuild.
   */
  updateOptions(partial: Partial<SimpleViewerOptions>): void {
    if (this.disposed) {
      return;
    }
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
    if (needsRender) {
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
    // Skip if dimensions haven't actually changed
    const canvas = this.renderer.getDomElement();
    if (canvas.width === width && canvas.height === height) {
      return;
    }

    // Store current rendering state
    const wasPathTracingActive = this.pathTracingService?.isEnabled();

    // If a path-traced render had completed, its final frame is on the canvas.
    // A resize invalidates it, so drop the accumulation and let the live scene
    // render at the new size (matching the previous overlay-removal behavior).
    if (this.pathTracingService && this.pathTracingCompleteHandled) {
      this.pathTracingService.reset();
      this.pathTracingCompleteHandled = false;
    }

    // Update camera aspect ratio first to ensure correct projection
    this.applyCameraAspect(width / height);
    
    // Update renderer size
    this.renderer.setSize(width, height);

    // Immediately render a frame to prevent aspect ratio stretching
    try {
      this.renderer.render(this.scene, this.camera);
    } catch {
      // Silent catch - render might fail if scene is not ready
    }

    // Re-enable path tracing if it was active
    if (wasPathTracingActive && this.pathTracingService) {
      this.pathTracingService.setEnabled(true);
    }

    // Request proper render through render loop
    this.renderLoopManager.requestRender();
  }

  /**
   * Get current state
   */
  getState() {
    return this.stateManager.getState();
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: ViewerState) => void): () => void {
    return this.stateManager.onStateChange(callback);
  }

  /**
   * Get event emitter
   */
  getEvents(): TypedEventEmitter<ViewerEventMap> {
    return this.events;
  }

  /**
   * Get renderer DOM element
   */
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

  /** Request a single render through the internal render loop. */
  requestRender(): void {
    this.renderLoopManager.requestRender();
  }

  /**
   * Capture a still of the current scene as a PNG data URL.
   *
   * Raster mode renders one fresh frame at the requested resolution (the
   * drawing buffer is temporarily resized with pixel ratio 1, so `width` ×
   * `height` are exact output pixels) and restores the live size afterwards —
   * all synchronously, so nothing flickers on screen. Path-traced mode waits
   * for the accumulation to complete and captures the canvas as-is; the
   * accumulated samples exist only at the canvas resolution, so an explicit
   * `width`/`height` is rejected rather than silently downgraded to a
   * non-path-traced render.
   */
  async captureStill(options: CaptureStillOptions = {}): Promise<Result<string>> {
    if (this.disposed) {
      return Result.err(
        new ThreeViewerError('Cannot capture a still from a disposed viewer', ErrorCode.INVALID_STATE)
      );
    }
    // A capture taken mid-load would show the previous scene; let queued model
    // loads finish first.
    await this.modelLoadChain.catch(() => undefined);
    if (this.disposed) {
      return Result.err(
        new ThreeViewerError('Viewer was disposed while a model load finished', ErrorCode.INVALID_STATE)
      );
    }
    if (this.options.pathTracing?.enabled && this.pathTracingService) {
      return this.capturePathTracedStill(options);
    }
    return this.captureRasterStill(options);
  }

  private async capturePathTracedStill(options: CaptureStillOptions): Promise<Result<string>> {
    if (options.width !== undefined || options.height !== undefined) {
      return Result.err(
        new ThreeViewerError(
          'Path-traced stills are captured at the canvas resolution; omit width/height',
          ErrorCode.INVALID_PARAMETER
        )
      );
    }
    // Wait only while the accumulation can still finish. A disabled service
    // (post-completion reset, failed init, internal error) will never emit
    // 'pathtracing:complete' again — capture the canvas as it stands instead
    // of pending forever.
    const accumulating =
      Boolean(this.pathTracingService?.isEnabled()) &&
      this.stateManager.getStatus() !== 'error';
    if (!this.pathTracingCompleteHandled && accumulating) {
      const outcome = await this.waitForPathTracingOutcome();
      if (outcome === 'disposed') {
        return Result.err(
          new ThreeViewerError('Viewer was disposed while waiting for the path tracer', ErrorCode.INVALID_STATE)
        );
      }
      if (outcome === 'error') {
        return Result.err(
          new ThreeViewerError('Model failed while waiting for the path tracer', ErrorCode.RENDER_FAILED)
        );
      }
    }
    return this.readCanvasPng();
  }

  private waitForPathTracingOutcome(): Promise<CaptureWaitOutcome> {
    return new Promise<CaptureWaitOutcome>((resolve) => {
      let offComplete = () => {};
      let offError = () => {};
      const settle = (outcome: CaptureWaitOutcome) => {
        this.pendingCaptureSettlers.delete(settle);
        offComplete();
        offError();
        resolve(outcome);
      };
      this.pendingCaptureSettlers.add(settle);
      offComplete = this.events.once('pathtracing:complete', () => settle('complete'));
      offError = this.events.once('model:error', () => settle('error'));
    });
  }

  private captureRasterStill(options: CaptureStillOptions): Result<string> {
    const canvas = this.renderer.getDomElement();
    const livePixelRatio = this.renderer.getPixelRatio();
    // A hidden or detached canvas has no client size; scale the drawing buffer
    // back to logical pixels instead of mistaking buffer pixels for CSS ones.
    const hasLayout = canvas.clientWidth > 0 && canvas.clientHeight > 0;
    const liveWidth = hasLayout ? canvas.clientWidth : Math.round(canvas.width / livePixelRatio);
    const liveHeight = hasLayout ? canvas.clientHeight : Math.round(canvas.height / livePixelRatio);
    if (liveWidth <= 0 || liveHeight <= 0) {
      return Result.err(
        new ThreeViewerError('Cannot capture: the canvas has no size', ErrorCode.INVALID_STATE)
      );
    }
    const liveAspect = liveWidth / liveHeight;

    const targetWidth = Math.round(
      options.width ?? (options.height !== undefined ? options.height * liveAspect : liveWidth * livePixelRatio)
    );
    const targetHeight = Math.round(
      options.height ?? (options.width !== undefined ? options.width / liveAspect : liveHeight * livePixelRatio)
    );

    const maxSize = this.renderer.capabilities.maxTextureSize;
    if (
      !Number.isFinite(targetWidth) || !Number.isFinite(targetHeight) ||
      targetWidth <= 0 || targetHeight <= 0 ||
      targetWidth > maxSize || targetHeight > maxSize
    ) {
      return Result.err(
        new ThreeViewerError(
          `Requested still size ${targetWidth}x${targetHeight} is outside 1..${maxSize}`,
          ErrorCode.INVALID_PARAMETER
        )
      );
    }

    // The whole resize → render → read → restore cycle runs in one task, so
    // the intermediate size is never painted to screen. The renderer is driven
    // directly rather than through resize(): its change-detection guard
    // compares buffer pixels to logical pixels and could skip the restore.
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(targetWidth, targetHeight);
    this.applyCameraAspect(targetWidth / targetHeight);
    const rendered = this.renderer.render(this.scene, this.camera);
    const still = rendered.ok ? this.readCanvasPng() : Result.err(rendered.error);
    // Size first, ratio second: three re-applies the last logical size when the
    // pixel ratio changes, so this order never allocates a target×DPR buffer.
    this.renderer.setSize(liveWidth, liveHeight);
    this.renderer.setPixelRatio(livePixelRatio);
    this.applyCameraAspect(liveAspect);
    this.renderer.render(this.scene, this.camera);
    this.renderLoopManager.requestRender();
    return still;
  }

  private applyCameraAspect(aspect: number): void {
    if (this.camera.type === 'perspective' && 'aspect' in this.camera) {
      this.camera.aspect = aspect;
    }
    this.camera.updateProjectionMatrix();
  }

  private readCanvasPng(): Result<string> {
    const dataUrl = this.renderer.getDomElement().toDataURL('image/png');
    if (!dataUrl || dataUrl === 'data:,') {
      return Result.err(
        new ThreeViewerError('Canvas produced an empty image', ErrorCode.RENDER_FAILED)
      );
    }
    return Result.ok(dataUrl);
  }

  /**
   * Replace the 3D scene with a screenshot
   */
  private replaceWithScreenshot(): void {
    const lastModelUrl = this.modelManager.getLastModelUrl();
    
    this.screenshotManager.captureAndReplace(
      this.camera,
      this.controls,
      lastModelUrl,
      () => {
        // Dispose scene resources
        this.modelManager.disposeCurrentModel();
        this.resourceManager.disposeSceneResources(true);
      }
    );
  }

  /**
   * Restore the 3D scene from screenshot
   */
  private async restoreFromScreenshot(): Promise<void> {
    const serializedState = this.screenshotManager.getSerializedState();
    
    // Renderer is still available - no need to re-initialize
    
    // Re-create services if they were disposed
    if (!this.pathTracingService && this.options.pathTracing?.enabled) {
      // Note: This is a limitation - we can't recreate the service here
      // Would need factory access or dependency injection
      console.warn('[ViewerCore] Cannot recreate path tracing service - feature disabled');
    }
    
    // Restore scene state
    if (serializedState) {
      await SceneSerializer.restore(
        serializedState,
        this.camera,
        this.controls,
        async (url) => {
          // Reload the model
          const result = await this.loadModel(url);
          if (!result.ok) {
            console.error('[ViewerCore] Failed to reload model:', result.error);
          }
        }
      );
    }
    
    // Start render loop again
    if (!this.renderLoopManager.isRunning()) {
      this.startRenderLoop();
    }
    
    // Request immediate render
    this.renderLoopManager.requestRender();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Mark as disposed first to prevent any further operations
    this.disposed = true;

    // Cancel any deferred screenshot/stop callbacks so they never run after teardown
    this.pendingTimers.forEach((id) => clearTimeout(id));
    this.pendingTimers.clear();

    this.stopRenderLoop();

    // Dispose managers (resourceManager.dispose() already disposes and detaches
    // all scene contents, so no separate scene.clear() is needed here)
    this.modelManager.dispose();
    this.resourceManager.dispose();
    this.screenshotManager.dispose();

    // Dispose controls
    this.controls.dispose();

    // Dispose renderer
    this.renderer.dispose();

    // Update state
    this.stateManager.setDisposed();

    // Settle any captureStill waiter so its promise resolves to INVALID_STATE
    // instead of dangling after the listener map is cleared below.
    [...this.pendingCaptureSettlers].forEach((settle) => settle('disposed'));

    // Remove all event listeners
    this.events.removeAllListeners();
    this.stateManager.clearCallbacks();
  }
}