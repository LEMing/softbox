import * as THREE from 'three';
import {
  IRenderer,
  IRendererOptions,
  IRendererCapabilities
} from '../../core/interfaces/IRenderer';
import { IScene } from '../../core/interfaces/IScene';
import { ICamera } from '../../core/interfaces/ICamera';
import { Result } from '../../utils/Result';
import { ThreeSceneAdapter } from './ThreeScene';
import { ThreeCameraAdapter } from './ThreeCamera';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { generateUUID } from '../../utils/uuid';
import { PostProcessingPipeline, anyPostEffectEnabled } from './postprocessing/PostProcessingPipeline';

/**
 * Adapter for Three.js WebGLRenderer to implement IRenderer
 */
export class ThreeRendererAdapter implements IRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private _id: string = generateUUID();
  private canvas?: HTMLCanvasElement;
  private postPipeline: PostProcessingPipeline | null = null;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  get id(): string {
    return this._id;
  }

  initialize(options: IRendererOptions): Result<void> {
    try {
      // Create renderer with options
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: options.antialias ?? true,
        alpha: options.alpha ?? false,
        premultipliedAlpha: options.premultipliedAlpha ?? true,
        preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
        powerPreference: options.powerPreference ?? 'default',
      });


      // Configure shadow map
      if (options.shadowMap) {
        this.renderer.shadowMap.enabled = options.shadowMap.enabled;
        this.renderer.shadowMap.autoUpdate = true; // Important for dynamic shadows
        if (options.shadowMap.type) {
          const shadowMapTypes = {
            'basic': THREE.BasicShadowMap,
            'pcf': THREE.PCFShadowMap,
            'pcfsoft': THREE.PCFSoftShadowMap,
            'vsm': THREE.VSMShadowMap,
          };
          this.renderer.shadowMap.type = shadowMapTypes[options.shadowMap.type] ;
        }
      }

      // Configure tone mapping
      if (options.toneMapping) {
        const toneMappingTypes = {
          'none': THREE.NoToneMapping,
          'linear': THREE.LinearToneMapping,
          'reinhard': THREE.ReinhardToneMapping,
          'cineon': THREE.CineonToneMapping,
          'aces': THREE.ACESFilmicToneMapping,
          'agx': THREE.AgXToneMapping,
          // Khronos PBR Neutral: rolls highlights off filmically while
          // preserving material hue/saturation (unlike ACES, which desaturates
          // bright values toward white) — the default for this product viewer.
          'neutral': THREE.NeutralToneMapping,
        };
        this.renderer.toneMapping = toneMappingTypes[options.toneMapping.type];
        this.renderer.toneMappingExposure = options.toneMapping.exposure;
      }

      // Set pixel ratio. Post-processing is fragment-bound (a bloom pass runs a
      // full-screen shader per pixel), so on a HiDPI display it does 4-9x the
      // work; cap the ratio at 2 when any effect is on to keep it affordable on
      // mobile.
      const postConfig = {
        bloom: options.postProcessing?.bloom ?? false,
        vignette: options.postProcessing?.vignette ?? false,
        filmGrain: options.postProcessing?.filmGrain ?? false,
        colorGrade: options.postProcessing?.colorGrade ?? null,
      };
      const postEnabled = anyPostEffectEnabled(postConfig);
      const requestedRatio = options.pixelRatio ?? window.devicePixelRatio;
      this.renderer.setPixelRatio(postEnabled ? Math.min(requestedRatio, 2) : requestedRatio);

      // Set initial size if canvas has dimensions
      if (this.canvas) {
        const { clientWidth, clientHeight } = this.canvas.parentElement || this.canvas;
        if (clientWidth && clientHeight) {
          this.renderer.setSize(clientWidth, clientHeight);
        }
      }

      // Set output color space to sRGB for correct colors
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      // Build the opt-in post-processing composer when any effect is enabled.
      // It lazy-loads its chunk, so this is cheap and adds no bundle weight for
      // viewers that use no effects.
      if (postEnabled) {
        this.postPipeline = new PostProcessingPipeline(this.renderer, postConfig);
      }

      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to initialize renderer',
          ErrorCode.RENDERER_INIT_FAILED,
          { originalError: error, options }
        )
      );
    }
  }

  render(scene: IScene, camera: ICamera): Result<void> {
    if (!this.renderer) {
      return Result.err(
        new ThreeViewerError(
          'Renderer not initialized',
          ErrorCode.RENDERER_NOT_INITIALIZED
        )
      );
    }

    try {
      // Extract Three.js objects from adapters
      if (!(scene instanceof ThreeSceneAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Scene must be a ThreeSceneAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      if (!(camera instanceof ThreeCameraAdapter)) {
        return Result.err(
          new ThreeViewerError(
            'Camera must be a ThreeCameraAdapter',
            ErrorCode.INVALID_PARAMETER
          )
        );
      }

      const threeScene = scene.getThreeScene();
      const threeCamera = camera.getThreeCamera();

      this.renderer.render(threeScene, threeCamera);
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to render frame',
          ErrorCode.RENDER_FAILED,
          { originalError: error }
        )
      );
    }
  }

  /**
   * Render the raster view through the opt-in post-processing composer. Falls
   * back to a plain render when no effect is enabled or the composer chunk is
   * still loading. The path tracer never routes through here — it calls the
   * plain render(), so its frames stay effect-free.
   */
  renderPostProcessed(scene: IScene, camera: ICamera): Result<void> {
    if (
      !this.postPipeline ||
      !this.renderer ||
      !(scene instanceof ThreeSceneAdapter) ||
      !(camera instanceof ThreeCameraAdapter)
    ) {
      return this.render(scene, camera);
    }
    try {
      const applied = this.postPipeline.render(scene.getThreeScene(), camera.getThreeCamera());
      if (!applied) {
        return this.render(scene, camera);
      }
      return Result.ok(undefined);
    } catch (error) {
      return Result.err(
        new ThreeViewerError(
          'Failed to render frame with post-processing',
          ErrorCode.RENDER_FAILED,
          { originalError: error }
        )
      );
    }
  }

  setSize(width: number, height: number): void {
    if (this.renderer) {
      // Use false as third parameter to prevent style updates that can cause flicker
      this.renderer.setSize(width, height, false);
      this.postPipeline?.setSize(width, height);

      // Manually update canvas style to maintain aspect ratio
      const canvas = this.renderer.domElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
  }

  setPixelRatio(ratio: number): void {
    if (this.renderer) {
      this.renderer.setPixelRatio(ratio);
      // Keep the composer's internal pixel ratio in sync, or its next setSize
      // would scale targets by a stale ratio — a still capture drops to DPR 1
      // before resizing, and a frozen ratio would over-allocate the composer
      // targets (wasted work, and a GPU-limit overflow the size guard misses).
      this.postPipeline?.setPixelRatio(ratio);
    }
  }

  getPixelRatio(): number {
    return this.renderer ? this.renderer.getPixelRatio() : 1;
  }

  setToneMappingExposure(exposure: number): void {
    if (this.renderer) {
      this.renderer.toneMappingExposure = exposure;
    }
  }

  getDomElement(): HTMLCanvasElement {
    if (!this.renderer) {
      throw new Error('Renderer not initialized');
    }
    return this.renderer.domElement;
  }

  getContext(): WebGL2RenderingContext | WebGLRenderingContext {
    if (!this.renderer) {
      throw new Error('Renderer not initialized');
    }
    return this.renderer.getContext();
  }

  get capabilities(): IRendererCapabilities {
    if (!this.renderer) {
      return {
        maxTextureSize: 0,
        maxCubemapSize: 0,
        maxAttributes: 0,
        maxVertexUniforms: 0,
        maxFragmentUniforms: 0,
        maxSamples: 0,
        isWebGL2: false,
      };
    }

    const caps = this.renderer.capabilities;
    return {
      maxTextureSize: caps.maxTextureSize,
      maxCubemapSize: caps.maxCubemapSize,
      maxAttributes: caps.maxAttributes,
      maxVertexUniforms: caps.maxVertexUniforms,
      maxFragmentUniforms: caps.maxFragmentUniforms,
      maxSamples: caps.maxSamples || 0,
      isWebGL2: caps.isWebGL2,
    };
  }

  dispose(): void {
    this.postPipeline?.dispose();
    this.postPipeline = null;
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
  }

  isDisposed(): boolean {
    return this.renderer === null;
  }

  /**
   * Get the internal Three.js renderer
   * Implementation of IRendererExtension interface
   */
  getInternalRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }
  
  // Legacy method for backward compatibility
  getThreeRenderer(): THREE.WebGLRenderer | null {
    return this.getInternalRenderer();
  }
}
