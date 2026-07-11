import { Result } from '../../utils/Result';
import { IScene } from './IScene';
import { ICamera } from './ICamera';
import { IRendererExtension } from './IRendererExtension';

/**
 * Core interface for renderers, independent of rendering engine
 * Extends IRendererExtension to allow controlled access to internal implementation
 */
export interface IRenderer extends IRendererExtension {
  id: string;
  
  initialize(options: IRendererOptions): Result<void>;
  render(scene: IScene, camera: ICamera): Result<void>;

  /**
   * Render the raster view through the opt-in post-processing composer (bloom,
   * vignette, film grain), falling back to a plain render when no effect is
   * enabled or the composer is still loading. Optional: renderers without a
   * post-processing pipeline simply don't implement it.
   */
  renderPostProcessed?(scene: IScene, camera: ICamera): Result<void>;

  setSize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  getPixelRatio(): number;

  /** Live-tunable tone-mapping exposure (applied without a rebuild). */
  setToneMappingExposure(exposure: number): void;

  /**
   * Live-swap the opt-in post-processing effects (applied without a rebuild):
   * rebuilds the composer pipeline for the new set, or drops back to the plain
   * zero-cost render path when every effect is off. Optional, like
   * `renderPostProcessed`.
   */
  setPostProcessing?(effects: IPostProcessingEffects): void;

  getDomElement(): HTMLCanvasElement;
  getContext(): WebGLRenderingContext | WebGL2RenderingContext | null;

  dispose(): void;

  /** Whether dispose() has already torn down the underlying rendering context. */
  isDisposed(): boolean;

  // Renderer capabilities
  capabilities: IRendererCapabilities;
}

/** Raw opt-in post-effect toggles, in the shape the public options express them. */
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
  /** Opt-in post-processing effects (default all off). */
  postProcessing?: {
    bloom?: boolean;
    vignette?: boolean;
    filmGrain?: boolean;
    /** Resolved contrast + saturation grade amounts, or absent when off. */
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