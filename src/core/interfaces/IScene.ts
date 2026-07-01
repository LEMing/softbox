import { Result } from '../../utils/Result';
import { IObject3D } from './IObject3D';
import { IRendererExtension } from './IRendererExtension';

/**
 * Core interface for 3D scenes, independent of rendering engine
 */
export interface IScene extends IRendererExtension {
  id: string;
  name: string;
  
  add(object: IObject3D): Result<void>;
  remove(object: IObject3D): Result<void>;
  clear(): void;

  /**
   * Dispose every GPU-backed resource held by the scene (geometries, materials,
   * their textures, light shadow maps, and — unless `keepBackgrounds` is set —
   * background/environment textures) and detach all children. Use this for
   * teardown instead of {@link clear}, which only removes children without
   * releasing GPU memory.
   */
  disposeContents(options?: { keepBackgrounds?: boolean }): void;

  traverse(callback: (object: IObject3D) => void): void;

  /** Runtime-tunable environment settings (applied live, no rebuild). */
  setEnvironmentIntensity(intensity: number): void;
  setBackgroundBlurriness(blurriness: number): void;

  // Scene properties
  background: IColor | ITexture | null;
  fog: IFog | null;
  environment: ITexture | null;
}

export interface IColor {
  r: number;
  g: number;
  b: number;
  
  setHex(hex: number): void;
  setRGB(r: number, g: number, b: number): void;
  getHex(): number;
}

export interface ITexture {
  id: string;
  image: HTMLImageElement | ImageData | HTMLCanvasElement | HTMLVideoElement | null;
  needsUpdate: boolean;
  
  dispose(): void;
}

export interface IFog {
  color: IColor;
  near: number;
  far: number;
}