import { Result } from '../../utils/Result';
import { IScene } from './IScene';
import { ICamera } from './ICamera';
import { IRendererExtension } from './IRendererExtension';

export interface IRenderer extends IRendererExtension {
  id: string;
  
  initialize(options: IRendererOptions): Result<void>;
  render(scene: IScene, camera: ICamera): Result<void>;

  renderPostProcessed?(scene: IScene, camera: ICamera): Result<void>;

  setSize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  getPixelRatio(): number;

  setToneMappingExposure(exposure: number): void;

  setPostProcessing?(effects: IPostProcessingEffects): void;

  setPostProcessingErrorHandler?(handler: (error: unknown) => void): void;

  getDomElement(): HTMLCanvasElement;
  getContext(): WebGLRenderingContext | WebGL2RenderingContext | null;

  dispose(): void;

  isDisposed(): boolean;

  capabilities: IRendererCapabilities;
}

export interface IPostProcessingEffects {
  bloom: boolean;
  vignette: boolean;
  filmGrain: boolean;
  colorGrade: boolean | { contrast?: number; saturation?: number };
}

export interface IRendererOptions {
  antialias?: boolean;
  alpha?: boolean;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  powerPreference?: 'high-performance' | 'low-power' | 'default';
  pixelRatio?: number;
  shadowMap?: {
    enabled: boolean;
    type?: 'basic' | 'pcf' | 'pcfsoft' | 'vsm';
  };
  toneMapping?: {
    type: 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces' | 'agx' | 'neutral';
    exposure: number;
  };
  postProcessing?: {
    bloom?: boolean;
    vignette?: boolean;
    filmGrain?: boolean;
    colorGrade?: { contrast: number; saturation: number };
  };
}

export interface IRendererCapabilities {
  maxTextureSize: number;
  maxCubemapSize: number;
  maxAttributes: number;
  maxVertexUniforms: number;
  maxFragmentUniforms: number;
  maxSamples: number;
  isWebGL2: boolean;
}