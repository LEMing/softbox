import { WebGLPathTracer } from 'three-gpu-pathtracer';
import * as THREE from 'three';
import {
  IPathTracingService,
  IPathTracingOptions,
  IPathTracingSettings,
  PathTracingPausedEvent
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
import { CONTACT_SHADOW_HELPER_FLAG } from './ContactShadowBaker';

export class ThreePathTracingService implements IPathTracingService {
  /**
   * Hand the scene to the path tracer with the viewer's own contact-shadow
   * helpers hidden: the tracer computes physically-correct contact shadows
   * itself, so ingesting the baked disc double-darkens the contact area (and
   * the live ShadowMaterial catcher is equally meaningless to it). The
   * generator skips invisible nodes; visibility is restored right after the
   * ingest so the raster fallback path keeps its baked shadow.
   */
  private ingestSceneWithoutShadowHelpers(
    threeScene: THREE.Scene,
    threeCamera: THREE.Camera
  ): void {
    // Tag-based (not name-based): a consumer's GLB may legitimately contain a
    // node with any name, and getObjectByName's first depth-first match would
    // hide that node instead of the helper. The userData tag is viewer-owned.
    const helpers: THREE.Object3D[] = [];
    threeScene.traverse((object) => {
      if (object.userData?.[CONTACT_SHADOW_HELPER_FLAG] && object.visible) {
        helpers.push(object);
      }
    });
    helpers.forEach((object) => (object.visible = false));
    try {
      this.pathTracer?.setScene(threeScene, threeCamera);
    } finally {
      helpers.forEach((object) => (object.visible = true));
    }
  }

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
  public readonly events = new TypedEventEmitter<{ 'pathtracing:paused': PathTracingPausedEvent }>();

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

      // Path tracer creation is deferred until the first render(), once the
      // renderer is guaranteed ready.
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
      // Get the Three.js renderer using the type-safe interface. The renderer
      // may not be ready on the very first render() call after initialize();
      // the caller (ensurePathTracerCreated) retries on subsequent frames.
      const threeRenderer = hasGetInternalRenderer(this.renderer)
        ? this.renderer.getInternalRenderer() as THREE.WebGLRenderer
        : null;
      if (!threeRenderer) {
        return Result.err(
          new ThreeViewerError(
            'Renderer not ready, will retry',
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

      const threeRenderer = hasGetInternalRenderer(this.renderer) ? this.renderer.getInternalRenderer() as PathTracingWebGLRenderer : null;
      if (threeRenderer) {
        threeRenderer.autoClear = true; // Re-enable autoClear for standard rendering
      }
    }
    // Path tracer will be created on first render if enabled
  }

  /**
   * The service gives up on the CURRENT accumulation on its own (sample
   * target reached, renderer never became ready, environment texture never
   * arrived) — as opposed to `setEnabled(false)`, which is the consumer
   * turning path tracing off entirely. Every such self-pause must emit
   * 'pathtracing:paused' so PathTracingCoordinator releases the 'path-tracing'
   * continuous-render reason; skipping it left the render loop demanding
   * frames forever and callers awaiting 'pathtracing:complete' hanging.
   */
  private disableAfterSelfPause(reason: PathTracingPausedEvent['reason']): void {
    this.enabled = false;
    this.events.emit('pathtracing:paused', { samples: this.sampleCount, reason });
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
    if (this.disposed) {
      return Result.ok(undefined);
    }

    const renderer = this.renderer;
    if (!renderer) {
      return Result.ok(undefined);
    }

    if (!this.enabled) {
      return this.renderWhileDisabled(scene, camera);
    }

    if (!this.pathTracer) {
      const creationOutcome = this.ensurePathTracerCreated(renderer, scene, camera);
      if (creationOutcome) {
        return creationOutcome;
      }
    }

    try {
      const objects = this.extractThreeObjects(scene, camera);
      if (!objects) {
        return Result.err(
          new ThreeViewerError(
            'Could not extract Three.js scene or camera',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }
      const { threeScene, threeCamera } = objects;

      if (!this.sceneInitialized) {
        const initOutcome = await this.initializeSceneForPathTracing(
          renderer, scene, camera, threeScene, threeCamera
        );
        if (initOutcome) {
          return initOutcome;
        }
      }

      if (!this.sceneInitialized) {
        // Scene not initialized yet - fallback to standard renderer
        return renderer.render(scene, camera);
      }

      // The path tracer renders to the canvas itself; the standard renderer
      // must not run again this frame or it will overwrite the accumulated output.
      return this.accumulateSample(renderer, scene, camera);
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
   * Creates the path tracer lazily on first use (it needs a ready renderer,
   * which may not exist yet on the very first render() call). Returns null to
   * continue into this frame's render once a tracer exists; returns a Result
   * when render() should return it immediately instead — a fallback frame
   * while still waiting for the renderer, or after giving up and disabling.
   */
  private ensurePathTracerCreated(
    renderer: IRenderer, scene: IScene, camera: ICamera
  ): Result<void> | null {
    this.createAttempts++;
    const createResult = this.createPathTracer();
    if (createResult.ok) {
      this.createAttempts = 0;
      return null;
    }

    if (
      this.createAttempts < this.maxCreateAttempts &&
      createResult.error?.message === 'Renderer not ready, will retry'
    ) {
      return renderer.render(scene, camera);
    }

    this.disableAfterSelfPause('gave-up');
    this.createAttempts = 0;
    return renderer.render(scene, camera);
  }

  /** Unwraps the Three.js scene/camera from their adapters, or null if either fails. */
  private extractThreeObjects(
    scene: IScene, camera: ICamera
  ): { threeScene: THREE.Scene; threeCamera: THREE.Camera } | null {
    let threeScene: THREE.Scene | null = null;
    let threeCamera: THREE.Camera | null = null;

    if (hasInternalRenderer<THREE.Scene>(scene)) {
      threeScene = scene.getInternalRenderer() as THREE.Scene;
    }
    if (hasInternalRenderer<THREE.Camera>(camera)) {
      threeCamera = camera.getInternalRenderer() as THREE.Camera;
    }

    if (!threeScene || !threeCamera) {
      return null;
    }
    return { threeScene, threeCamera };
  }

  /**
   * First-frame setup: waits for an environment texture, converts an
   * equirectangular one to a format the tracer can read if needed, and calls
   * pathTracer.setScene() once ready. Returns null to continue into
   * accumulation this frame (sceneInitialized just became true); returns a
   * Result when render() should return it immediately instead — still
   * waiting, or the environment shape isn't one the tracer can use.
   */
  private async initializeSceneForPathTracing(
    renderer: IRenderer,
    scene: IScene,
    camera: ICamera,
    threeScene: THREE.Scene,
    threeCamera: THREE.Camera
  ): Promise<Result<void> | null> {
    try {
      const originalEnvTexture = (threeScene as PathTracingScene).__originalEnvironmentTexture;
      if (!threeScene.environment && !originalEnvTexture) {
        this.environmentWaitFrames++;
        if (this.environmentWaitFrames >= this.maxEnvironmentWaitFrames) {
          this.disableAfterSelfPause('gave-up');
          this.environmentWaitFrames = 0;
        }
        // Don't fail - just skip this frame and render with the standard
        // renderer. Keep trying on subsequent frames until the environment loads.
        return renderer.render(scene, camera);
      }

      this.environmentWaitFrames = 0;

      if (originalEnvTexture && originalEnvTexture.mapping === THREE.EquirectangularReflectionMapping) {
        // Use the original equirectangular texture for path tracing, converting
        // an HTMLImageElement-backed texture to a DataTexture the tracer can read.
        let textureForPathTracing: THREE.Texture = originalEnvTexture;
        if (originalEnvTexture.image instanceof HTMLImageElement) {
          if (this.convertedEnvTexture) {
            textureForPathTracing = this.convertedEnvTexture;
          } else {
            const dataTexture = this.convertToDataTexture(originalEnvTexture);
            if (!dataTexture) {
              throw new Error('Failed to convert environment texture to DataTexture');
            }
            this.convertedEnvTexture = dataTexture;
            textureForPathTracing = dataTexture;
          }
        }

        // Temporarily set the environment to the converted texture for path tracing.
        const currentEnv = threeScene.environment;
        threeScene.environment = textureForPathTracing;

        try {
          // For JPEG/PNG textures loaded via TextureLoader, ensure the image is loaded.
          const texImage = originalEnvTexture.image as HTMLImageElement | (ImageData & { data?: unknown }) | null;
          if (texImage && !("data" in texImage && texImage.data)) {
            if (texImage instanceof HTMLImageElement && !texImage.complete) {
              await new Promise<void>((resolve) => {
                texImage.onload = () => {
                  originalEnvTexture.needsUpdate = true;
                  resolve();
                };
                texImage.onerror = () => {
                  resolve();
                };
                if (texImage.complete) {
                  resolve();
                }
              });
            }
          }

          this.ingestSceneWithoutShadowHelpers(threeScene, threeCamera);
          this.sceneInitialized = true;

          // Restore the PMREM environment for regular rendering. Don't dispose
          // the DataTexture here - it's reused across frames.
          threeScene.environment = currentEnv;
        } catch (setSceneError) {
          threeScene.environment = currentEnv;
          throw setSceneError;
        }
      } else if (threeScene.environment?.mapping === THREE.EquirectangularReflectionMapping) {
        // Already an equirectangular texture — usable as-is.
        this.ingestSceneWithoutShadowHelpers(threeScene, threeCamera);
        this.sceneInitialized = true;
      } else {
        // PMREM texture with no original equirectangular source: the tracer
        // can't consume it, so this accumulation can never start.
        this.disableAfterSelfPause('gave-up');
        return renderer.render(scene, camera);
      }
    } catch (error) {
      // Don't disable path tracing yet - we might succeed on the next try.
      console.warn('Scene initialization error:', error);
      return renderer.render(scene, camera);
    }

    return null;
  }

  /**
   * Accumulates one more sample once the scene is ready to path-trace: updates
   * lights on the very first sample, renders a standard frame for immediate
   * feedback, accumulates a tracer sample, and detects completion.
   */
  private accumulateSample(renderer: IRenderer, scene: IScene, camera: ICamera): Result<void> {
    if (this.sampleCount === 0) {
      try {
        this.pathTracer?.updateLights();
      } catch (lightError) {
        // Continue even if light update fails - path tracing can still work.
        console.warn('Failed to update lights for path tracing:', lightError);
      }
    }

    // Render with the standard renderer first for immediate feedback.
    const standardRenderResult = renderer.render(scene, camera);
    if (!standardRenderResult.ok) {
      return standardRenderResult;
    }

    this.accumulateOneSample();
    this.sampleCount++;

    if (this.sampleCount === this.settings.samples) {
      return this.captureCompletedFrame();
    }

    return Result.ok(undefined);
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

    this.disableAfterSelfPause('completed');

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

  reset(force = false): void {
    const now = performance.now();
    // Light throttling to avoid rapid resets but still allow responsive
    // updates. A forced reset (model swap) must never be dropped: swallowing
    // it keeps the tracer sampling the PREVIOUS model until the next camera
    // move happens to reset again.
    if (!force && now - this.lastResetTime < 50) { // Don't reset more than once per 50ms
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
    
    // Re-enable autoClear for standard rendering.
    if (this.renderer) {
      const threeRenderer = hasGetInternalRenderer(this.renderer) ? this.renderer.getInternalRenderer() as PathTracingWebGLRenderer : null;
      if (threeRenderer) {
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

    // Note: autoClear is NOT re-enabled here — that causes the screen to
    // clear to white. The renderer's autoClear state is managed by ViewerCore.

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
