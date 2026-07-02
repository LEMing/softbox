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
  
  setSize(width: number, height: number): void;
  setPixelRatio(ratio: number): void;
  getPixelRatio(): number;

  /** Live-tunable tone-mapping exposure (applied without a rebuild). */
  setToneMappingExposure(exposure: number): void;

  getDomElement(): HTMLCanvasElement;
  getContext(): WebGLRenderingContext | WebGL2RenderingContext | null;
  
  dispose(): void;
  
  // Renderer capabilities
  capabilities: IRendererCapabilities;
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
    type: 'none' | 'linear' | 'reinhard' | 'cineon' | 'aces';
    exposure: number;
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