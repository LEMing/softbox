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
import { ViewerState } from './entities/ViewerState';
import { TypedEventEmitter } from '../events/EventEmitter';
import { ViewerEventMap } from './events/ViewerEvents';
import { ThreeViewerError, ErrorCode } from '../errors';
import { SimpleViewerOptions } from '../types/SimpleViewerOptions';
import { IPathTracingService } from './services/IPathTracingService';
import { IEnvironmentService } from './services/IEnvironmentService';
import { ISceneSetupService, ILightingOptions, IHelperOptions } from './services/ISceneSetupService';
import { IFloorAlignmentService } from './services/IFloorAlignmentService';
import { RenderLoopManager } from './utils/RenderLoopManager';
import { SceneSerializer, SerializedSceneState } from './utils/SceneSerializer';
import { MemoryMonitor } from './utils/MemoryMonitor';
import { hasGetInternalRenderer } from '../infrastructure/three/types/PathTracerTypes';

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
  private state: ViewerState;
  private readonly events: TypedEventEmitter<ViewerEventMap>;
  private readonly renderLoopManager: RenderLoopManager;
  private lastFrameTime: number = 0;
  private frameCount: number = 0;
  private stateChangeCallback?: (newState: ViewerState) => void;
  private pathTracingStartTime?: number;
  private screenshotElement: HTMLImageElement | null = null;
  private isShowingScreenshot: boolean = false;
  private screenshotResizeHandler?: () => void;
  private serializedSceneState?: SerializedSceneState;
  private lastModelUrl?: string;
  private pathTracingCompleteHandled: boolean = false;
  private disposed: boolean = false;

  // Dependencies
  private readonly renderer: IRenderer;
  private readonly scene: IScene;
  private readonly camera: ICamera;
  private readonly controls: IControls;
  private readonly modelLoader: IModelLoader;
  private readonly options: SimpleViewerOptions;
  private readonly rendererOptions?: IRendererOptions;
  private readonly sceneSetupService?: ISceneSetupService;
  private environmentService?: IEnvironmentService;
  private pathTracingService?: IPathTracingService;
  private readonly floorAlignmentService?: IFloorAlignmentService;

  constructor(dependencies: ViewerDependencies) {
    this.renderer = dependencies.renderer;
    this.scene = dependencies.scene;
    this.camera = dependencies.camera;
    this.controls = dependencies.controls;
    this.modelLoader = dependencies.modelLoader;
    this.options = dependencies.options;
    this.rendererOptions = dependencies.rendererOptions;
    this.sceneSetupService = dependencies.sceneSetupService;
    this.environmentService = dependencies.environmentService;
    this.pathTracingService = dependencies.pathTracingService;
    this.floorAlignmentService = dependencies.floorAlignmentService;


    this.state = new ViewerState();
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

      // Setup scene
      if (this.sceneSetupService) {
        // Add helpers
        if (this.options.helpers) {
          const helperOptions: IHelperOptions = {
            grid: typeof this.options.helpers.grid === 'boolean' ? this.options.helpers.grid : !!this.options.helpers.grid,
            axes: typeof this.options.helpers.axes === 'boolean' ? this.options.helpers.axes : !!this.options.helpers.axes,
            gridColor: '#AAAAAA', // Default grid color
          };
          const helpersResult = this.sceneSetupService.addHelpers(this.scene, helperOptions);
          if (!helpersResult.ok) {
            console.warn('Failed to add helpers:', helpersResult.error);
          }
        }

        // Add lighting
        const lightingConfig = this.options.lighting;
        if (lightingConfig) {
          const lightingOptions: ILightingOptions = {
            ambient: lightingConfig.ambientLight ? {
              color: String(lightingConfig.ambientLight.color),
              intensity: lightingConfig.ambientLight.intensity
            } : undefined,
            hemisphere: lightingConfig.hemisphereLight ? {
              skyColor: String(lightingConfig.hemisphereLight.skyColor),
              groundColor: String(lightingConfig.hemisphereLight.groundColor),
              intensity: lightingConfig.hemisphereLight.intensity
            } : undefined,
            directional: lightingConfig.directionalLight ? {
              color: String(lightingConfig.directionalLight.color),
              intensity: lightingConfig.directionalLight.intensity,
              position: Array.isArray(lightingConfig.directionalLight.position) 
                ? lightingConfig.directionalLight.position as [number, number, number]
                : undefined,
              castShadow: lightingConfig.directionalLight.castShadow,
              shadow: lightingConfig.directionalLight.shadow
            } : undefined,
          };
          const lightingResult = this.sceneSetupService.addLighting(this.scene, lightingOptions);
          if (!lightingResult.ok) {
            console.warn('Failed to add lighting:', lightingResult.error);
          }
        }

        // Set background color only if no environment map
        const envUrl = this.options.environment?.url;
        if (this.options.backgroundColor && !envUrl && this.sceneSetupService) {
          // Use the scene setup service to create gradient background with single color
          const backgroundResult = this.sceneSetupService.createGradientBackground(this.scene, {
            topColor: String(this.options.backgroundColor),
            bottomColor: String(this.options.backgroundColor)
          });
          if (!backgroundResult.ok) {
            console.warn('Failed to set background:', backgroundResult.error);
          }
        }
      }

      // Setup environment
      if (this.environmentService) {
        // Initialize environment service
        const envInitResult = await this.environmentService.initialize({
          renderer: this.renderer,
          autoDispose: true
        });
        if (!envInitResult.ok) {
          console.warn('Failed to initialize environment service:', envInitResult.error);
        }

        // Load environment map if specified
        const envUrl = this.options.environment?.url;
        if (envUrl) {
          const envResult = await this.environmentService.loadEnvironmentMap(envUrl);
          if (envResult.ok) {
            // Apply environment map to both background and reflections
            this.environmentService.applyToScene(this.scene, envResult.value);
          } else {
            console.warn('Failed to load environment map:', envResult.error);
          }
        } else if (this.options.helpers?.studioEnvironment) {
          // Create studio environment
          const studioResult = this.environmentService.createStudioEnvironment();
          if (studioResult.ok) {
            this.environmentService.applyToScene(this.scene, studioResult.value);
          } else {
            console.warn('Failed to create studio environment:', studioResult.error);
          }
        }
      }

      // Initialize path tracing if enabled
      const pathTracingEnabledInit = this.options.pathTracing?.enabled ?? false;
      if (this.pathTracingService && pathTracingEnabledInit) {
        const pathTracingResult = await this.pathTracingService.initialize({
          enabled: true,
          renderer: this.renderer
        });
        
        if (!pathTracingResult.ok) {
          console.warn('Failed to initialize path tracing:', pathTracingResult.error);
        } else {
          // Update path tracing settings
          if (this.options.pathTracing) {
            this.pathTracingService.updateSettings({
              samples: this.options.pathTracing.maxSamples ?? 300,
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
            setTimeout(() => {
              this.renderLoopManager.stop();
            }, 100);
          });
        }
      }

      // Update state
      this.state = this.state.setInitialized();

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
      this.state = this.state.setError(viewerError);
      this.events.emit('error', { error: viewerError });
      return Result.err(viewerError);
    }
  }

  /**
   * Load a 3D model
   */
  async loadModel(source: string | IObject3D): Promise<Result<void>> {

    if (!this.state.canLoad()) {
      return Result.err(
        new ThreeViewerError(
          'Cannot load model in current state',
          ErrorCode.INVALID_STATE,
          { currentState: this.state.status, isInitialized: this.state.isInitialized }
        )
      );
    }

    try {
      this.state = this.state.startLoading();
      const startTime = performance.now();

      let model: IObject3D;

      if (typeof source === 'string') {
        // Store URL for potential restoration
        this.lastModelUrl = source;
        // Load from URL
        const loadResult = await this.modelLoader.load(source);
        if (!loadResult.ok) {
          throw loadResult.error;
        }
        model = loadResult.value.scene;
      } else {
        // Use provided object
        model = source;
      }

      // Clear existing model
      if (this.state.currentModel) {
        this.scene.remove(this.state.currentModel);
        this.state.currentModel.dispose();
      }

      // Add new model to scene
      const addResult = this.scene.add(model);
      if (!addResult.ok) {
        throw addResult.error;
      }


      // Align model to floor
      if (this.floorAlignmentService) {
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

      // Update state
      this.state = this.state.setLoaded(model);

      // Add dynamic grid based on object size
      if (this.sceneSetupService) {
        const gridResult = this.sceneSetupService.addDynamicGrid(this.scene, model, 2);
        if (!gridResult.ok) {
          console.warn('Failed to add dynamic grid:', gridResult.error);
        }
      }

      // Auto-fit camera to object if enabled
      if (this.options.camera?.autoFitToObject && this.sceneSetupService) {
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
      this.events.emit('model:loaded', { model, loadTime });

      // Request render after model load
      this.renderLoopManager.requestRender();
      
      // Reset path tracing when new model is loaded
      const pathTracingEnabledForReset = this.options.pathTracing?.enabled ?? false;
      if (this.pathTracingService && pathTracingEnabledForReset) {
        this.pathTracingService.reset();
        this.pathTracingCompleteHandled = false;
      }

      return Result.ok(undefined);
    } catch (error) {
      const viewerError = error instanceof ThreeViewerError ? error :
        new ThreeViewerError(
          'Failed to load model',
          ErrorCode.MODEL_LOAD_FAILED,
          { originalError: error, source }
        );

      this.state = this.state.setError(viewerError);
      this.events.emit('model:error', {
        error: viewerError,
        url: typeof source === 'string' ? source : undefined
      });

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
      if (!this.state.isInitialized || this.state.status === 'error') {
        return;
      }
      
      // Additional safety check - if renderer is disposed, stop the loop
      if (!this.renderer || (this.renderer as unknown as { renderer: null | unknown }).renderer === null) {
        this.renderLoopManager.stop();
        return;
      }
      
      // Debug: log when render callback is called
      if (this.frameCount % 60 === 0) { // Log every 60 frames to avoid spam
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
      const maxSamples = this.options.pathTracing?.maxSamples ?? 300;
      
      // Only render if RenderLoopManager says we need to
      // The manager already handled all the logic about when to render
      // Render frame
      this.renderFrame().catch(error => {
        console.error('[ViewerCore] Render frame error:', error);
      });
      
      // Check if path tracing just completed AFTER rendering
      const currentSampleCount = this.pathTracingService?.getSampleCount() || 0;
      
      // Path tracing just completed if we've reached max samples and haven't handled it yet
      // Note: The path tracing service disables itself during rendering, so we need to check
      // if we've just reached the max samples, not just the enabled state change
      if (currentSampleCount >= maxSamples && !this.pathTracingCompleteHandled && wasPathTracingActive) {
        
        // Mark as handled to prevent repeated events
        this.pathTracingCompleteHandled = true;
        
        this.renderLoopManager.disableContinuousRendering();
        
        // If using always render mode, disable it when path tracing completes
        if (!this.options.staticScene) {
          this.renderLoopManager.setAlwaysRender(false);
        }
        
        
        // Emit completion event
        this.events.emit('pathtracing:complete', {
          samples: pathTracingSamples,
          totalTime: currentTime - (this.pathTracingStartTime || 0)
        });
        
        // Replace with screenshot if enabled
        if (this.options.replaceWithScreenshotOnComplete) {
          setTimeout(() => {
            this.replaceWithScreenshot();
            // Stop the render loop after screenshot to prevent disposed service renders
            setTimeout(() => {
              this.renderLoopManager.stop();
            }, 200);
          }, 100);
        } else {
          // Path tracing complete but not replacing with screenshot
          // Ensure the final image stays visible by preventing any further renders
          
          // Request one final render to ensure the last frame is displayed
          this.renderLoopManager.requestRender();
          
          // Stop the render loop after final render
          setTimeout(() => {
            this.renderLoopManager.stop();
          }, 100);
          
          // The render loop is already stopped by disableContinuousRendering
          // The path tracing service has disabled autoClear to preserve the image
          // Just ensure we don't accidentally clear it
          if (hasGetInternalRenderer(this.renderer)) {
            const threeRenderer = this.renderer.getInternalRenderer() as { autoClear: boolean };
            if (threeRenderer) {
              threeRenderer.autoClear = false;
            }
          }
        }
      }

      // Update render info
      this.frameCount++;
      this.state = this.state.updateRenderInfo({
        frameCount: this.frameCount,
        fps: Math.round(fps),
        lastRenderTime: performance.now() - currentTime,
      });
      
      this.lastFrameTime = currentTime;
    });
  }

  /**
   * Stop the render loop
   */
  private stopRenderLoop(): void {
    this.renderLoopManager.stop();
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
    if (this.isShowingScreenshot) {
      return;
    }

    this.state = this.state.startRendering();
    
    let renderResult;
    const pathTracingActiveInRender = this.pathTracingService?.isEnabled() || false;
    const pathTracingSamples = this.pathTracingService?.getSampleCount() || 0;
    const maxSamples = this.options.pathTracing?.maxSamples ?? 300;
    
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
  resize(width: number, height: number): void {
    // Skip if dimensions haven't actually changed
    const canvas = this.renderer.getDomElement();
    if (canvas.width === width && canvas.height === height) {
      return;
    }

    // Store current rendering state
    const wasPathTracingActive = this.pathTracingService?.isEnabled();
    
    // Check if path tracing service has an overlay displayed
    if (this.pathTracingService && this.pathTracingService.hasImageOverlay()) {
      // Remove the overlay to restore canvas
      this.pathTracingService.removeImageOverlay();
      
      // Reset path tracing to restart with new size
      this.pathTracingService.reset();
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
  getState(): ViewerState {
    return this.state;
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(callback: (state: ViewerState) => void): () => void {
    // Create a proxy to emit state changes
    const updateState = (newState: ViewerState) => {
      this.state = newState;
      callback(newState);
    };

    // Store the callback for potential future use
    this.stateChangeCallback = updateState;

    // Return unsubscribe function
    return () => {
      // Cleanup if needed
      this.stateChangeCallback = undefined;
    };
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
   * Replace the 3D scene with a screenshot
   */
  private replaceWithScreenshot(): void {
    if (this.isShowingScreenshot) return;

    const canvas = this.renderer.getDomElement();
    
    // Capture the current frame as a data URL
    const dataURL = canvas.toDataURL('image/png');
    
    // Create an image element
    const img = document.createElement('img');
    img.src = dataURL;
    img.style.position = 'absolute';
    img.style.top = '0';
    img.style.left = '0';
    img.style.width = '100%';
    img.style.height = '100%';
    img.style.pointerEvents = 'auto';
    img.style.cursor = 'grab';
    
    // Insert the image in place of the canvas
    const parent = canvas.parentElement;
    if (parent) {
      canvas.style.display = 'none';
      parent.appendChild(img);
      this.screenshotElement = img;
      this.isShowingScreenshot = true;
      
      // Add interaction listeners to restore 3D scene
      const restoreScene = () => {
        this.restoreFromScreenshot();
      };
      
      img.addEventListener('mousedown', restoreScene);
      img.addEventListener('touchstart', restoreScene);
      
      // Also restore on window resize
      const resizeHandler = () => {
        if (this.isShowingScreenshot) {
          this.restoreFromScreenshot();
        }
      };
      window.addEventListener('resize', resizeHandler);
      
      // Store the handler for cleanup using a WeakMap or class property
      // For now, store in instance
      this.screenshotResizeHandler = resizeHandler;
      
      
      // Only dispose scene resources if we successfully captured the screenshot
      // The screenshot preserves the final rendered image, so it's safe to dispose
      if (this.screenshotElement && this.screenshotElement.src) {
        this.disposeSceneResources();
      } else {
        console.warn('[ViewerCore] Screenshot capture failed, keeping scene resources');
      }
    }
  }

  /**
   * Restore the 3D scene from screenshot
   */
  private async restoreFromScreenshot(): Promise<void> {
    if (!this.isShowingScreenshot || !this.screenshotElement) return;
    
    
    const canvas = this.renderer.getDomElement();
    const parent = this.screenshotElement.parentElement;
    
    if (parent) {
      // Remove resize handler
      if (this.screenshotResizeHandler) {
        window.removeEventListener('resize', this.screenshotResizeHandler);
        this.screenshotResizeHandler = undefined;
      }
      
      // Remove screenshot and show canvas again
      parent.removeChild(this.screenshotElement);
      canvas.style.display = '';
      
      this.screenshotElement = null;
      this.isShowingScreenshot = false;
      
      
      // Renderer is still available - no need to re-initialize
      
      // Re-create services if they were disposed
      if (!this.pathTracingService && this.options.pathTracing?.enabled) {
        // Note: This is a limitation - we can't recreate the service here
        // Would need factory access or dependency injection
        console.warn('[ViewerCore] Cannot recreate path tracing service - feature disabled');
      }
      
      // Restore scene state
      if (this.serializedSceneState) {
        await SceneSerializer.restore(
          this.serializedSceneState,
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
  }

  /**
   * Dispose scene resources while keeping the screenshot
   */
  private disposeSceneResources(): void {
    MemoryMonitor.logMemoryUsage('Before disposal');
    
    // Stop render loop immediately
    this.renderLoopManager.stop();
    
    // Note: Path tracing image preservation is now handled differently
    // - When replaceWithScreenshotOnComplete is true, the screenshot captures the image
    // - When replaceWithScreenshotOnComplete is false, we keep autoClear disabled
    
    // Serialize scene state before disposal
    this.serializedSceneState = SceneSerializer.serialize(
      this.lastModelUrl,
      this.camera,
      this.controls,
      this.renderer.getDomElement()
    );
    
    // Don't dispose path tracing service here - it causes white screen
    // The service should remain available to display the final image
    // It will be disposed when the entire viewer is disposed
    if (this.pathTracingService) {
      // Keep the service active to preserve the final rendered image
      // This prevents the white screen issue when switching to screenshot
    }
    
    // Dispose environment service
    if (this.environmentService) {
      this.environmentService.dispose();
    }
    
    // Dispose model and all scene resources
    if (this.state.currentModel) {
      this.scene.remove(this.state.currentModel);
      this.disposeObject(this.state.currentModel);
      // Clear model from state
      this.state = new ViewerState().setInitialized();
    }
    
    // Clear and dispose entire scene
    this.scene.traverse((child) => {
      if ('geometry' in child && child.geometry) {
        (child.geometry as { dispose?: () => void }).dispose?.();
      }
      if ('material' in child && child.material) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat: { dispose?: () => void }) => {
            mat.dispose?.();
          });
        } else {
          (child.material as { dispose?: () => void }).dispose?.();
        }
      }
    });
    this.scene.clear();
    
    // Don't dispose renderer here - it's needed for path tracing to display the final image
    // The renderer will be disposed when the entire viewer is disposed
    
    
    // Force garbage collection hint (works in some environments)
    if ((globalThis as { gc?: () => void }).gc) {
      (globalThis as { gc?: () => void }).gc?.();
    }
    
    MemoryMonitor.logMemoryUsage('After disposal');
    
    // Schedule another check after potential GC
    setTimeout(() => {
      MemoryMonitor.logMemoryUsage('After GC delay');
    }, 2000);
  }
  
  /**
   * Recursively dispose of an object and its children
   */
  private disposeObject(object: IObject3D): void {
    object.traverse((child) => {
      if ('geometry' in child && (child as { geometry?: { dispose?: () => void } }).geometry?.dispose) {
        (child as { geometry?: { dispose?: () => void } }).geometry?.dispose?.();
      }
      if ('material' in child && (child as { material?: unknown }).material) {
        const material = (child as { material?: { dispose?: () => void } | Array<{ dispose?: () => void }> }).material;
        if (Array.isArray(material)) {
          material.forEach((mat: { dispose?: () => void }) => {
            mat.dispose?.();
          });
        } else if (material?.dispose) {
          material.dispose();
        }
      }
    });
    object.dispose();
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    // Mark as disposed first to prevent any further operations
    this.disposed = true;
    
    this.stopRenderLoop();

    // Dispose model
    if (this.state.currentModel) {
      this.scene.remove(this.state.currentModel);
      this.state.currentModel.dispose();
    }

    // Dispose services
    if (this.pathTracingService) {
      this.pathTracingService.dispose();
    }
    
    if (this.environmentService) {
      this.environmentService.dispose();
    }

    // Dispose scene
    this.scene.clear();

    // Dispose controls
    this.controls.dispose();

    // Dispose renderer
    this.renderer.dispose();

    // Update state
    this.state = this.state.dispose();

    // Remove all event listeners
    this.events.removeAllListeners();
  }

}
