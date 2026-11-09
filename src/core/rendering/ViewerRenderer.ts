import * as THREE from 'three';
import { Result } from '../../utils/Result';
import { fitCoverBackgroundToViewport } from './backgroundImageFit';
import { ThreeViewerError, ErrorCode } from '../../errors';
import { ColorGrade, resolveColorGrade } from './colorGrade';
import {
  PostProcessingPipeline,
  PostProcessingConfig,
  anyPostEffectEnabled,
} from './PostProcessingPipeline';

export interface ViewerRendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: WebGLPowerPreference;
  pixelRatio?: number;
  shadowMap?: {
    enabled: boolean;
    type?: THREE.ShadowMapType;
  };
  toneMapping?: {
    type: THREE.ToneMapping;
    exposure: number;
  };
  postProcessing?: {
    bloom?: boolean;
    vignette?: boolean;
    filmGrain?: boolean;
    colorGrade?: ColorGrade;
  };
}

export interface PostProcessingEffects {
  bloom: boolean;
  vignette: boolean;
  filmGrain: boolean;
  colorGrade: boolean | Partial<ColorGrade>;
}

const MAX_POST_PROCESSED_PIXEL_RATIO = 2;

export class ViewerRenderer {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly canvas?: HTMLCanvasElement;
  private postPipeline: PostProcessingPipeline | null = null;
  private requestedPixelRatio = 1;
  private postLoadErrorHandler?: (error: unknown) => void;

  constructor(canvas?: HTMLCanvasElement) {
    this.canvas = canvas;
  }

  setPostProcessingErrorHandler(handler: (error: unknown) => void): void {
    this.postLoadErrorHandler = handler;
  }

  initialize(options: ViewerRendererOptions): Result<void> {
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
        if (options.shadowMap.type !== undefined) {
          this.renderer.shadowMap.type = options.shadowMap.type;
        }
      }

      if (options.toneMapping) {
        this.renderer.toneMapping = options.toneMapping.type;
        this.renderer.toneMappingExposure = options.toneMapping.exposure;
      }

      const postConfig: PostProcessingConfig = {
        bloom: options.postProcessing?.bloom ?? false,
        vignette: options.postProcessing?.vignette ?? false,
        filmGrain: options.postProcessing?.filmGrain ?? false,
        colorGrade: options.postProcessing?.colorGrade ?? null,
      };
      this.requestedPixelRatio = options.pixelRatio ?? window.devicePixelRatio;
      this.applyPixelRatioFor(postConfig);

      if (this.canvas) {
        const { clientWidth, clientHeight } = this.canvas.parentElement || this.canvas;
        if (clientWidth && clientHeight) {
          this.renderer.setSize(clientWidth, clientHeight);
        }
      }

      this.renderer.outputColorSpace = THREE.SRGBColorSpace;

      this.postPipeline = this.createPipelineFor(this.renderer, postConfig);

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

  render(scene: THREE.Scene, camera: THREE.Camera): Result<void> {
    if (!this.renderer) {
      return Result.err(
        new ThreeViewerError(
          'Renderer not initialized',
          ErrorCode.RENDERER_NOT_INITIALIZED
        )
      );
    }

    try {
      this.fitBackgroundToDrawingBuffer(scene, this.renderer);
      this.renderer.render(scene, camera);
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

  renderPostProcessed(scene: THREE.Scene, camera: THREE.Camera): Result<void> {
    if (!this.postPipeline || !this.renderer) {
      return this.render(scene, camera);
    }
    try {
      this.fitBackgroundToDrawingBuffer(scene, this.renderer);
      const applied = this.postPipeline.render(scene, camera);
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

  private fitBackgroundToDrawingBuffer(scene: THREE.Scene, renderer: THREE.WebGLRenderer): void {
    const canvas = renderer.domElement;
    fitCoverBackgroundToViewport(scene, canvas.width / canvas.height);
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

  setPostProcessing(effects: PostProcessingEffects): void {
    if (!this.renderer) {
      return;
    }
    const config: PostProcessingConfig = {
      bloom: effects.bloom,
      vignette: effects.vignette,
      filmGrain: effects.filmGrain,
      colorGrade: resolveColorGrade(effects.colorGrade) ?? null,
    };

    this.postPipeline?.dispose();
    this.applyPixelRatioFor(config);
    this.postPipeline = this.createPipelineFor(this.renderer, config);
  }

  private applyPixelRatioFor(config: PostProcessingConfig): void {
    if (anyPostEffectEnabled(config)) {
      this.renderer?.setPixelRatio(Math.min(this.requestedPixelRatio, MAX_POST_PROCESSED_PIXEL_RATIO));
      return;
    }
    this.renderer?.setPixelRatio(this.requestedPixelRatio);
  }

  private createPipelineFor(
    renderer: THREE.WebGLRenderer,
    config: PostProcessingConfig
  ): PostProcessingPipeline | null {
    if (!anyPostEffectEnabled(config)) {
      return null;
    }
    return new PostProcessingPipeline(renderer, config, (error) => this.postLoadErrorHandler?.(error));
  }

  getDomElement(): HTMLCanvasElement {
    if (!this.renderer) {
      throw new Error('Renderer not initialized');
    }
    return this.renderer.domElement;
  }

  getWebGLRenderer(): THREE.WebGLRenderer | null {
    return this.renderer;
  }

  getMaxTextureSize(): number {
    return this.renderer?.capabilities.maxTextureSize ?? 0;
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
}
