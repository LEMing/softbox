import { Result } from '../../utils/Result';
import { IObject3D } from './IObject3D';
import { IRendererExtension } from './IRendererExtension';

export interface IScene extends IRendererExtension {
  id: string;
  name: string;
  
  add(object: IObject3D): Result<void>;
  remove(object: IObject3D): Result<void>;
  clear(): void;

  disposeContents(options?: { keepBackgrounds?: boolean }): void;

  traverse(callback: (object: IObject3D) => void): void;
  
  background: IColor | ITexture | null;
  fog: IFog | null;
  environment: ITexture | null;

  setEnvironmentIntensity(intensity: number): void;
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