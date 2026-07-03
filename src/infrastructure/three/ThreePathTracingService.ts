import { WebGLPathTracer } from 'three-gpu-pathtracer';
import * as THREE from 'three';
import {
  IPathTracingService,
  IPathTracingOptions,
  IPathTracingSettings
} from '../../core/services/IPathTracingService';
import { IRenderer } from '../../core/interfaces/IRenderer';
import { IScene } from '../../core/interfaces/IScene';
import { ICamera } from '../../core/interfaces/ICamera';
import { DEFAULT_PATH_TRACING_SAMPLES } from '../../core/constants';
import { Result } from '../../utils/Result';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { hasInternalRenderer } from '../../core/interfaces/IRendererExtension';
import {
  ExtendedWebGLPathTracer,
  PathTracingWebGLRenderer,
  PathTracingScene,
  hasGetInternalRenderer
} from './types/PathTracerTypes';
import { TypedEventEmitter } from '../../events/EventEmitter';

export class ThreePathTracingService implements IPathTracingService {
  /**
   * Convert an HTMLImageElement-based texture to a DataTexture for path tracing
   */
  private convertToDataTexture(texture: THREE.Texture): THREE.DataTexture | null {
    if (!texture.image || !(texture.image instanceof HTMLImageElement)) {
      // Already a data texture or not an image
      return null;
    }

    const image = texture.image as HTMLImageElement;

    // Create a canvas to extract pixel data
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;

    const context = canvas.getContext('2d');
    if (!context) {
      return null;
    }

    // Draw the image to canvas
    context.drawImage(image, 0, 0);

    // Get pixel data
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

    // Convert to Float32Array for better precision
    const data = new Float32Array(imageData.data.length);
    for (let i = 0; i < imageData.data.length; i++) {
      data[i] = imageData.data[i] / 255.0; // Normalize to 0-1 range
    }

    // Create DataTexture
    const dataTexture = new THREE.DataTexture(
      data,
      canvas.width,
      canvas.height,
      THREE.RGBAFormat,
      THREE.FloatType
    );

    // Copy properties from original texture
    dataTexture.mapping = texture.mapping;
    dataTexture.wrapS = texture.wrapS;
    dataTexture.wrapT = texture.wrapT;
    dataTexture.magFilter = texture.magFilter;
    dataTexture.minFilter = texture.minFilter;
    dataTexture.anisotropy = texture.anisotropy;
    dataTexture.needsUpdate = true;


    return dataTexture;
  }

  private pathTracer: ExtendedWebGLPathTracer | null = null;
  private settings: IPathTracingSettings;
  private enabled: boolean = false;
  private renderer: IRenderer | null = null;
  private sampleCount: number = 0;
  private createAttempts: number = 0;
  private maxCreateAttempts: number = 10;
  private sceneInitialized: boolean = false;
  private environmentWaitFrames: number = 0;
  private maxEnvironmentWaitFrames: number = 300; // Wait up to ~5 seconds at 60fps
  private disposed: boolean = false;
  private disposeTimer: ReturnType<typeof setTimeout> | null = null;
  private convertedEnvTexture: THREE.DataTexture | null = null; // Store converted texture for reuse and disposal
  private lastResetTime: number = 0; // Track when we last reset to avoid too frequent resets
  public readonly events = new TypedEventEmitter<{ 'pathtracing:paused': { samples: number } }>();

  constructor() {
    this.settings = {
      samples: DEFAULT_PATH_TRACING_SAMPLES,
      bounces: 4, // Reduce bounces for better performance
      transmissiveBounces: 2, // Reduce transmissive bounces
      renderScale: 0.5, // Start with lower resolution for better performance
      lowResScale: 0.5,
      dynamicLowRes: true,
      enablePathTracing: true,
    };
  }

  async initialize(options: IPathTracingOptions): Promise<Result<void>> {
    try {
      this.renderer = options.renderer;
      this.enabled = options.enabled;


      if (!this.isSupported()) {
        return Result.err(
          new ThreeViewerError(
            'Path tracing is not supported in this environment',
            ErrorCode.PATH_TRACING_INIT_FAILED,
            { reason: 'WebGL2 or required extensions not available' }
          )
        );
      }

      // Defer path tracer creation until first render when renderer is ready
      // if (this.enabled) {
      //   const result = this.createPathTracer();
      //   if (!result.ok) {
      //     return result;
      //   }
      // }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to initialize path tracing',
          ErrorCode.PATH_TRACING_INIT_FAILED,
          { originalError: error }
        )
      );
    }
  }

  private createPathTracer(): Result<void> {
    if (this.disposed) {
      return Result.err(
        new ThreeViewerError(
          'Instance is disposed',
          ErrorCode.INVALID_STATE
        )
      );
    }

    try {
      // Get the Three.js renderer using the type-safe interface
      let threeRenderer: THREE.WebGLRenderer | null = null;


      // Try multiple times to get the renderer in case it's still initializing
      let attempts = 0;
      while (!threeRenderer && attempts < 3) {
        if (hasGetInternalRenderer(this.renderer)) {
          threeRenderer = this.renderer.getInternalRenderer() as THREE.WebGLRenderer;
        }

        if (!threeRenderer && attempts < 2) {
          // Wait a bit for renderer to initialize
          return Result.err(
            new ThreeViewerError(
              'Renderer not ready, will retry',
              ErrorCode.RENDERER_NOT_INITIALIZED
            )
          );
        }
        attempts++;
      }

      if (!threeRenderer) {
        return Result.err(
          new ThreeViewerError(
            'Three.js renderer not available',
            ErrorCode.RENDERER_NOT_INITIALIZED
          )
        );
      }

      this.pathTracer = new WebGLPathTracer(threeRenderer) as ExtendedWebGLPathTracer;

      // Configure the path tracer
      // Use tiles for better performance - start with 1x1 for faster initial render
      if (this.pathTracer.tiles && 'set' in this.pathTracer.tiles) {
        this.pathTracer.tiles.set(1, 1); // Single tile for faster first frame
      }
      this.pathTracer.bounces = this.settings.bounces;

      if (this.settings.transmissiveBounces !== undefined) {
        this.pathTracer.transmissiveBounces = this.settings.transmissiveBounces;
      }

      this.pathTracer.renderScale = this.settings.renderScale;
      this.pathTracer.dynamicLowRes = this.settings.dynamicLowRes;
      this.pathTracer.lowResScale = this.settings.lowResScale;

      // Set environment intensity for brighter lighting
      if (this.pathTracer.environmentIntensity !== undefined) {
        this.pathTracer.environmentIntensity = 2.0; // Increase environment contribution
      }

      // Enable tone mapping for path tracing
      if (threeRenderer.toneMapping !== THREE.ACESFilmicToneMapping) {
        threeRenderer.toneMapping = THREE.ACESFilmicToneMapping;
        threeRenderer.toneMappingExposure = 1.5; // Increase exposure for brighter output
      }

      // IMPORTANT: Disable autoClear for path tracing to work properly
      // The path tracer accumulates samples over multiple frames
      threeRenderer.autoClear = false;

      // Ensure the renderer is rendering to the screen (null render target)
      threeRenderer.setRenderTarget(null);

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to create path tracer',
          ErrorCode.PATH_TRACING_INIT_FAILED,
          { originalError: error }
        )
      );
    }
  }

  setEnabled(enabled: boolean): void {
    // Only update if actually changing
    if (this.enabled === enabled) {
      return;
    }

    this.enabled = enabled;
    if (!enabled) {
      this.reset();
      this.sceneInitialized = false;

      // Clear the path tracing flag so standard renderer can work again
      const threeRenderer = hasGetInternalRenderer(this.renderer) ? this.renderer.getInternalRenderer() as PathTracingWebGLRenderer : null;
      if (threeRenderer) {
        threeRenderer.__pathTracingActive = false;
        threeRenderer.autoClear = true; // Re-enable autoClear for standard rendering
      }
    }
    // Path tracer will be created on first render if enabled
  }

  updateSettings(settings: Partial<IPathTracingSettings>): void {
    this.settings = { ...this.settings, ...settings };

    // Update enabled state if provided
    if (settings.enablePathTracing !== undefined) {
      this.setEnabled(settings.enablePathTracing);
    }

    if (this.pathTracer) {
      if (settings.bounces !== undefined) {
        this.pathTracer.bounces = settings.bounces;
      }
      if (settings.transmissiveBounces !== undefined) {
        this.pathTracer.transmissiveBounces = settings.transmissiveBounces;
      }
      if (settings.renderScale !== undefined) {
        this.pathTracer.renderScale = settings.renderScale;
      }
      if (settings.lowResScale !== undefined) {
        this.pathTracer.lowResScale = settings.lowResScale;
      }
      if (settings.dynamicLowRes !== undefined) {
        this.pathTracer.dynamicLowRes = settings.dynamicLowRes;
      }
    }
  }

  async render(scene: IScene, camera: ICamera): Promise<Result<void>> {
    // Check if instance is disposed
    if (this.disposed) {
      return Result.ok(undefined);
    }


    // Check if we have a renderer for fallback
    if (!this.renderer) {
      return Result.ok(undefined);
    }

    if (!this.enabled) {
      return this.renderWhileDisabled(scene, camera);
    }

    // Create path tracer on first render if not already created
    if (!this.pathTracer) {

      // Increment attempts
      this.createAttempts++;

      const createResult = this.createPathTracer();
      if (!createResult.ok) {

        // If we haven't exceeded max attempts and it's a "not ready" error, keep trying
        if (this.createAttempts < this.maxCreateAttempts &&
            createResult.error?.message === 'Renderer not ready, will retry') {
          // Fallback to standard renderer for this frame
          return this.renderer.render(scene, camera);
        } else {
          // Max attempts reached or different error, disable path tracing
          this.enabled = false;
          this.createAttempts = 0;

          // Fallback to standard renderer
          const rendererResult = this.renderer.render(scene, camera);
          if (!rendererResult.ok) {
            // Return the error result from the standard renderer
            return rendererResult;
          }
          return rendererResult;
        }
      }

      // Reset attempts on success
      this.createAttempts = 0;
    }

    try {
      // Extract Three.js objects from adapters using type-safe interface
      let threeScene: THREE.Scene | null = null;
      let threeCamera: THREE.Camera | null = null;

      // Get Three.js scene
      if (scene && hasInternalRenderer<THREE.Scene>(scene)) {
        threeScene = scene.getInternalRenderer() as THREE.Scene;
      }

      // Get Three.js camera
      if (camera && hasInternalRenderer<THREE.Camera>(camera)) {
        threeCamera = camera.getInternalRenderer() as THREE.Camera;
      }

      if (!threeScene || !threeCamera) {
        return Result.err(
          new ThreeViewerError(
            'Could not extract Three.js scene or camera',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      // Initialize scene if not already done or if environment wasn't ready before
      if (!this.sceneInitialized) {

        try {
          // Check if environment texture is available
          const originalEnvTexture = (threeScene as PathTracingScene).__originalEnvironmentTexture;
          if (!threeScene.environment && !originalEnvTexture) {
            this.environmentWaitFrames++;

            // If we've waited too long, disable path tracing
            if (this.environmentWaitFrames >= this.maxEnvironmentWaitFrames) {
              this.enabled = false;
              this.environmentWaitFrames = 0;
            }

            // Don't fail - just skip this frame and render with standard renderer
            // Keep trying on subsequent frames until environment is loaded
            return this.renderer.render(scene, camera);
          }

          this.environmentWaitFrames = 0; // Reset counter

          // Use the original equirectangular texture for path tracing if available
          let textureForPathTracing: THREE.Texture | null = null;
          if (originalEnvTexture && originalEnvTexture.mapping === THREE.EquirectangularReflectionMapping) {

            // Convert HTMLImageElement texture to DataTexture if needed
            textureForPathTracing = originalEnvTexture;
            if (originalEnvTexture.image instanceof HTMLImageElement) {
              // Reuse existing converted texture if available
              if (this.convertedEnvTexture) {
                textureForPathTracing = this.convertedEnvTexture;
              } else {
                const dataTexture = this.convertToDataTexture(originalEnvTexture);
                if (dataTexture) {
                  this.convertedEnvTexture = dataTexture; // Store for reuse
                  textureForPathTracing = dataTexture;
                } else {
                  throw new Error('Failed to convert environment texture to DataTexture');
                }
              }
            }

            // Temporarily set the environment to the converted texture for path tracing
            const currentEnv = threeScene.environment;
            threeScene.environment = textureForPathTracing;

            try {
              // Log scene contents before setting

              // For JPEG/PNG textures loaded via TextureLoader, ensure the image is loaded
              const texImage = originalEnvTexture.image as HTMLImageElement | (ImageData & { data?: unknown }) | null;
              if (texImage && !("data" in texImage && texImage.data)) {

                // If it's an HTMLImageElement, wait for it to load
                if (texImage instanceof HTMLImageElement && !texImage.complete) {
                  await new Promise<void>((resolve) => {
                    texImage.onload = () => {
                      originalEnvTexture.needsUpdate = true;
                      resolve();
                    };
                    texImage.onerror = (_error: Event | string) => {
                      resolve();
                    };
                    // If already loading, it should fire the onload event
                    if (texImage.complete) {
                      resolve();
                    }
                  });
                }
              }

              if (this.pathTracer) {
                this.pathTracer.setScene(threeScene, threeCamera);
              }
              this.sceneInitialized = true;

              // Restore the PMREM environment for regular rendering
              threeScene.environment = currentEnv;

              // Don't dispose the DataTexture here - we'll reuse it
            } catch (setSceneError) {
              // Restore environment on error too
              threeScene.environment = currentEnv;

              throw setSceneError;
            }
          } else if (threeScene.environment?.mapping === THREE.EquirectangularReflectionMapping) {
            // Already have equirectangular texture
            // Log scene contents before setting
            if (this.pathTracer) {
              this.pathTracer.setScene(threeScene, threeCamera);
            }
            this.sceneInitialized = true;
          } else {
            // PMREM texture but no original available - this will likely fail
            // Disable path tracing
            this.enabled = false;
            return this.renderer.render(scene, camera);
          }
        } catch (error) {
          // Don't disable path tracing yet - we might succeed on next try
          // Just fallback to standard renderer for this frame
          console.warn('Scene initialization error:', error);
          return this.renderer.render(scene, camera);
        }
      }

      // Only proceed with path tracing if scene was successfully initialized
      if (this.sceneInitialized) {
        // Update lights on first sample
        if (this.sampleCount === 0) {

          // Update lights
          try {
            if (this.pathTracer) {
              this.pathTracer.updateLights();
            }
          } catch (lightError) {
            // Continue even if light update fails - path tracing can still work
            console.warn('Failed to update lights for path tracing:', lightError);
          }
        }

        // First, render with standard renderer to show immediate feedback
        
        // Render with standard renderer first
        const standardRenderResult = this.renderer.render(scene, camera);
        if (!standardRenderResult.ok) {
          return standardRenderResult;
        }
        
        // Accumulate one path-tracing sample into the internal buffer
        this.accumulateOneSample();

        // Only increment sample count after a successful render
        this.sampleCount++;

        if (this.sampleCount === this.settings.samples) {
          return this.captureCompletedFrame();
        }
      } else {
        // Scene not initialized yet - fallback to standard renderer
        return this.renderer.render(scene, camera);
      }

      // CRITICAL: The path tracer has rendered to the canvas
      // We must NOT call the standard renderer after this or it will overwrite the path traced output
      // Mark that we've handled the rendering completely
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to render with path tracing',
          ErrorCode.RENDER_FAILED,
          { originalError: error }
        )
      );
    }
  }

  /**
   * Render while path tracing is disabled: keep the final accumulated image on
   * screen if we just completed, otherwise delegate to the standard renderer.
   */
  private renderWhileDisabled(scene: IScene, camera: ICamera): Result<void> {
    if (!this.renderer) {
      return Result.ok(undefined);
    }

    const completed = this.sampleCount >= this.settings.samples && this.sampleCount > 0;
    if (completed) {
      if (this.pathTracer && hasGetInternalRenderer(this.renderer)) {
        const threeRenderer = this.renderer.getInternalRenderer() as PathTracingWebGLRenderer;
        threeRenderer.setRenderTarget(null);
      }
      return Result.ok(undefined);
    }

    return this.renderer.render(scene, camera);
  }

  /**
   * Render a single path-tracing sample into the internal buffer, preserving the
   * renderer's autoClear/render-target state so the standard view stays visible.
   */
  private accumulateOneSample(): void {
    const threeRenderer = hasGetInternalRenderer(this.renderer)
      ? this.renderer.getInternalRenderer() as PathTracingWebGLRenderer
      : null;
    if (!threeRenderer) {
      throw new Error('Three.js renderer not available');
    }

    const originalAutoClear = threeRenderer.autoClear;
    const originalRenderTarget = threeRenderer.getRenderTarget();

    threeRenderer.autoClear = false;
    if (this.pathTracer) {
      this.pathTracer.renderSample();
    }
    threeRenderer.autoClear = originalAutoClear;
    threeRenderer.setRenderTarget(originalRenderTarget);
  }

  /**
   * Path tracing reached its sample target: present the accumulated result on
   * the canvas, emit completion, and schedule disposal. The final image stays on
   * the canvas (kept by the renderer); presenting any DOM overlay is the
   * presentation layer's concern, not this service's.
   */
  private captureCompletedFrame(): Result<void> {
    const threeRenderer = hasGetInternalRenderer(this.renderer)
      ? this.renderer.getInternalRenderer() as PathTracingWebGLRenderer
      : null;
    if (threeRenderer && this.pathTracer) {
      try {
        const originalAutoClear = threeRenderer.autoClear;
        threeRenderer.autoClear = true;
        threeRenderer.setRenderTarget(null);
        threeRenderer.clear(true, true, true);

        // Copy the accumulated path-traced buffer to screen.
        const copyQuad = this.pathTracer.copyQuad as { render: (renderer: THREE.WebGLRenderer) => void } | undefined;
        if (copyQuad && typeof copyQuad.render === 'function') {
          copyQuad.render(threeRenderer);
        } else {
          // Fallback: one more sample renders the result to screen.
          threeRenderer.autoClear = false;
          this.pathTracer.renderSample();
        }

        threeRenderer.autoClear = originalAutoClear;
      } catch (error) {
        // Path tracing is still complete even if presenting the frame fails.
        console.warn('Failed to present path traced result:', error);
      }
    }

    this.enabled = false;
    this.events.emit('pathtracing:paused', { samples: this.sampleCount });

    // Dispose path-tracing resources shortly after, once the image is displayed.
    this.disposeTimer = setTimeout(() => {
      this.disposeTimer = null;
      if (this.disposed) {
        return;
      }
      this.disposePathTracingResources();
    }, 100);

    return Result.ok(undefined);
  }

  getSampleCount(): number {
    return this.sampleCount;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Check if path tracer has been disposed after completion
   */
  isPathTracerDisposed(): boolean {
    // Only return true if we've actually disposed the service
    // Not if the path tracer just hasn't been created yet
    return this.disposed;
  }

  reset(): void {
    const now = performance.now();
    // Light throttling to avoid rapid resets but still allow responsive updates
    if (now - this.lastResetTime < 50) { // Don't reset more than once per 50ms
      return;
    }

    this.lastResetTime = now;
    this.sampleCount = 0;
    if (this.pathTracer) {
      this.pathTracer.reset();
      // Force scene re-initialization after reset to update camera and materials
      this.sceneInitialized = false;
    }
    // Don't reset createAttempts here as we want to keep trying
  }

  /**
   * Dispose of path tracing resources after the final frame is on screen
   */
  private disposePathTracingResources(): void {
    
    // Dispose of the path tracer
    if (this.pathTracer) {
      try {
        this.pathTracer.dispose();
      } catch (error) {
        // Continue disposal even if path tracer disposal fails
        console.warn('Failed to dispose path tracer:', error);
      }
      this.pathTracer = null;
    }
    
    // Dispose of converted environment texture
    if (this.convertedEnvTexture) {
      this.convertedEnvTexture.dispose();
      this.convertedEnvTexture = null;
    }
    
    // Clear the path tracing flag
    if (this.renderer) {
      const threeRenderer = hasGetInternalRenderer(this.renderer) ? this.renderer.getInternalRenderer() as PathTracingWebGLRenderer : null;
      if (threeRenderer) {
        threeRenderer.__pathTracingActive = false;
        // Re-enable autoClear for standard rendering
        threeRenderer.autoClear = true;
      }
    }
    
    // Reset state
    this.sceneInitialized = false;
    this.createAttempts = 0;
    
  }

  dispose(): void {
    this.disposed = true;
    this.events.removeAllListeners();

    if (this.disposeTimer !== null) {
      clearTimeout(this.disposeTimer);
      this.disposeTimer = null;
    }

    // Clear the path tracing flag
    if (this.renderer) {
      const threeRenderer = hasGetInternalRenderer(this.renderer) ? this.renderer.getInternalRenderer() as PathTracingWebGLRenderer : null;
      if (threeRenderer) {
        threeRenderer.__pathTracingActive = false;
        // Don't re-enable autoClear here - it causes the screen to clear to white
        // The renderer's autoClear state should be managed by the ViewerCore
        // threeRenderer.autoClear = true;
      }
    }

    if (this.pathTracer) {
      try {
        this.pathTracer.dispose();
      } catch (error) {
        // Continue disposal even if path tracer disposal fails
        console.warn('Failed to dispose path tracer during service disposal:', error);
      }
      this.pathTracer = null;
    }

    // Dispose of converted environment texture
    if (this.convertedEnvTexture) {
      this.convertedEnvTexture.dispose();
      this.convertedEnvTexture = null;
    }

    this.sampleCount = 0;
    this.sceneInitialized = false;
    this.createAttempts = 0;
    this.renderer = null;
  }

  isSupported(): boolean {
    // Check for WebGL2 support
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2');
    return gl !== null;
  }
}
