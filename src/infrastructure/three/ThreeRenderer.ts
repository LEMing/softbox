import * as THREE from 'three';
import {
  IRenderer,
  IRendererOptions,
  IRendererCapabilities,
  IPostProcessingEffects
} from '../../core/interfaces/IRenderer';
import { IScene } from '../../core/interfaces/IScene';
import { ICamera } from '../../core/interfaces/ICamera';
import { Result } from '../../utils/Result';
import { ThreeSceneAdapter } from './ThreeScene';
import { ThreeCameraAdapter } from './ThreeCamera';
import { fitCoverBackgroundToViewport } from './backgroundImageFit';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { generateUUID } from '../../utils/uuid';
import { RendererOptionsConverter, TONE_MAPPING_BY_NAME } from '../converters/RendererOptionsConverter';
import {
  PostProcessingPipeline,
  PostProcessingConfig,
  anyPostEffectEnabled,
} from './postprocessing/PostProcessingPipeline';

export class ThreeRendererAdapter implements IRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private _id: string = generateUUID();
  private canvas?: HTMLCanvasElement;
  private postPipeline: PostProcessingPipeline | null = null;
  private requestedPixelRatio = 1;
  private postLoadErrorHandler?: (error: unknown) => void;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  setPostProcessingErrorHandler(handler: (error: unknown) => void): void {
    this.postLoadErrorHandler = handler;
  }

  get id(): string {
    return this._id;
  }

  initialize(options: IRendererOptions): Result<void> {
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: options.antialias ?? true,
        alpha: options.alpha ?? false,
        premultipliedAlpha: options.premultipliedAlpha ?? true,
        preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
        powerPreference: options.powerPreference ?? 'default',
      });


      if (options.shadowMap) {
        this.renderer.shadowMap.enabled = options.shadowMap.enabled;
        this.renderer.shadowMap.autoUpdate = true;
        if (options.shadowMap.type) {
          const shadowMapTypes = {
            'basic': THREE.BasicShadowMap,
            'pcf': THREE.PCFShadowMap,
            'pcfsoft': THREE.PCFShadowMap,
            'vsm': THREE.VSMShadowMap,
          };
          this.renderer.shadowMap.type = shadowMapTypes[options.shadowMap.type] ;
        }
      }

      if (options.toneMapping) {
        this.renderer.toneMapping = TONE_MAPPING_BY_NAME[options.toneMapping.type];
        this.renderer.toneMappingExposure = options.toneMapping.exposure;
      }

      const postConfig = {
        bloom: options.postProcessing?.bloom ?? false,
        vignette: options.postProcessing?.vignette ?? false,
        filmGrain: options.postProcessing?.filmGrain ?? false,
        colorGrade: options.postProcessing?.colorGrade ?? null,
      };
      const postEnabled = anyPostEffectEnabled(postConfig);
      this.requestedPixelRatio = options.pixelRatio ?? window.devicePixelRatio;
      this.renderer.setPixelRatio(
        postEnabled ? Math.min(this.requestedPixelRatio, 2) : this.requestedPixelRatio
      );

      if (this.canvas) {
        const { clientWidth, clientHeight } = this.canvas.parentElement || this.canvas;
        if (clientWidth && clientHeight) {
          this.renderer.setSize(clientWidth, clientHeight);
        }
      }

      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      if (postEnabled) {
        this.postPipeline = new PostProcessingPipeline(this.renderer, postConfig, (error) =>
          this.postLoadErrorHandler?.(error)
        );
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

      this.fitBackgroundToDrawingBuffer(threeScene, this.renderer);
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
      const threeScene = scene.getThreeScene();
      this.fitBackgroundToDrawingBuffer(threeScene, this.renderer);
      const applied = this.postPipeline.render(threeScene, camera.getThreeCamera());
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

  private fitBackgroundToDrawingBuffer(threeScene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const canvas = renderer.domElement;
    fitCoverBackgroundToViewport(threeScene, canvas.width / canvas.height);
  }

  setSize(width: number, height: number): void {
    if (this.renderer) {
      this.renderer.setSize(width, height, false);
      this.postPipeline?.setSize(width, height);

      const canvas = this.renderer.domElement;
      canvas.style.width = '100%';
      canvas.style.height = '100%';
    }
  }

  setPixelRatio(ratio: number): void {
    if (this.renderer) {
      this.renderer.setPixelRatio(ratio);
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

  setPostProcessing(effects: IPostProcessingEffects): void {
    if (!this.renderer) {
      return;
    }
    const config: PostProcessingConfig = {
      bloom: effects.bloom,
      vignette: effects.vignette,
      filmGrain: effects.filmGrain,
      colorGrade: RendererOptionsConverter.resolveColorGrade(effects.colorGrade) ?? null,
    };

    this.postPipeline?.dispose();
    this.postPipeline = null;

    const postEnabled = anyPostEffectEnabled(config);
    this.renderer.setPixelRatio(
      postEnabled ? Math.min(this.requestedPixelRatio, 2) : this.requestedPixelRatio
    );
    if (postEnabled) {
      this.postPipeline = new PostProcessingPipeline(this.renderer, config, (error) =>
        this.postLoadErrorHandler?.(error)
      );
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

  getInternalRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }
  
  getThreeRenderer(): THREE.WebGLRenderer | null {
    return this.getInternalRenderer();
  }
}
