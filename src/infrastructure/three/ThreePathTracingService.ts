import { WebGLPathTracer } from 'three-gpu-pathtracer';
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
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
import { CONTACT_SHADOW_HELPER_FLAG, PATH_TRACING_FLOOR_FLAG } from './ContactShadowBaker';

export class ThreePathTracingService implements IPathTracingService {
  /**
   * Hand the scene to the path tracer with the raster-only contact-shadow
   * helpers hidden and the tracer-only ground floor shown. The `ShadowMaterial`
   * catcher (and the baked disc) are raster shadow-map tricks the tracer can't
   * use — ingesting them double-darkens or floats the contact area — so they're
   * hidden; the PATH_TRACING_FLOOR_FLAG disc is the mirror image, a real matte
   * surface kept invisible in the raster view and flipped on only here so the
   * tracer has something physical to cast a contact shadow onto (otherwise the
   * model floats in the traced render). The generator only reads currently-
   * visible nodes, and both sets are restored right after the ingest so the
   * raster fallback keeps its clean invisible-floor look.
   */
  private ingestSceneWithoutShadowHelpers(
    threeScene: THREE.Scene,
    threeCamera: THREE.Camera
  ): void {
    // Tag-based (not name-based): a consumer's GLB may legitimately contain a
    // node with any name, and getObjectByName's first depth-first match would
    // hide that node instead of the helper. The userData tag is viewer-owned.
    const hideForIngest: THREE.Object3D[] = [];
    const showForIngest: THREE.Object3D[] = [];
    threeScene.traverse((object) => {
      if (object.userData?.[CONTACT_SHADOW_HELPER_FLAG] && object.visible) {
        hideForIngest.push(object);
      } else if (object.userData?.[PATH_TRACING_FLOOR_FLAG] && !object.visible) {
        showForIngest.push(object);
      }
    });
    hideForIngest.forEach((object) => (object.visible = false));
    showForIngest.forEach((object) => (object.visible = true));
    try {
      this.pathTracer?.setScene(threeScene, threeCamera);
    } finally {
      hideForIngest.forEach((object) => (object.visible = true));
      showForIngest.forEach((object) => (object.visible = false));
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
  // Converted-for-the-tracer copy of an image-backed equirect, reused across
  // re-ingests. Keyed by the source texture's uuid: a runtime environment
  // switch must not hand the tracer the PREVIOUS environment's conversion.
  private convertedEnvTexture: THREE.DataTexture | null = null;
  private convertedEnvSourceUuid: string | null = null;
  private resumable: boolean = false;
  private lastCameraMoveTime: number = -Infinity;
  private cameraDirty: boolean = false;
  public readonly events = new TypedEventEmitter<{ 'pathtracing:paused': PathTracingPausedEvent }>();

  // Startup dissolve: the first path-traced samples are near-random noise
  // (salt-and-pepper + fireflies), so instead of slamming that over the clean
  // raster frame we snapshot the raster the moment accumulation starts and fade
  // it out over the tracer as it resolves — the ugly early samples stay hidden
  // under the still-opaque snapshot and only the converged image shows through.
  private rasterFadeTarget: THREE.WebGLRenderTarget | null = null;
  private fadeQuad: FullScreenQuad | null = null;
  private fadeToneMapping: THREE.ToneMapping | null = null;
  private fadeSupported = true;

  /**
   * How long the camera must rest before accumulation (re)starts. While it
   * moves, every frame is a plain raster render: presenting path-traced
   * samples mid-motion draws each one against a different camera, which
   * smears the model into torn slivers during turntable spins and drags.
   */
  private static readonly CAMERA_SETTLE_MS = 200;

  /** Samples over which the raster snapshot fades out (full path-traced image
   * by here). Sized so the dissolve completes only once the tracer has resolved
   * enough that its noise never shows at high opacity (~1.2s of accumulation). */
  private static readonly FADE_SAMPLES = 256;

  /** The raster snapshot is held fully opaque for this many opening samples
   * (the noisiest ones) before the dissolve begins to ease it out. */
  private static readonly FADE_HOLD_SAMPLES = 4;

  /** While the tracer is still grainy the path-traced layer is capped to this
   * opacity (a faint preview over the dominant raster), so its noise never
   * reads at more than this level — it only opens to full once resolved. */
  private static readonly FADE_PREVIEW_OPACITY = 0.3;

  /** Fraction of the fade spent grainy (path-traced layer held at the preview
   * cap); past it the layer releases from the cap to fully opaque. */
  private static readonly FADE_RELEASE_FRACTION = 0.5;

  constructor() {
    this.settings = {
      samples: DEFAULT_PATH_TRACING_SAMPLES,
      bounces: 4, // Reduce bounces for better performance
      transmissiveBounces: 2, // Reduce transmissive bounces
      renderScale: 1, // Start with lower resolution for better performance
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

      // Env intensity and tone mapping are inherited from the scene/renderer,
      // NOT overridden here: three-gpu-pathtracer reads scene.environmentIntensity
      // on ingest and shares the renderer's tone-mapping operator + exposure, so
      // the converged frame matches the raster preview. (Two dead overrides were
      // removed: a `pathTracer.environmentIntensity = 2.0` assignment the tracer
      // never reads — it exposes no such accessor, and its `!== undefined` guard
      // was false anyway — and a paired exposure=1.5 block whose
      // `toneMapping !== ACES` guard was always false.)

      // autoClear stays ON: the accumulation blit manages its own clear state
      // per pass (accumulateOneSample), while every raster fallback frame —
      // the env-wait period, the motion settle window — must clear normally.
      // A global autoClear=false here stacked those raster frames over each
      // other, smearing any camera motion into torn slivers.

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
      // An explicit disable is the consumer's decision — camera moves must
      // not silently re-arm it the way they resume a completed accumulation.
      this.resumable = false;
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
    // A completed accumulation keeps the tracer and its ingested scene warm,
    // so a later camera move can resume it cheaply. Give-up paths hold
    // nothing worth resuming (no renderer, no usable environment) — re-arming
    // those would just replay the same futile wait on every interaction.
    this.resumable = reason === 'completed';
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

      if (originalEnvTexture && (originalEnvTexture as THREE.CubeTexture).isCubeTexture) {
        // A cube-captured environment (the procedural studio room): the
        // tracer converts cube maps to the equirectangular layout it needs
        // by itself — hand it the cube in place of the unreadable PMREM.
        const currentEnv = threeScene.environment;
        threeScene.environment = originalEnvTexture;
        try {
          this.ingestSceneWithoutShadowHelpers(threeScene, threeCamera);
          this.sceneInitialized = true;
        } finally {
          threeScene.environment = currentEnv;
        }
      } else if (originalEnvTexture && originalEnvTexture.mapping === THREE.EquirectangularReflectionMapping) {
        // Use the original equirectangular texture for path tracing, converting
        // an HTMLImageElement-backed texture to a DataTexture the tracer can read.
        let textureForPathTracing: THREE.Texture = originalEnvTexture;
        if (originalEnvTexture.image instanceof HTMLImageElement) {
          if (this.convertedEnvTexture && this.convertedEnvSourceUuid === originalEnvTexture.uuid) {
            textureForPathTracing = this.convertedEnvTexture;
          } else {
            this.convertedEnvTexture?.dispose();
            this.convertedEnvTexture = null;
            this.convertedEnvSourceUuid = null;
            const dataTexture = this.convertToDataTexture(originalEnvTexture);
            if (!dataTexture) {
              throw new Error('Failed to convert environment texture to DataTexture');
            }
            this.convertedEnvTexture = dataTexture;
            this.convertedEnvSourceUuid = originalEnvTexture.uuid;
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

    // A moving camera shows the raster frame just drawn and nothing else —
    // accumulation (and its preview) only engages once the camera rests.
    // Presenting samples mid-motion draws each one against a different
    // camera, smearing the model apart during turntable spins and drags.
    if (performance.now() - this.lastCameraMoveTime < ThreePathTracingService.CAMERA_SETTLE_MS) {
      return Result.ok(undefined);
    }

    // The camera moved since the last accumulation: sync it into the tracer
    // exactly once, now that it is at rest. Doing this every motion frame
    // (rather than at rest) left tracer and renderer state fighting each
    // other and corrupted the raster fallback into near-blank frames.
    if (this.cameraDirty) {
      this.cameraDirty = false;
      this.pathTracer?.updateCamera();
    }

    // Startup dissolve: snapshot the clean raster the instant accumulation
    // (re)starts. Guarded and cosmetic — a snapshot failure just disables the
    // fade for the session, it must never break the render (unlike the
    // accumulation below, whose failures are real and propagate).
    if (this.fadeSupported && this.sampleCount === 0) {
      this.runFadeStep(() => this.captureRasterFade(renderer, scene, camera));
    }

    this.accumulateOneSample();
    this.sampleCount++;

    // Dissolve the raster out as the tracer resolves.
    if (this.fadeSupported && this.sampleCount < ThreePathTracingService.FADE_SAMPLES) {
      const rasterOpacity = 1 - this.pathTracedLayerOpacity(this.sampleCount);
      this.runFadeStep(() => this.renderRasterFade(rasterOpacity));
    }

    if (this.sampleCount === this.settings.samples) {
      return this.captureCompletedFrame();
    }

    return Result.ok(undefined);
  }

  /** Run a cosmetic dissolve step, disabling the dissolve for the rest of the
   * session if it throws — it must never take the render down with it. */
  private runFadeStep(step: () => void): void {
    try {
      step();
    } catch (fadeError) {
      console.warn('Path-tracing startup dissolve unavailable; showing samples directly:', fadeError);
      this.fadeSupported = false;
    }
  }

  /** Opacity of the path-traced layer over the raster snapshot as accumulation
   * progresses: 0 for the opening (noisiest) samples, eased up to a low preview
   * cap while the image is still grainy — so the tracer's noise never reads
   * above the cap — then released to fully opaque as it resolves. */
  private pathTracedLayerOpacity(sampleCount: number): number {
    const hold = ThreePathTracingService.FADE_HOLD_SAMPLES;
    const full = ThreePathTracingService.FADE_SAMPLES;
    const cap = ThreePathTracingService.FADE_PREVIEW_OPACITY;
    const release = hold + (full - hold) * ThreePathTracingService.FADE_RELEASE_FRACTION;
    if (sampleCount < release) {
      return cap * ThreePathTracingService.smoothstep(hold, release, sampleCount);
    }
    return cap + (1 - cap) * ThreePathTracingService.smoothstep(release, full, sampleCount);
  }

  private static smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
  }

  /** Render the current raster frame into a linear offscreen target to fade out
   * over the resolving path-traced image. It is captured pre-tone-mapping
   * (three only tone-maps when drawing to the canvas, never to a target), so the
   * fade shader applies the renderer's tone mapping + sRGB itself and the
   * snapshot matches the frame on screen instead of coming out dark. */
  private captureRasterFade(renderer: IRenderer, scene: IScene, camera: ICamera): void {
    const threeRenderer = hasGetInternalRenderer(this.renderer)
      ? (this.renderer.getInternalRenderer() as PathTracingWebGLRenderer)
      : null;
    if (!threeRenderer) {
      return;
    }
    const size = threeRenderer.getDrawingBufferSize(new THREE.Vector2());
    if (!this.rasterFadeTarget) {
      this.rasterFadeTarget = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
      this.rasterFadeTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
    } else if (this.rasterFadeTarget.width !== size.x || this.rasterFadeTarget.height !== size.y) {
      this.rasterFadeTarget.setSize(size.x, size.y);
    }
    const prevTarget = threeRenderer.getRenderTarget();
    threeRenderer.setRenderTarget(this.rasterFadeTarget);
    renderer.render(scene, camera);
    threeRenderer.setRenderTarget(prevTarget);
  }

  /** Composite the captured raster over the on-canvas path-traced frame at the
   * given opacity (1 = pure raster, 0 = fully revealed path tracing). */
  private renderRasterFade(opacity: number): void {
    const threeRenderer = hasGetInternalRenderer(this.renderer)
      ? (this.renderer.getInternalRenderer() as PathTracingWebGLRenderer)
      : null;
    if (!threeRenderer || !this.rasterFadeTarget) {
      return;
    }
    // Rebuild the material if the operator changed (e.g. a preset switch); the
    // exposure is a live uniform so it never needs a rebuild.
    if (!this.fadeQuad || this.fadeToneMapping !== threeRenderer.toneMapping) {
      (this.fadeQuad?.material as THREE.Material | undefined)?.dispose();
      this.fadeToneMapping = threeRenderer.toneMapping;
      this.fadeQuad = new FullScreenQuad(this.createFadeMaterial(threeRenderer.toneMapping));
    }
    const material = this.fadeQuad.material as THREE.ShaderMaterial;
    material.uniforms.tRaster.value = this.rasterFadeTarget.texture;
    material.uniforms.uOpacity.value = opacity;

    const prevAutoClear = threeRenderer.autoClear;
    const prevTarget = threeRenderer.getRenderTarget();
    threeRenderer.setRenderTarget(null);
    threeRenderer.autoClear = false; // blend over the path-traced frame, don't clear it
    try {
      this.fadeQuad.render(threeRenderer);
    } finally {
      // Always restore, even if the quad render throws: a leaked autoClear=false
      // would make every later raster frame stack instead of clear (ghosting).
      threeRenderer.autoClear = prevAutoClear;
      threeRenderer.setRenderTarget(prevTarget);
    }
  }

  /** A fade material that tone-maps + sRGB-encodes a linear snapshot exactly the
   * way the renderer would when drawing to the canvas (mirrors OutputPass), then
   * applies the fade alpha — so the dissolve's first frame matches the on-screen
   * raster instead of the darker un-tone-mapped image. */
  private createFadeMaterial(toneMapping: THREE.ToneMapping): THREE.ShaderMaterial {
    const toneMappingDefine: Record<number, string> = {
      [THREE.LinearToneMapping]: 'LINEAR_TONE_MAPPING',
      [THREE.ReinhardToneMapping]: 'REINHARD_TONE_MAPPING',
      [THREE.CineonToneMapping]: 'CINEON_TONE_MAPPING',
      [THREE.ACESFilmicToneMapping]: 'ACES_FILMIC_TONE_MAPPING',
      [THREE.AgXToneMapping]: 'AGX_TONE_MAPPING',
      [THREE.NeutralToneMapping]: 'NEUTRAL_TONE_MAPPING',
    };
    // No tonemapping_pars/colorspace_pars includes here: three already injects
    // them (and the toneMappingExposure uniform) into a ShaderMaterial's prefix
    // when the renderer has tone mapping on, so re-including them redefines the
    // operators — which real-GPU GLSL rejects (SwiftShader silently tolerated
    // it). We just call the operators + sRGBTransferOETF that the prefix defines.
    const defines: Record<string, string> = {};
    const operator = toneMappingDefine[toneMapping];
    if (operator) {
      defines[operator] = '';
    }
    return new THREE.ShaderMaterial({
      defines,
      uniforms: {
        tRaster: { value: null },
        uOpacity: { value: 1 },
      },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }
      `,
      fragmentShader: `
        uniform sampler2D tRaster;
        uniform float uOpacity;
        varying vec2 vUv;
        void main() {
          vec3 color = texture2D( tRaster, vUv ).rgb;
          #ifdef LINEAR_TONE_MAPPING
            color = LinearToneMapping( color );
          #elif defined( REINHARD_TONE_MAPPING )
            color = ReinhardToneMapping( color );
          #elif defined( CINEON_TONE_MAPPING )
            color = CineonToneMapping( color );
          #elif defined( ACES_FILMIC_TONE_MAPPING )
            color = ACESFilmicToneMapping( color );
          #elif defined( AGX_TONE_MAPPING )
            color = AgXToneMapping( color );
          #elif defined( NEUTRAL_TONE_MAPPING )
            color = NeutralToneMapping( color );
          #endif
          gl_FragColor = vec4( sRGBTransferOETF( vec4( color, 1.0 ) ).rgb, uOpacity );
        }
      `,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
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
   * the canvas and pause. The final image stays on the canvas (kept by the
   * renderer); the tracer and its ingested scene stay warm so a camera move
   * can resume accumulation from the new viewpoint instead of leaving a
   * stale frame frozen on screen.
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

  canResume(): boolean {
    return this.resumable && this.pathTracer !== null && !this.disposed;
  }

  reset(force = false): void {
    this.sampleCount = 0;
    if (!this.pathTracer) {
      return;
    }
    if (force) {
      // Scene contents changed (model swap, pose change) — the ingested
      // geometry is stale, so the next render must re-run setScene().
      this.pathTracer.reset();
      this.sceneInitialized = false;
      return;
    }
    // Camera-only reset: open the settle window (raster-only frames until
    // the camera rests) and mark the tracer's camera stale — it re-syncs via
    // a single updateCamera() when accumulation restarts. No BVH rebuild:
    // a full setScene() per camera move is what originally tore frames
    // apart during turntable rotation.
    this.lastCameraMoveTime = performance.now();
    this.cameraDirty = true;
    this.pathTracer.reset();
    // Don't reset createAttempts here as we want to keep trying
  }

  dispose(): void {
    this.disposed = true;
    this.events.removeAllListeners();

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
      this.convertedEnvSourceUuid = null;
    }

    // Startup-dissolve resources. Only the material is ours to free — NOT the
    // FullScreenQuad's geometry: three shares one module-level fullscreen
    // geometry across every FullScreenQuad (including the post-processing
    // composer's passes), so calling fadeQuad.dispose() would pull it out from
    // under a consumer that also uses PostProcessingPipeline.
    if (this.fadeQuad) {
      (this.fadeQuad.material as THREE.Material).dispose();
      this.fadeQuad = null;
    }
    this.fadeToneMapping = null;
    if (this.rasterFadeTarget) {
      this.rasterFadeTarget.dispose();
      this.rasterFadeTarget = null;
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
