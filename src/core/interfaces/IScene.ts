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
   * their textures, light shadow maps, background/environment textures) and
   * detach all children. Use this for teardown instead of {@link clear}, which
   * only removes children without releasing GPU memory.
   */
  disposeContents(): void;

  traverse(callback: (object: IObject3D) => void): void;
  
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