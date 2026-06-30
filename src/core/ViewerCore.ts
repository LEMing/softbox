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
import { IPathTracingService } from './services/IPathTracingService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService } from './services/ISceneSetupService';
import { SceneConfigurator } from './SceneConfigurator';
import { IFloorAlignmentService } from './services/IFloorAlignmentService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { SceneSerializer } from './utils/SceneSerializer';
import { hasInternalRenderer } from './interfaces/IRendererExtension';
import { StateManager } from './managers/StateManager';
import { ScreenshotManager } from './managers/ScreenshotManager';
import { ModelManager } from './managers/ModelManager';
import { ResourceManager } from './managers/ResourceManager';
import { ViewerState } from './entities/ViewerState';
import { DEFAULT_PATH_TRACING_SAMPLES } from './constants';

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
  private readonly pendingTimers: Set<ReturnType<typeof setTimeout>> = new Set();

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
  async loadModel(source: string | IObject3D): Promise<Result<void>> {
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
    this.options = { ...this.options, ...partial };
    if (partial.backgroundColor !== undefined) {
      this.applyBackgroundColor(partial.backgroundColor);
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
    if (this.camera.type === 'perspective' && 'aspect' in this.camera) {
      this.camera.aspect = width / height;
    }
    this.camera.updateProjectionMatrix();
    
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

    // Remove all event listeners
    this.events.removeAllListeners();
    this.stateManager.clearCallbacks();
  }
}